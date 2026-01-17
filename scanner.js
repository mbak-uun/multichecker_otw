// =================================================================================
// SCANNER LOGIC
// =================================================================================
// ✅ REFACTORED (2026-01-12): Helper functions moved to core/scanner/
// - DOM helpers: core/scanner/dom-helpers.js
// - State helpers: core/scanner/state.js
// All helper functions are now globally available via window object

// Helper functions used (from core/scanner/dom-helpers.js):
// - ensureDexStatusSpan(cell)
// - setDexErrorBackground(cell)
// - clearDexTickerById(id)
// - setCellTitleByEl(cell, text)
// - appendCellTitleByEl(cell, line)
// - setCellTitleById(id, text)
// - appendCellTitleById(id, line)
// - setPageTitleForRun(running)

// Helper functions used (from core/scanner/state.js):
// - isThisTabScanning()
// - markDexRequestStart()
// - markDexRequestEnd()
// - waitForPendingDexRequests(timeoutMs)
// - getScanRunning() / setScanRunning(value)
// - getAnimationFrameId() / setAnimationFrameId(id)
// - persistRunStateNo()

/**
 * Placeholder function untuk kompatibilitas.
 * Form edit TETAP AKTIF saat scanning untuk memungkinkan user mengubah data.
 * Fungsi simpan akan di-modifikasi agar tidak refresh tabel saat scanning.
 */
function setEditFormState(isScanning) {
    // Intentionally empty - form tetap aktif saat scanning
    // Perubahan akan ditangani oleh fungsi simpan yang sudah di-modifikasi
}

/**
 * Start the scanning process for a flattened list of tokens.
 * - Batches tokens per group (scanPerKoin)
 * - For each token: fetch CEX orderbook → quote DEX routes → compute PNL → update UI
 */
async function startScanner(tokensToScan, settings, tableBodyId) {
    // Batalkan countdown auto-run yang mungkin sedang berjalan saat scan baru dimulai.
    clearInterval(window.__autoRunInterval);
    window.__autoRunInterval = null;
    $('#autoRunCountdown').text('');

    // ✅ VALIDATE: Check Matcha API keys before starting scan
    try {
        if (typeof get0xApiKey === 'function') {
            const testKey = get0xApiKey();
            if (!testKey || testKey === null) {
                // No API keys found - block scan and show error
                if (typeof UIkit !== 'undefined' && UIkit.notification) {
                    UIkit.notification({
                        message: '⚠️ MATCHA API KEYS WAJIB DIISI!<br><br>' +
                            'Aplikasi tidak dapat scan tanpa API key.<br>' +
                            'Silakan tambahkan di menu Settings.<br><br>' +
                            'Get API keys from: <a href="https://dashboard.0x.org" target="_blank">dashboard.0x.org</a>',
                        status: 'danger',
                        timeout: 8000
                    });
                } else if (typeof toast !== 'undefined' && toast.error) {
                    toast.error('⚠️ MATCHA API KEYS WAJIB DIISI! Tambahkan di Settings.', { duration: 5000 });
                }

                console.error('[SCANNER] ⚠️ Cannot start scan - No Matcha API keys configured!');
                console.error('[SCANNER] Get API keys from: https://dashboard.0x.org');

                // Highlight settings button
                $('#SettingConfig').addClass('icon-wrapper');

                return; // Exit - don't start scan
            }
            try { if (window.SCAN_LOG_ENABLED) console.log('[SCANNER] ✅ Matcha API keys validated - scan can proceed'); } catch (_) { }
        }
    } catch (error) {
        console.error('[SCANNER] Error validating Matcha API keys:', error);
    }

    // Ambil konfigurasi scan dari argumen.
    const ConfigScan = settings;
    // Dapatkan mode aplikasi saat ini (multi-chain atau single-chain).
    const mMode = getAppMode();
    let allowedChains = [];
    // Tentukan chain mana saja yang aktif berdasarkan mode.
    if (mMode.type === 'single') {
        allowedChains = [String(mMode.chain).toLowerCase()];
    } else {
        const fm = getFilterMulti();
        allowedChains = (fm.chains && fm.chains.length)
            // Jika ada filter chain, gunakan itu.
            ? fm.chains.map(c => String(c).toLowerCase())
            // Jika tidak, gunakan semua chain dari konfigurasi.
            : Object.keys(CONFIG_CHAINS || {});
    }

    if (!allowedChains || !allowedChains.length) {
        if (typeof toast !== 'undefined' && toast.warning) toast.warning('Tidak ada Chain yang dipilih. Silakan pilih minimal 1 Chain.');
        return;
    }

    // Simpan data setting dan chain aktif ke variabel global untuk diakses oleh fungsi lain.
    window.SavedSettingData = ConfigScan;
    window.CURRENT_CHAINS = allowedChains;

    // Tentukan daftar DEX yang aktif dan "kunci" daftar ini selama proses scan.
    // Ini memastikan struktur kolom tabel tidak berubah di tengah jalan.
    let allowedDexs = [];
    try { allowedDexs = (typeof window.resolveActiveDexList === 'function') ? window.resolveActiveDexList() : []; } catch (_) { allowedDexs = []; }
    try { if (typeof window !== 'undefined') window.__LOCKED_DEX_LIST = (allowedDexs || []).slice(); } catch (_) { }

    // Filter daftar token yang akan dipindai:
    // 1. Token harus berada di salah satu chain yang diizinkan.
    // 2. Token harus memiliki minimal satu DEX yang juga aktif di filter.
    const flatTokens = tokensToScan
        .filter(t => allowedChains.includes(String(t.chain).toLowerCase()))
        .filter(t => {
            try { return (Array.isArray(t.dexs) && t.dexs.some(d => allowedDexs.includes(String(d.dex || '').toLowerCase()))); } catch (_) { return true; }
        });

    // Jika tidak ada token yang lolos filter, hentikan proses dan beri notifikasi.
    if (!flatTokens || flatTokens.length === 0) {
        if (typeof toast !== 'undefined' && toast.info) toast.info('Tidak ada token pada chain terpilih untuk dipindai.');
        return;
    }

    // Siapkan "kerangka" tabel monitoring (header dan semua baris token).
    // Ini penting agar sel-sel tujuan untuk update UI sudah ada sebelum kalkulasi dimulai.
    try {
        const bodyId = tableBodyId || 'dataTableBody';
        if (typeof window.prepareMonitoringSkeleton === 'function') {
            window.prepareMonitoringSkeleton(flatTokens, bodyId);
        } else if (typeof window.renderMonitoringHeader === 'function' && typeof window.computeActiveDexList === 'function') {
            window.renderMonitoringHeader(window.computeActiveDexList());
        }
    } catch (_) { }

    // --- PERSIAPAN STATE & UI SEBELUM SCAN ---

    // === CHECK GLOBAL SCAN LOCK ===
    try {
        const lockCheck = typeof checkCanStartScan === 'function' ? checkCanStartScan() : { canScan: true };

        if (!lockCheck.canScan) {
            // console.warn('[SCANNER] Cannot start scan - locked by another tab:', lockCheck.lockInfo);

            // Show user-friendly notification
            if (typeof toast !== 'undefined' && toast.warning) {
                const lockInfo = lockCheck.lockInfo || {};
                const mode = lockInfo.mode || 'UNKNOWN';
                const ageMin = Math.floor((lockInfo.age || 0) / 60000);
                const ageSec = Math.floor(((lockInfo.age || 0) % 60000) / 1000);
                const timeStr = ageMin > 0 ? `${ageMin}m ${ageSec}s` : `${ageSec}s`;

                toast.warning(
                    `⚠️ SCAN SEDANG BERJALAN!\n\n` +
                    `Mode: ${mode}\n` +
                    `Durasi: ${timeStr}\n\n` +
                    `Tunggu scan selesai atau tutup tab lain yang sedang scanning.`,
                    { timeOut: 5000 }
                );
            }

            // Reset UI state
            $('#startSCAN').prop('disabled', false).text('START').removeClass('uk-button-disabled');
            return; // Exit early - don't start scan
        }
    } catch (e) {
        // console.error('[SCANNER] Error checking global scan lock:', e);
        // On error checking lock, allow scan to proceed
    }

    // === SET GLOBAL SCAN LOCK ===
    try {
        const mode = getAppMode();
        const chainLabel = allowedChains.map(c => String(c).toUpperCase()).join(', ');
        const filterKey = getActiveFilterKey();

        const lockAcquired = typeof setGlobalScanLock === 'function'
            ? setGlobalScanLock(filterKey, {
                tabId: typeof getTabId === 'function' ? getTabId() : null,
                mode: mode.type === 'multi' ? 'MULTICHAIN' : (mode.chain || 'UNKNOWN').toUpperCase(),
                chain: chainLabel
            })
            : true;

        if (!lockAcquired) {
            // console.error('[SCANNER] Failed to acquire global scan lock');
            if (typeof toast !== 'undefined' && toast.error) {
                toast.error('Gagal memulai scan - ada scan lain yang berjalan');
            }
            $('#startSCAN').prop('disabled', false).text('START').removeClass('uk-button-disabled');
            return; // Exit early
        }

        // console.log('[SCANNER] Global scan lock acquired:', filterKey);

        // Set per-tab scanning state (sessionStorage - per-tab isolation)
        if (typeof sessionStorage !== 'undefined') {
            sessionStorage.setItem('TAB_SCANNING', 'YES');
            sessionStorage.setItem('TAB_SCAN_CHAIN', chainLabel);
            sessionStorage.setItem('TAB_SCAN_START', Date.now().toString());
        }

        // Notify TabManager untuk broadcast ke tab lain
        if (window.TabManager && typeof window.TabManager.notifyScanStart === 'function') {
            window.TabManager.notifyScanStart(chainLabel);
            // console.log(`[SCANNER] Tab ${window.getTabId()} started scanning: ${chainLabel}`);
        }
    } catch (e) {
        // console.error('[SCANNER] Error setting scan start state:', e);
    }

    // Set state aplikasi menjadi 'berjalan' (run: 'YES').
    setAppState({ run: 'YES' });
    setPageTitleForRun(true);
    try {
        if (typeof window.updateRunStateCache === 'function') {
            try { window.updateRunStateCache(getActiveFilterKey(), { run: 'YES' }); } catch (_) { }
            // Mark each allowed chain as running to isolate per-chain state
            try { (allowedChains || []).forEach(c => window.updateRunStateCache(`FILTER_${String(c).toUpperCase()}`, { run: 'YES' })); } catch (_) { }
        }
        if (typeof window.updateRunningChainsBanner === 'function') {
            const m = getAppMode();
            const preListed = (m.type === 'single') ? [String(m.chain).toLowerCase()] : (allowedChains || []);
            window.updateRunningChainsBanner(preListed);
        }
        if (typeof window.updateToolbarRunIndicators === 'function') window.updateToolbarRunIndicators();
    } catch (_) { }

    // Update tampilan tombol dan banner.
    $('#startSCAN').prop('disabled', true).text('Running...').addClass('uk-button-disabled');

    // ✅ FIX: Only clear signals on MANUAL scan, not on auto-run
    // This prevents signals from being replaced when AUTO LEVEL re-scans with different orderbook data
    const isAutoRun = (typeof window.AUTORUN_ENABLED !== 'undefined') ? window.AUTORUN_ENABLED : false;
    if (!isAutoRun) {
        // Bersihkan kartu sinyal hanya pada scan manual
        $('#sinyal-container [id^="sinyal"]').empty();
        try { if (window.SCAN_LOG_ENABLED) console.log('[SCANNER] 🗑️  Signals cleared (manual scan)'); } catch (_) { }
    } else {
        try { if (window.SCAN_LOG_ENABLED) console.log('[SCANNER] ♻️  Signals preserved (auto-run)'); } catch (_) { }
    }
    if (typeof window.hideEmptySignalCards === 'function') window.hideEmptySignalCards();

    // Nonaktifkan sebagian besar kontrol UI untuk mencegah perubahan konfigurasi saat scan.
    if (typeof setScanUIGating === 'function') setScanUIGating(true);
    form_off();
    $("#autoScrollCheckbox").show().prop('disabled', false);
    $("#stopSCAN").show().prop('disabled', false);
    $('.statusCheckbox').css({ 'pointer-events': 'auto', 'opacity': '1' }).prop('disabled', false);

    // Kirim notifikasi status 'ONLINE' ke Telegram.
    sendStatusTELE(ConfigScan.nickname, 'ONLINE');

    // Ambil parameter jeda dan kecepatan dari settings.
    // ✅ FIXED: Gunakan CONFIG_UI.SETTINGS.defaults sebagai fallback (bukan hardcoded)
    const configDefaults = (window.CONFIG_UI?.SETTINGS?.defaults) || {};

    let scanPerKoin = parseInt(ConfigScan.scanPerKoin || configDefaults.tokensPerBatch || 3);
    let jedaKoin = parseInt(ConfigScan.jedaKoin || configDefaults.delayPerToken || 200);
    let jedaTimeGroup = parseInt(ConfigScan.jedaTimeGroup || configDefaults.delayBetweenGrup || 400);
    // ✅ NEW: Load delay between DEX directions (CEX→DEX and DEX→CEX)
    let jedaDexDirection = parseInt(ConfigScan.jedaDexDirection || configDefaults.delayPerDexDirection || 150);
    // Jeda tambahan agar urutan fetch mengikuti pola lama (tanpa mengubah logika hasil)
    // Catatan: gunakan nilai dari SETTING_SCANNER
    // - Jeda DEX: per-DEX dari ConfigScan.JedaDexs[dex] (Jeda CEX dihapus)
    // ✅ FIXED: Gunakan configDefaults.timeoutCount untuk timeout
    let speedScan = parseInt(ConfigScan.TimeoutCount || configDefaults.timeoutCount || 10000);

    // Jeda per-DEX untuk rate limiting (dapat di-set via settings, default dari CONFIG_DEXS)
    // User dapat mengatur delay berbeda untuk setiap DEX jika ada rate limit
    // ✅ FIX: Auto-populate dari CONFIG_DEXS[dex].delay jika tidak ada di user settings
    let jedaDexMap = (ConfigScan || {}).JedaDexs || {};

    // ✅ FIX: Normalize keys to lowercase for case-insensitive lookup
    const normalizedJedaDexMap = {};
    Object.keys(jedaDexMap).forEach(key => {
        normalizedJedaDexMap[String(key).toLowerCase()] = jedaDexMap[key];
    });
    jedaDexMap = normalizedJedaDexMap;

    // ✅ REMOVED: Auto-populate from CONFIG_DEXS - delays now exclusively from IndexedDB (JedaDexs)
    try { if (window.SCAN_LOG_ENABLED) console.log('[SCANNER] ✅ DEX Delay Map (from IndexedDB):', jedaDexMap); } catch (_) { }

    // Fungsi helper untuk membuat jeda (delay).
    function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

    // ✅ FIX: Normalize dex name to lowercase before lookup + fallback to global
    const getJedaDex = (dx) => {
        const dexLower = String(dx || '').toLowerCase();
        const delayMs = parseInt(jedaDexMap[dexLower]) || parseInt(jedaDexMap['global']) || 150;
        return delayMs;
    };
    // Fungsi helper untuk memeriksa apakah checkbox posisi (KIRI/KANAN) dicentang.
    const isPosChecked = (val) => $('input[type="checkbox"][value="' + val + '"]').is(':checked');

    /**
     * Memperbarui progress bar dan teks status di UI.
     * @param {number} current - Jumlah item yang sudah diproses.
     * @param {number} total - Jumlah total item.
     * @param {number} startTime - Timestamp awal proses.
     * @param {string} TokenPair - Nama token yang sedang diproses.
     */
    function updateProgress(current, total, startTime, TokenPair) {
        let duration = ((Date.now() - startTime) / 1000 / 60).toFixed(2);
        let progressPercentage = Math.floor((current / total) * 100);
        let progressText = `CHECKING - ${TokenPair} [${current}/${total}] :: Mulai: ${new Date(startTime).toLocaleTimeString()} ~ DURASI [${duration} Menit]`;
        $('#progress-bar').css('width', progressPercentage + '%');
        $('#progress-text').text(progressPercentage + '%');
        $('#progress').text(progressText);
    }

    // `uiUpdateQueue` adalah antrian untuk semua tugas pembaruan UI.
    // Daripada memanipulasi DOM secara langsung setiap kali ada hasil,
    // objek hasil (sukses/error) dimasukkan ke array ini. `processUiUpdates`
    // akan mengambil dari antrian ini dan meng-update UI secara efisien
    // menggunakan `requestAnimationFrame` untuk mencegah browser lag.
    let uiUpdateQueue = [];

    // Pastikan update UI segera dijalankan saat tab kembali aktif (visible).
    try {
        if (typeof window !== 'undefined' && !window.__UI_VIS_LISTENER_SET__) {
            document.addEventListener('visibilitychange', () => {
                try { if (!document.hidden) processUiUpdates(); } catch (_) { }
            });
            window.__UI_VIS_LISTENER_SET__ = true;
        }
    } catch (_) { }

    // Jeda auto-scroll sementara jika pengguna berinteraksi dengan halaman
    // (scroll, klik, dll.) agar tidak mengganggu.
    try {
        if (typeof window !== 'undefined' && !window.__AUTO_SCROLL_SUSPENDER_SET__) {
            const suspend = () => { try { window.__AUTO_SCROLL_SUSPEND_UNTIL = Date.now() + 4000; } catch (_) { } };
            ['wheel', 'touchstart', 'mousedown', 'keydown'].forEach(ev => {
                try { window.addEventListener(ev, suspend, { passive: true }); } catch (_) { }
            });
            window.__AUTO_SCROLL_SUSPENDER_SET__ = true;
        }
    } catch (_) { }

    /**
     * Mengambil data order book dari CEX dengan mekanisme coba ulang (retry).
     * @param {object} token - Objek data token.
     * @param {string} tableBodyId - ID dari tbody tabel.
     * @param {object} options - Opsi tambahan (maxAttempts, delayMs).
     * @returns {Promise<{ok: boolean, data: object|null, error: any}>} Hasil fetch.
     */
    async function fetchCEXWithRetry(token, tableBodyId, options = {}) {
        const maxAttempts = Number(options.maxAttempts) > 0 ? Number(options.maxAttempts) : 3;
        const delayMs = Number(options.delayMs) >= 0 ? Number(options.delayMs) : 400;
        let attempts = 0;
        let lastError = null;
        let lastData = null;

        while (attempts < maxAttempts) {
            // Coba panggil getPriceCEX.
            try {
                const data = await getPriceCEX(token, token.symbol_in, token.symbol_out, token.cex, tableBodyId);
                lastData = data;
                const prices = [
                    data?.priceBuyToken,
                    data?.priceSellToken,
                    data?.priceBuyPair,
                    data?.priceSellPair
                ];
                // Validasi bahwa semua harga yang dibutuhkan adalah angka positif.
                const valid = prices.every(p => Number.isFinite(p) && Number(p) > 0);
                if (valid) {
                    return { ok: true, data };
                }
                lastError = 'Harga CEX tidak lengkap';
            } catch (error) {
                lastError = error;
            }
            // Jika gagal, tunggu sebentar sebelum mencoba lagi.
            attempts += 1;
            if (attempts < maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }
        }
        return { ok: false, data: lastData, error: lastError };
    }

    /**
     * Loop utama yang memproses antrian pembaruan UI (`uiUpdateQueue`).
     * Dijalankan menggunakan `requestAnimationFrame` untuk performa optimal.
     */
    function processUiUpdates() {
        // Jika scan sudah berhenti dan antrian kosong, hentikan loop.
        if (!getScanRunning() && uiUpdateQueue.length === 0) return;

        const start = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        // Increased budget from 8ms to 16ms to process more updates per frame
        // This prevents queue backlog when scanning many rows
        const budgetMs = 16; // aim to keep under one frame @60Hz
        let processed = 0;

        // "Penyapuan keamanan": Finalisasi sel DEX yang melewati batas waktu (timeout)
        // tapi belum di-update statusnya. Ini mencegah sel terjebak di status "Checking".
        try {
            const nowTs = Date.now();
            const cells = document.querySelectorAll('td[data-deadline]');
            cells.forEach(cell => {
                // Cek apakah deadline sudah lewat dan sel belum difinalisasi.
                try {
                    const d = Number(cell.dataset.deadline || 0);
                    const done = String(cell.dataset.final || '') === '1';
                    // Increased buffer from 250ms to 1000ms to allow slower responses to complete
                    if (!done && d > 0 && nowTs - d > 1000) {
                        // CRITICAL FIX: Check if there's a pending update in queue for this cell
                        // Don't force timeout if the result is already queued but not yet processed
                        const cellId = cell.id;
                        let hasPendingUpdate = false;
                        try {
                            hasPendingUpdate = uiUpdateQueue.some(item =>
                                item && (item.id === cellId || item.resultId === cellId)
                            );
                        } catch (_) { }

                        // Skip timeout if update is pending in queue
                        if (hasPendingUpdate) {
                            return; // Let the queued update process normally
                        }

                        const dexName = (cell.dataset.dex || '').toUpperCase() || 'DEX';
                        // stop any lingering ticker for this cell
                        try { clearDexTickerById(cell.id); } catch (_) { }
                        // Paksa finalisasi ke status TIMEOUT.
                        try { cell.classList.add('dex-error'); } catch (_) { }

                        // Standard cell timeout handling (multi-aggregator now uses the same UI)
                        const span = ensureDexStatusSpan(cell);
                        try {
                            span.classList.remove('uk-text-muted', 'uk-text-warning');
                            span.classList.add('uk-text-danger');
                            span.innerHTML = `<span class=\"uk-label uk-label-warning\">TIMEOUT</span>`;
                            span.title = `${dexName}: Request Timeout`;
                        } catch (_) { }

                        try { cell.dataset.final = '1'; delete cell.dataset.checking; delete cell.dataset.deadline; } catch (_) { }
                    }
                } catch (_) { }
            });
        } catch (_) { }

        // Proses item dari antrian selama masih ada dan budget waktu belum habis.
        if (uiUpdateQueue.length > 0) {
            //(`[PROCESS QUEUE] Processing ${uiUpdateQueue.length} items in queue`);
        }
        while (uiUpdateQueue.length) {
            const updateData = uiUpdateQueue.shift();
            if (updateData) {
                // console.log(`[PROCESS ITEM]`, { type: updateData?.type, id: updateData?.id || updateData?.idPrefix + updateData?.baseId });
            }
            // Jika item adalah error, update sel dengan pesan error.
            if (updateData && updateData.type === 'error') {
                const { id, message, swapMessage } = updateData;
                const cell = document.getElementById(id);
                if (cell) {
                    // Skip if already finalized by a successful result
                    try {
                        if (cell.dataset && cell.dataset.final === '1') {
                            processed++;
                            continue;
                        }
                    } catch (_) { }
                    // finalize error: stop ticker, mark final, clear checking/deadline
                    try { clearDexTickerById(id); } catch (_) { }
                    try { cell.dataset.final = '1'; delete cell.dataset.checking; delete cell.dataset.deadline; } catch (_) { }
                    setDexErrorBackground(cell);
                    let statusSpan = ensureDexStatusSpan(cell);
                    if (statusSpan) statusSpan.className = 'dex-status uk-text-danger';
                    statusSpan.classList.remove('uk-text-muted', 'uk-text-warning');
                    statusSpan.classList.add('uk-text-danger');
                    statusSpan.textContent = swapMessage || '[ERROR]';
                    statusSpan.title = message || '';
                }
                // Jika item adalah hasil sukses, panggil DisplayPNL untuk merender hasilnya.
            } else if (updateData) {
                DisplayPNL(updateData);
            }
            processed++;
            const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
            // Jika waktu eksekusi melebihi budget, hentikan dan serahkan ke frame berikutnya.
            if ((now - start) >= budgetMs) break; // yield to next frame
        }

        // Jika halaman tidak terlihat (tab tidak aktif), `requestAnimationFrame` akan dijeda oleh browser.
        // Gunakan `setTimeout` sebagai fallback untuk memastikan UI tetap di-update.
        if (typeof document !== 'undefined' && document.hidden) {
            setTimeout(processUiUpdates, 150);
        } else {
            setAnimationFrameId(requestAnimationFrame(processUiUpdates));
        }
    }

    /**
     * Memproses satu token: mengambil data CEX, lalu memproses semua DEX yang terkait.
     * @param {object} token - Objek data token yang akan diproses.
     * @param {string} tableBodyId - ID dari tbody tabel.
     */
    async function processRequest(token, tableBodyId) {
        if (!allowedChains.includes(String(token.chain).toLowerCase())) return;
        // Skip processing if token has been deleted during scanning
        try {
            const modeNow = getAppMode();
            let stillExists = false;
            if (modeNow.type === 'single') {
                const list = getTokensChain(modeNow.chain);
                stillExists = Array.isArray(list) && list.some(t => String(t.id) === String(token.id));
            } else {
                const list = getTokensMulti();
                stillExists = Array.isArray(list) && list.some(t => String(t.id) === String(token.id));
            }
            if (!stillExists) return; // token removed; do not fetch
        } catch (_) { }
        try {
            // 1. Ambil data harga dari CEX dengan mekanisme retry.
            // OPTIMIZED: Kurangi retry untuk hemat waktu (3→2 attempts, 450→250ms delay)
            const cexResult = await fetchCEXWithRetry(token, tableBodyId, { maxAttempts: 2, delayMs: 250 });
            const DataCEX = cexResult.data || {};

            // ===== AUTO SKIP FEATURE =====
            // Jika pengambilan data CEX gagal, tampilkan warning toast dan SKIP scan DEX
            // (scan DEX tidak akan dilakukan jika CEX tidak ada harga)
            if (!cexResult.ok) {
                if (typeof toast !== 'undefined' && toast.warning) {
                    toast.warning(`⚠️ CEX ${token.cex} gagal - DEX akan di-skip untuk ${token.symbol_in}`, {
                        duration: 3000
                    });
                }
                // Log untuk debugging
                try { if (window.SCAN_LOG_ENABLED) console.warn(`[AUTO SKIP] CEX ${token.cex} failed for ${token.symbol_in}, DEX will be skipped...`); } catch (_) { }
            }

            // ===== AUTO VOLUME FEATURES =====
            // Two separate features:
            // 1. AUTO VOL (checkVOL): Simple volume validation (vol >= modal)
            // 2. AUTO LEVEL (autoVolToggle): Orderbook-based simulation

            const autoVolEnabled = $('#checkVOL').is(':checked');      // AUTO VOL
            const autoLevelEnabled = $('#autoVolToggle').is(':checked'); // AUTO LEVEL

            const autoVolSettings = {
                autoVol: autoVolEnabled,
                autoLevel: autoLevelEnabled,
                levels: parseInt($('#autoVolLevels').val()) || 1
            };

            // Only fetch orderbook if AUTO LEVEL is enabled
            if (autoLevelEnabled && cexResult.ok) {
                try {
                    const cexUpper = String(token.cex).toUpperCase();
                    const cexConfig = CONFIG_CEX[cexUpper];

                    if (cexConfig && cexConfig.ORDERBOOK) {
                        const symbol = String(token.symbol_in || '').toUpperCase();
                        const url = (typeof cexConfig.ORDERBOOK.urlTpl === 'function')
                            ? cexConfig.ORDERBOOK.urlTpl({ symbol })
                            : '';

                        if (url) {
                            const orderbookResponse = await $.getJSON(url);
                            DataCEX.orderbook = (typeof parseOrderbook === 'function')
                                ? parseOrderbook(cexUpper, orderbookResponse)
                                : { asks: [], bids: [] };
                        }
                    }
                } catch (err) {
                    try { if (window.SCAN_LOG_ENABLED) console.warn('[Auto Level] Failed to fetch orderbook:', err); } catch (_) { }
                    // Silently fallback to fixed modal
                }
            }

            // 2. Lanjut ke DEX tanpa jeda CEX terkonfigurasi (fitur dihapus)

            if (token.dexs && Array.isArray(token.dexs)) {
                // 3. Loop untuk setiap DEX yang terkonfigurasi untuk token ini.
                // ✅ OPTIMIZED: Parallel execution with concurrency control (semaphore)
                token.dexs.forEach((dexData) => {
                    // Skip DEX not included in active selection
                    try { if (!allowedDexs.includes(String(dexData.dex || '').toLowerCase())) return; } catch (_) { }
                    // Normalize DEX name to handle aliases (kyberswap->kyber, matcha->0x, etc)
                    let dex = String(dexData.dex || '').toLowerCase();
                    try {
                        if (typeof window !== 'undefined' && window.DEX && typeof window.DEX.normalize === 'function') {
                            dex = window.DEX.normalize(dex);
                        }
                    } catch (_) { }
                    const modalKiri = dexData.left;
                    const modalKanan = dexData.right;

                    // ===== CALCULATE AMOUNT =====
                    // Hitung amount_in berdasarkan harga CEX
                    // Jika CEX gagal, DEX akan di-skip (lihat kondisi shouldSkip di bawah)
                    let amount_in_token, amount_in_pair;

                    if (cexResult.ok && DataCEX.priceBuyToken > 0 && DataCEX.priceBuyPair > 0) {
                        // CEX berhasil, gunakan harga CEX untuk menghitung amount
                        amount_in_token = parseFloat(modalKiri) / DataCEX.priceBuyToken;
                        amount_in_pair = parseFloat(modalKanan) / DataCEX.priceBuyPair;
                    } else {
                        // CEX gagal, set ke 0 (DEX akan di-skip)
                        amount_in_token = 0;
                        amount_in_pair = 0;
                    }

                    /**
                     * Fungsi internal untuk memanggil API DEX untuk satu arah transaksi.
                     * ✅ REFACTORED: Now returns Promise for sequential execution
                     * @param {string} direction - Arah transaksi ('TokentoPair' atau 'PairtoToken').
                     * @returns {Promise<void>}
                     */
                    const callDex = (direction) => {
                        return new Promise((resolve) => {
                            const isKiri = direction === 'TokentoPair';
                            // Periksa apakah posisi (KIRI/KANAN) diaktifkan di UI.
                            if (isKiri && !isPosChecked('Actionkiri')) { resolve(); return; }
                            if (!isKiri && !isPosChecked('ActionKanan')) { resolve(); return; }

                            // ID generation: include token ID for uniqueness
                            const sym1 = isKiri ? String(token.symbol_in || '').toUpperCase() : String(token.symbol_out || '').toUpperCase();
                            const sym2 = isKiri ? String(token.symbol_out || '').toUpperCase() : String(token.symbol_in || '').toUpperCase();
                            const tokenId = String(token.id || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
                            const baseIdRaw = `${String(token.cex).toUpperCase()}_${String(dex).toUpperCase()}_${sym1}_${sym2}_${String(token.chain).toUpperCase()}_${tokenId}`;
                            const baseId = baseIdRaw.replace(/[^A-Z0-9_]/g, '');
                            const idCELL = tableBodyId + '_' + baseId;

                            // Normalisasi alamat kontrak dan desimal, terutama untuk pair 'NON'
                            // agar menggunakan nilai default jika tidak ada.
                            const chainCfgSafe = (window.CONFIG_CHAINS || {})[String(token.chain).toLowerCase()] || {};
                            const pairDefsSafe = chainCfgSafe.PAIRDEXS || {};
                            const nonDef = pairDefsSafe['NON'] || {};
                            const isAddrInvalid = (addr) => !addr || String(addr).toLowerCase() === '0x' || String(addr).length < 6;
                            let scInSafe = isKiri ? token.sc_in : token.sc_out;
                            let scOutSafe = isKiri ? token.sc_out : token.sc_in;
                            let desInSafe = isKiri ? Number(token.des_in) : Number(token.des_out);
                            let desOutSafe = isKiri ? Number(token.des_out) : Number(token.des_in);
                            const symOut = isKiri ? String(token.symbol_out || '') : String(token.symbol_in || '');
                            if (String(symOut).toUpperCase() === 'NON' || isAddrInvalid(scOutSafe)) {
                                if (nonDef && nonDef.scAddressPair) {
                                    scOutSafe = nonDef.scAddressPair;
                                    desOutSafe = Number(nonDef.desPair || desOutSafe || 18);
                                }
                            }

                            // ===== AUTO LEVEL: Calculate Modal & Amount =====
                            // ✅ AUTO LEVEL CONCEPT:
                            // - Fetch orderbook and calculate actual available volume
                            // - Use ACTUAL modal and price from orderbook for simulation
                            // - Show warning ⚠️ if orderbook insufficient
                            let modal, amountIn, avgPriceCEX, autoVolResult = null;

                            if (autoVolSettings.autoLevel && DataCEX.orderbook && cexResult.ok) {
                                // Use Auto Level for actual simulation
                                const side = isKiri ? 'asks' : 'bids';
                                const maxModal = Number(isKiri ? modalKiri : modalKanan) || 0;

                                // 🔍 DEBUG: Auto Level settings and CEX data
                                try { if (window.SCAN_LOG_ENABLED) console.log('🎯 [SCANNER] Auto Level Active (Actual Simulation Mode)'); } catch (_) { }
                                try { if (window.SCAN_LOG_ENABLED) console.log('  Direction:', isKiri ? 'CEX→DEX (TokenToPair)' : 'DEX→CEX (PairToToken)'); } catch (_) { }
                                try { if (window.SCAN_LOG_ENABLED) console.log('  Side:', side); } catch (_) { }
                                try { if (window.SCAN_LOG_ENABLED) console.log('  User Modal (Max):', maxModal); } catch (_) { }
                                try { if (window.SCAN_LOG_ENABLED) console.log('  Auto Level Levels:', autoVolSettings.levels); } catch (_) { }

                                autoVolResult = (typeof calculateAutoVolume === 'function')
                                    ? calculateAutoVolume(DataCEX.orderbook, maxModal, autoVolSettings.levels, side)
                                    : null;

                                // 🔍 DEBUG: Auto Level result
                                try { if (window.SCAN_LOG_ENABLED) console.log('📦 [SCANNER] Auto Level Result:', autoVolResult); } catch (_) { }

                                if (autoVolResult && !autoVolResult.error && autoVolResult.totalCoins > 0) {
                                    // ✅ AUTO LEVEL: ALWAYS use actual values from orderbook for realistic PNL
                                    modal = autoVolResult.actualModal;  // ← Always use ACTUAL modal
                                    avgPriceCEX = autoVolResult.avgPrice;  // ← Always use weighted average price

                                    // Calculate actual amount based on direction
                                    if (isKiri) {
                                        // CEX→DEX (tokentopair): Use totalCoins (TOKEN amount to swap)
                                        amountIn = autoVolResult.totalCoins;
                                    } else {
                                        // DEX→CEX (pairtotoken): Convert actualModal to PAIR amount
                                        const pricePair = DataCEX.priceBuyPair || 1;
                                        amountIn = autoVolResult.actualModal / pricePair;
                                    }

                                    // 🔍 DEBUG: Final values used
                                    try { if (window.SCAN_LOG_ENABLED) console.log('✅ [AUTO LEVEL] Using ACTUAL modal from orderbook:'); } catch (_) { }
                                    try { if (window.SCAN_LOG_ENABLED) console.log('  Modal (for PNL):', modal, '(ACTUAL from orderbook)'); } catch (_) { }
                                    try { if (window.SCAN_LOG_ENABLED) console.log('  Amount In:', amountIn, '(ACTUAL)'); } catch (_) { }
                                    try { if (window.SCAN_LOG_ENABLED) console.log('  Avg Price CEX:', avgPriceCEX, '(weighted average)'); } catch (_) { }

                                    // Show info if actual modal is less than user modal
                                    if (autoVolResult.actualModal < maxModal) {
                                        try { if (window.SCAN_LOG_ENABLED) console.warn('📊 [AUTO LEVEL] Orderbook has less volume than user modal:'); } catch (_) { }
                                        try { if (window.SCAN_LOG_ENABLED) console.warn('  User Modal (Max):', maxModal); } catch (_) { }
                                        try { if (window.SCAN_LOG_ENABLED) console.warn('  Actual Available:', autoVolResult.actualModal); } catch (_) { }
                                        try { if (window.SCAN_LOG_ENABLED) console.warn('  Using actual modal for realistic PNL calculation'); } catch (_) { }
                                    }
                                } else {
                                    // Fallback to user modal if orderbook calculation fails
                                    try { if (window.SCAN_LOG_ENABLED) console.warn('⚠️  [SCANNER] Auto Level fallback to user modal:', autoVolResult?.error || 'No valid result'); } catch (_) { }
                                    modal = maxModal;
                                    amountIn = isKiri ? amount_in_token : amount_in_pair;
                                    avgPriceCEX = isKiri ? DataCEX.priceBuyToken : DataCEX.priceBuyPair;
                                    autoVolResult = null;
                                }
                            } else {
                                // Fixed modal (existing behavior)
                                if (autoVolSettings.autoLevel) {
                                    try { if (window.SCAN_LOG_ENABLED) console.log('⏭️  [SCANNER] Auto Level skipped:'); } catch (_) { }
                                    try { if (window.SCAN_LOG_ENABLED) console.log('  Auto Level Enabled:', autoVolSettings.autoLevel); } catch (_) { }
                                    try { if (window.SCAN_LOG_ENABLED) console.log('  Orderbook Available:', !!DataCEX.orderbook); } catch (_) { }
                                    try { if (window.SCAN_LOG_ENABLED) console.log('  CEX Result OK:', cexResult.ok); } catch (_) { }
                                }
                                modal = Number(isKiri ? modalKiri : modalKanan) || 0;
                                amountIn = isKiri ? amount_in_token : amount_in_pair;
                                avgPriceCEX = isKiri ? DataCEX.priceBuyToken : DataCEX.priceBuyPair;
                            }

                            /**
                             * Memperbarui status visual sel DEX (misal: "Checking...", "ERROR").
                             * @param {string} status - 'checking', 'fallback', 'error', 'failed', 'fallback_error'.
                             * @param {string} dexName - Nama DEX.
                             * @param {string} [message=''] - Pesan tambahan untuk tooltip.
                             */
                            const updateDexCellStatus = (status, dexName, message = '') => {
                                const cell = document.getElementById(idCELL);
                                if (!cell) return;
                                // Do not overwrite if cell already finalized by a prior UPDATE/ERROR
                                try {
                                    if (cell.dataset && cell.dataset.final === '1') {
                                        // NEVER overwrite a finalized cell, regardless of new status
                                        return;
                                    }
                                } catch (_) { }

                                // Standard single-DEX cell handling
                                // Presentation only: spinner for checking, badge for error
                                try { cell.classList.remove('dex-error'); } catch (_) { }
                                let statusSpan = ensureDexStatusSpan(cell);
                                statusSpan.removeAttribute('title');
                                statusSpan.classList.remove('uk-text-muted', 'uk-text-warning', 'uk-text-danger');
                                if (status === 'checking') {
                                    statusSpan.classList.add('uk-text-warning');
                                    statusSpan.innerHTML = `<span class=\"uk-margin-small-right\" uk-spinner=\"ratio: 0.5\"></span>${String(dexName || '').toUpperCase()}`;
                                    try { if (window.UIkit && UIkit.update) UIkit.update(cell); } catch (_) { }
                                    // Build rich header log like example
                                    try {
                                        const chainCfg = (window.CONFIG_CHAINS || {})[String(token.chain).toLowerCase()] || {};
                                        const chainName = (chainCfg.Nama_Chain || token.chain || '').toString().toUpperCase();
                                        const nameIn = String(isKiri ? token.symbol_in : token.symbol_out).toUpperCase();
                                        const nameOut = String(isKiri ? token.symbol_out : token.symbol_in).toUpperCase();
                                        const ce = String(token.cex || '').toUpperCase();
                                        const dx = String(dexName || dex || '').toUpperCase();
                                        const proc = isKiri ? `${ce} ⟹ ${dx}` : `${dx} ⟹ ${ce}`;
                                        const modalVal = Number(isKiri ? modalKiri : modalKanan) || 0;
                                        const toIDR = (v) => { try { return (typeof formatIDRfromUSDT === 'function') ? formatIDRfromUSDT(Number(v) || 0) : ''; } catch (_) { return ''; } };

                                        // Get configured REST API provider for this DEX
                                        let providerInfo = '';
                                        try {
                                            const dexConfig = (window.CONFIG_DEXS || {})[String(dex).toLowerCase()] || {};
                                            const fetchdex = dexConfig.fetchdex || {};
                                            const primary = fetchdex.primary || {};
                                            const strategy = isKiri ? primary.tokentopair : primary.pairtotoken;
                                            if (strategy && String(strategy).toUpperCase() !== dx) {
                                                providerInfo = ` (VIA ${String(strategy).toUpperCase()})`;
                                            }
                                        } catch (_) { }

                                        const header = [
                                            `⏱️  CHECKING DEX...`,
                                            `🌐 ${chainName} | ${isKiri ? '📥 CEX → DEX' : '📤 DEX → CEX'}`,
                                            ``,
                                            `🔄 ROUTE: ${proc}${providerInfo}`,
                                            `💱 PAIR: ${nameIn} → ${nameOut}`,
                                            `💰 MODAL: $${modalVal.toFixed(2)} ${toIDR(modalVal) ? `(${toIDR(modalVal)})` : ''}`
                                        ].filter(Boolean).join('\n');
                                        setCellTitleByEl(cell, header);
                                    } catch (_) { }
                                } else if (status === 'fallback') {
                                    statusSpan.classList.add('uk-text-warning');
                                    statusSpan.innerHTML = `<span class=\"uk-margin-small-right\" uk-spinner=\"ratio: 0.5\"></span>SWOOP`;
                                    // REFACTORED: Tidak menampilkan error message dari primary DEX
                                    // Tooltip tetap menampilkan header info checking saja
                                    try { if (window.UIkit && UIkit.update) UIkit.update(cell); } catch (_) { }
                                } else if (status === 'fallback_error') {
                                    setDexErrorBackground(cell);
                                    statusSpan.classList.remove('uk-text-warning');
                                    statusSpan.classList.add('uk-text-danger');

                                    // ✅ Generate DEX link for manual check
                                    let dexLink = '#';
                                    try {
                                        if (typeof generateDexLink === 'function') {
                                            const scIn = isKiri ? token.sc_in : token.sc_out;
                                            const scOut = isKiri ? token.sc_out : token.sc_in;
                                            const codeChain = CONFIG_CHAINS[token.chain.toLowerCase()]?.Kode_Chain;
                                            dexLink = generateDexLink(
                                                dexName || dex,
                                                token.chain,
                                                codeChain,
                                                isKiri ? token.symbol_in : token.symbol_out,
                                                scIn,
                                                isKiri ? token.symbol_out : token.symbol_in,
                                                scOut
                                            ) || '#';
                                        }
                                    } catch (_) { }

                                    statusSpan.innerHTML = `<span class="uk-label uk-label-warning">TIMEOUT</span> <a href="${dexLink}" target="_blank" rel="noopener" class="uk-link-muted" title="Check swap manually on DEX" style="font-size:0.9em;">🔗</a>`;
                                    // REFACTORED: Tooltip menampilkan error dari fallback saja (bukan primary)
                                    // Message berisi error dari alternatif DEX
                                    if (message) {
                                        statusSpan.title = String(message);
                                        setCellTitleByEl(cell, String(message));
                                        try { const lab = statusSpan.querySelector('.uk-label'); if (lab) lab.setAttribute('title', String(message)); } catch (_) { }
                                    } else {
                                        statusSpan.removeAttribute('title');
                                    }
                                    // Finalize regardless of tab visibility
                                    try { clearDexTickerById(idCELL); } catch (_) { }
                                    try { if (cell.dataset) { cell.dataset.final = '1'; delete cell.dataset.checking; delete cell.dataset.deadline; } } catch (_) { }
                                } else if (status === 'failed') {
                                    // Validation failed before DEX call (e.g., modal/contract/chain code)
                                    setDexErrorBackground(cell);
                                    statusSpan.classList.remove('uk-text-warning');
                                    statusSpan.classList.add('uk-text-danger');
                                    statusSpan.innerHTML = `<span class=\"uk-label uk-label-failed\">FAILED</span>`;
                                    if (message) {
                                        statusSpan.title = String(message);
                                        setCellTitleByEl(cell, String(message));
                                        try { const lab = statusSpan.querySelector('.uk-label'); if (lab) lab.setAttribute('title', String(message)); } catch (_) { }
                                    } else {
                                        statusSpan.removeAttribute('title');
                                    }
                                    // Finalize regardless of tab visibility
                                    try { clearDexTickerById(idCELL); } catch (_) { }
                                    try { if (cell.dataset) { cell.dataset.final = '1'; delete cell.dataset.checking; delete cell.dataset.deadline; } } catch (_) { }
                                } else if (status === 'error') {
                                    setDexErrorBackground(cell);
                                    statusSpan.classList.remove('uk-text-warning');
                                    statusSpan.classList.add('uk-text-danger');

                                    // ✅ Generate DEX link for manual check
                                    let dexLink = '#';
                                    try {
                                        if (typeof generateDexLink === 'function') {
                                            const scIn = isKiri ? token.sc_in : token.sc_out;
                                            const scOut = isKiri ? token.sc_out : token.sc_in;
                                            const codeChain = CONFIG_CHAINS[token.chain.toLowerCase()]?.Kode_Chain;
                                            dexLink = generateDexLink(
                                                dexName || dex,
                                                token.chain,
                                                codeChain,
                                                isKiri ? token.symbol_in : token.symbol_out,
                                                scIn,
                                                isKiri ? token.symbol_out : token.symbol_in,
                                                scOut
                                            ) || '#';
                                        }
                                    } catch (_) { }

                                    statusSpan.innerHTML = `<span class="uk-label uk-label-danger">ERROR</span> <a href="${dexLink}" target="_blank" rel="noopener" class="uk-link-muted" title="Check swap manually on DEX" style="font-size:0.9em;">🔗</a>`;
                                    if (message) {
                                        statusSpan.title = String(message);
                                        setCellTitleByEl(cell, String(message));
                                        // Ensure the visible ERROR/TIMEOUT badge also shows the tooltip itself
                                        try { const lab = statusSpan.querySelector('.uk-label'); if (lab) lab.setAttribute('title', String(message)); } catch (_) { }
                                    } else {
                                        statusSpan.removeAttribute('title');
                                    }
                                    // Finalize regardless of tab visibility
                                    try { clearDexTickerById(idCELL); } catch (_) { }
                                    try { if (cell.dataset) { cell.dataset.final = '1'; delete cell.dataset.checking; delete cell.dataset.deadline; } } catch (_) { }
                                }
                            };

                            /**
                             * Validasi cepat sebelum memanggil API DEX untuk menghindari request yang tidak perlu.
                             * @returns {{ok: boolean, reason?: string}}
                             */
                            const validateDexReadiness = () => {
                                const modal = isKiri ? modalKiri : modalKanan;
                                const amtIn = isKiri ? amount_in_token : amount_in_pair;
                                const chainCfg = CONFIG_CHAINS[String(token.chain).toLowerCase()] || {};
                                // Modal must be > 0
                                if (!(Number(modal) > 0)) return { ok: false, reason: 'Modal tidak valid (<= 0)' };
                                // Amount-in must be > 0
                                if (!(Number(amtIn) > 0)) return { ok: false, reason: 'Amount input tidak valid (<= 0)' };
                                // Chain code must exist (used by DEX link and queries)
                                if (!chainCfg || !chainCfg.Kode_Chain) return { ok: false, reason: 'Kode chain tidak tersedia' };
                                // Basic SC presence (after NON fallback sanitation)
                                if (!scInSafe || !scOutSafe || String(scInSafe).length < 6 || String(scOutSafe).length < 6) return { ok: false, reason: 'Alamat kontrak tidak lengkap' };
                                return { ok: true };
                            };

                            const ready = validateDexReadiness();
                            if (!ready.ok) { updateDexCellStatus('failed', dex, ready.reason); resolve(); return; }


                            /**
                             * Handler yang dijalankan jika panggilan API DEX (atau fallback-nya) berhasil.
                             * @param {object} dexResponse - Respons dari `getPriceDEX` atau `getPriceAltDEX`.
                             * @param {boolean} [isFallback=false] - True jika ini adalah hasil dari fallback.
                             * @param {string} [fallbackSource=''] - Sumber fallback ('DZAP' atau 'SWOOP').
                             */
                            const handleSuccess = (dexResponse, isFallback = false, fallbackSource = '') => {
                                try {
                                    // REFACTORED: Tambahkan info sumber alternatif ke dexResponse
                                    const finalDexRes = isFallback ? {
                                        ...dexResponse,
                                        dexTitle: (dexResponse.dexTitle || dex),
                                        isFallback: true,  // Flag untuk DisplayPNL
                                        fallbackSource: fallbackSource || 'UNKNOWN'
                                    } : dexResponse;
                                    // Panggil `calculateResult` untuk menghitung PNL dan data lainnya.
                                    // ✅ AUTO VOLUME: Separate display price from calculation price
                                    const cexBuyPriceCalc = (autoVolResult && !autoVolResult.error && isKiri)
                                        ? autoVolResult.avgPrice  // PNL: use weighted average
                                        : DataCEX.priceBuyToken;
                                    const cexSellPriceCalc = (autoVolResult && !autoVolResult.error && !isKiri)
                                        ? autoVolResult.avgPrice
                                        : DataCEX.priceSellToken;

                                    // ✅ CRITICAL FIX: Use `modal` (actual modal from Auto Volume), NOT modalKiri/modalKanan (max modal)!
                                    // ✅ CRITICAL FIX #2: Use `amountIn` (actual amount from Auto Volume), NOT amount_in_token/amount_in_pair (based on max modal)!
                                    const update = calculateResult(
                                        baseId, tableBodyId, finalDexRes.amount_out, finalDexRes.FeeSwap,
                                        isKiri ? token.sc_in : token.sc_out, isKiri ? token.sc_out : token.sc_in,
                                        token.cex, modal,  // ✅ FIX: Use `modal` (actualModal when Auto Volume ON)
                                        amountIn,          // ✅ FIX: Use `amountIn` (from Auto Volume OR fixed modal)
                                        cexBuyPriceCalc, cexSellPriceCalc, DataCEX.priceBuyPair, DataCEX.priceSellPair,
                                        isKiri ? token.symbol_in : token.symbol_out, isKiri ? token.symbol_out : token.symbol_in,
                                        isKiri ? DataCEX.feeWDToken : DataCEX.feeWDPair,
                                        dex, token.chain, CONFIG_CHAINS[token.chain.toLowerCase()].Kode_Chain,
                                        direction,
                                        // ✅ FIX: Calculate actual CEX volume for AUTO VOL validation
                                        // TokenToPair: uses volumes_buyToken (CEX buy depth)
                                        // PairToToken: uses volumes_sellToken (CEX sell depth)
                                        (() => {
                                            try {
                                                const volArray = isKiri
                                                    ? (DataCEX.volumes_buyToken || [])
                                                    : (DataCEX.volumes_sellToken || []);
                                                return volArray.reduce((sum, v) => sum + (parseFloat(v?.volume) || 0), 0);
                                            } catch (_) { return 0; }
                                        })(),
                                        finalDexRes
                                    );


                                    // ✅ AUTO VOLUME FEATURES: Inject display data and flags
                                    // Pass both AUTO VOL and AUTO LEVEL flags for validation logic
                                    update.autoVolEnabled = autoVolSettings.autoVol;
                                    update.autoLevelEnabled = autoVolSettings.autoLevel;

                                    // ✅ AUTO LEVEL: Inject orderbook result data
                                    if (autoVolResult && !autoVolResult.error) {
                                        update.autoVolResult = autoVolResult;
                                        update.maxModal = Number(isKiri ? modalKiri : modalKanan) || 0;
                                        // Override CEX price for display with lastLevelPrice
                                        if (isKiri) {
                                            update.cexBuyPriceDisplay = autoVolResult.lastLevelPrice;
                                            try {
                                                if (window.SCAN_LOG_ENABLED) console.log('🎨 [SCANNER] CEX BUY Price Display Override:', {
                                                    originalPrice: DataCEX.priceBuyToken,
                                                    displayPrice: autoVolResult.lastLevelPrice,
                                                    avgPrice: autoVolResult.avgPrice,
                                                    levelsUsed: autoVolResult.levelsUsed
                                                });
                                            } catch (_) { }
                                        } else {
                                            update.cexSellPriceDisplay = autoVolResult.lastLevelPrice;
                                            try {
                                                if (window.SCAN_LOG_ENABLED) console.log('🎨 [SCANNER] CEX SELL Price Display Override:', {
                                                    originalPrice: DataCEX.priceSellToken,
                                                    displayPrice: autoVolResult.lastLevelPrice,
                                                    avgPrice: autoVolResult.avgPrice,
                                                    levelsUsed: autoVolResult.levelsUsed
                                                });
                                            } catch (_) { }
                                        }
                                    }

                                    // Note: Multi-DEX handling (DZAP, LIFI) is now done in DisplayPNL
                                    // The subResults are passed via calculateResult -> update -> DisplayPNL
                                    // Buat log ringkasan untuk console jika diaktifkan.
                                    // Console log summary for this successful check (cleaned)
                                    try {
                                        // Compute DEX USD rate based on direction
                                        const amtIn = isKiri ? amount_in_token : amount_in_pair;
                                        const rate = (Number(finalDexRes.amount_out) || 0) / (Number(amtIn) || 1);
                                        let dexUsd = null;
                                        try {
                                            const stable = (typeof getStableSymbols === 'function') ? getStableSymbols() : ['USDT', 'USDC', 'DAI'];
                                            const baseSym = (typeof getBaseTokenSymbol === 'function') ? getBaseTokenSymbol(token.chain) : '';
                                            const baseUsd = (typeof getBaseTokenUSD === 'function') ? getBaseTokenUSD(token.chain) : 0;
                                            const inSym = String(isKiri ? token.symbol_in : token.symbol_out).toUpperCase();
                                            const outSym = String(isKiri ? token.symbol_out : token.symbol_in).toUpperCase();
                                            if (isKiri) {
                                                // token -> pair: USD per 1 token
                                                if (stable.includes(outSym)) dexUsd = rate;
                                                else if (baseSym && outSym === baseSym && baseUsd > 0) dexUsd = rate * baseUsd;
                                                else dexUsd = rate * (Number(DataCEX.priceBuyPair) || 0); // fallback via CEX
                                            } else {
                                                // pair -> token: USD per 1 token
                                                if (stable.includes(inSym) && rate > 0) dexUsd = 1 / rate;
                                                else if (baseSym && inSym === baseSym && baseUsd > 0 && rate > 0) dexUsd = baseUsd / rate;
                                                else dexUsd = Number(DataCEX.priceSellToken) || 0; // fallback via CEX
                                            }
                                        } catch (_) { dexUsd = null; }

                                        // refactor: removed unused local debug variables (buy/sell/pnl lines)

                                    } catch (_) { }
                                    // Append success details (rich format)
                                    try {
                                        const chainCfg = (window.CONFIG_CHAINS || {})[String(token.chain).toLowerCase()] || {};
                                        const chainName = (chainCfg.Nama_Chain || token.chain || '').toString().toUpperCase();
                                        const ce = String(token.cex || '').toUpperCase();
                                        const dx = String((finalDexRes?.dexTitle) || dex || '').toUpperCase();
                                        // Sumber nilai: jika alternatif dipakai tampilkan 'via DZAP' atau 'via SWOOP'
                                        const viaText = (function () {
                                            try {
                                                if (isFallback === true) {
                                                    // Jika fallback DZAP (memiliki routeTool dari services), tampilkan via DZAP
                                                    if (finalDexRes && typeof finalDexRes.routeTool !== 'undefined') return ' via DZAP';
                                                    // Selain itu fallback dianggap SWOOP
                                                    return ' via SWOOP';
                                                }
                                            } catch (_) { }
                                            return '';
                                        })();
                                        const nameIn = String(isKiri ? token.symbol_in : token.symbol_out).toUpperCase();
                                        const nameOut = String(isKiri ? token.symbol_out : token.symbol_in).toUpperCase();

                                        // ✅ FIX: Gunakan modal dan amountIn dari outer scope, dengan fallback ke nilai max jika tidak tersedia
                                        // modal dan amountIn sudah didefinisikan di line 656 dan diisi di line 685-722
                                        const tooltipModal = Number(modal) || Number(isKiri ? modalKiri : modalKanan) || 0;
                                        const tooltipAmountIn = Number(amountIn) || Number(isKiri ? amount_in_token : amount_in_pair) || 0;

                                        const outAmt = Number(finalDexRes.amount_out) || 0;
                                        const feeSwap = Number(finalDexRes.FeeSwap || 0);

                                        // ✅ FIX: Fee calculation berbeda per arah
                                        // CEX to DEX (isKiri=true): withdraw fee dari CEX
                                        // DEX to CEX (isKiri=false): transfer/deposit fee ke CEX wallet (gas fee)
                                        const feeWD = isKiri ? Number(DataCEX.feeWDToken || 0) : 0;

                                        // ✅ FIX: Untuk DEX to CEX, tambahkan gas transfer fee
                                        // Estimate: transfer gas ~50% dari swap gas (karena transfer lebih simple)
                                        const feeTransfer = !isKiri ? (feeSwap * 0.5) : 0;

                                        const feeTrade = 0.0014 * tooltipModal;

                                        // Harga efektif DEX (USDT/token)
                                        let effDexPerToken = 0;
                                        if (isKiri) {
                                            if (nameOut === 'USDT') effDexPerToken = (tooltipAmountIn > 0) ? (outAmt / tooltipAmountIn) : 0;
                                            else effDexPerToken = (tooltipAmountIn > 0) ? (outAmt / tooltipAmountIn) * Number(DataCEX.priceSellPair || 0) : 0;
                                        } else {
                                            if (nameIn === 'USDT') effDexPerToken = (outAmt > 0) ? (tooltipAmountIn / outAmt) : 0;
                                            else effDexPerToken = (outAmt > 0) ? (tooltipAmountIn / outAmt) * Number(DataCEX.priceBuyPair || 0) : 0;
                                        }
                                        // Total value hasil (USDT)
                                        const totalValue = isKiri
                                            ? outAmt * Number(DataCEX.priceSellPair || 0)
                                            : outAmt * Number(DataCEX.priceSellToken || 0);
                                        const bruto = totalValue - tooltipModal;

                                        // ✅ FIX: Total fee include transfer fee untuk DEX to CEX
                                        const totalFee = feeSwap + feeWD + feeTransfer + feeTrade;
                                        const profitLoss = totalValue - (tooltipModal + totalFee);
                                        const pnlPct = tooltipModal > 0 ? (bruto / tooltipModal) * 100 : 0;
                                        const toIDR = (v) => { try { return (typeof formatIDRfromUSDT === 'function') ? formatIDRfromUSDT(Number(v) || 0) : ''; } catch (_) { return ''; } };
                                        const buyPriceCEX = Number(DataCEX.priceBuyToken || 0);
                                        const buyLine = isKiri
                                            ? `    🛒 Beli di ${ce} @ $${buyPriceCEX.toFixed(6)} → ${tooltipAmountIn.toFixed(6)} ${nameIn}`
                                            : `    🛒 Beli di ${dx} @ ~$${effDexPerToken.toFixed(6)} / ${nameOut}`;
                                        const buyIdrLine = isKiri
                                            ? `    💱 Harga Beli (${ce}) dalam IDR: ${toIDR(buyPriceCEX)}`
                                            : `    💱 Harga Beli (${dx}) dalam IDR: ${toIDR(effDexPerToken)}`;
                                        const sellIdrLine = isKiri
                                            ? `    💱 Harga Jual (${dx}) dalam IDR: ${toIDR(effDexPerToken)}`
                                            : `    💱 Harga Jual (${ce}) dalam IDR: ${toIDR(Number(DataCEX.priceSellToken || 0))}`;
                                        // Header block (selalu tampil di awal tooltip)
                                        const nowStr = (new Date()).toLocaleTimeString();
                                        const viaName = (function () {
                                            try {
                                                // ✅ FIX: Always check routeTool first (for provider transparency)
                                                const routeTool = String(finalDexRes?.routeTool || '').trim();

                                                // ✅ DEBUG: Log routeTool untuk transparansi
                                                try { if (window.SCAN_LOG_ENABLED) console.log(`[SCANNER VIA] DEX: ${dx}, routeTool: "${routeTool}", dexTitle: "${finalDexRes?.dexTitle}"`); } catch (_) { }

                                                if (routeTool && routeTool.length > 0) {
                                                    // Extract provider name after "via" keyword
                                                    // "FLYTRADE via LIFI" → "LIFI"
                                                    // "MATCHA via SWOOP" → "SWOOP"
                                                    // "MATCHA via 1DELTA" → "1DELTA"
                                                    // "ODOS-V3" → "ODOS-V3" (no "via" found, use as-is)
                                                    // "MATCHA" → "MATCHA" (official API, no aggregator)
                                                    const viaMatch = routeTool.match(/via\s+(.+)/i);
                                                    if (viaMatch && viaMatch[1]) {
                                                        // ✅ Has "via" keyword - extract provider name after "via"
                                                        const provider = viaMatch[1].trim().toUpperCase();
                                                        try { if (window.SCAN_LOG_ENABLED) console.log(`[SCANNER VIA] Extracted provider from "${routeTool}": "${provider}"`); } catch (_) { }
                                                        return provider;
                                                    } else {
                                                        // ✅ No "via" keyword - routeTool is the provider itself
                                                        // This handles cases like "ODOS-V3", "MATCHA", "KYBER", etc.
                                                        const provider = routeTool.toUpperCase();
                                                        try { if (window.SCAN_LOG_ENABLED) console.log(`[SCANNER VIA] No 'via' found, using routeTool as provider: "${provider}"`); } catch (_) { }
                                                        return provider;
                                                    }
                                                }
                                                // Fallback compatibility: Check isFallback flag
                                                if (isFallback === true) {
                                                    try { if (window.SCAN_LOG_ENABLED) console.log(`[SCANNER VIA] isFallback=true, returning SWOOP`); } catch (_) { }
                                                    return 'SWOOP';  // Legacy fallback indicator
                                                }
                                            } catch (err) {
                                                console.error(`[SCANNER VIA] Error extracting routeTool:`, err);
                                            }
                                            // ✅ Last resort fallback: use DEX name
                                            try { if (window.SCAN_LOG_ENABLED) console.log(`[SCANNER VIA] No routeTool found, using DEX name: ${dx}`); } catch (_) { }
                                            return dx;  // Default: show DEX name if no routeTool
                                        })();
                                        // ✅ DEBUG: Log final viaName value
                                        try { if (window.SCAN_LOG_ENABLED) console.log(`[SCANNER VIA] Final viaName for tooltip: "${viaName}"`); } catch (_) { }

                                        const prosesLine = isKiri
                                            ? `PROSES : ${ce} => ${dx} (VIA ${viaName})`
                                            : `PROSES : ${dx} => ${ce} (VIA ${viaName})`;

                                        // ✅ DEBUG: Log prosesLine
                                        try { if (window.SCAN_LOG_ENABLED) console.log(`[SCANNER VIA] prosesLine: "${prosesLine}"`); } catch (_) { }

                                        // ✅ ENHANCED TOOLTIP: Clean & informative format
                                        // Format tooltip sesuai request user (clean, tidak terlalu berat)

                                        // Get CEX price info
                                        const cexBuyPrice = isKiri ? buyPriceCEX : Number(DataCEX.priceBuyPair || 0);
                                        const cexSellPrice = !isKiri ? Number(DataCEX.priceSellToken || 0) : 0;
                                        const cexAmount = isKiri ? tooltipAmountIn : outAmt;
                                        const dexEffPrice = Number(effDexPerToken || 0);

                                        // Format IDR prices using formatIDRfromUSDT
                                        const cexPriceIdr = toIDR(isKiri ? cexBuyPrice : cexSellPrice);
                                        const dexPriceIdr = toIDR(dexEffPrice);

                                        // ✅ ENHANCED TOOLTIP: Detailed information
                                        // chainCfg and chainName already declared at line 994-995
                                        const timestamp = nowStr;

                                        // Calculate price difference
                                        const priceDiff = isKiri
                                            ? ((dexEffPrice - cexBuyPrice) / cexBuyPrice * 100)
                                            : ((cexSellPrice - dexEffPrice) / dexEffPrice * 100);

                                        // ✅ FIX: Hanya tampilkan VIA jika viaName berbeda dari DEX name
                                        const showVia = viaName && viaName.toUpperCase() !== dx.toUpperCase();
                                        const prosesText = isKiri
                                            ? `${ce} ⟹ ${dx}${showVia ? ` (VIA ${viaName})` : ''}`
                                            : `${dx} ⟹ ${ce}${showVia ? ` (VIA ${viaName})` : ''}`;

                                        // ✅ FIX: Helper untuk format IDR yang lebih robust
                                        const formatIdrSafe = (v) => {
                                            const idr = toIDR(v);
                                            // Jika N/A atau kosong, return kosong
                                            if (!idr || idr === 'N/A' || idr === 'Rp 0,00') return '';
                                            return idr;
                                        };

                                        const lines = [
                                            `⏰ ${timestamp} | 🌐 ${chainName}`,
                                            `  💰 MODAL: $${tooltipModal.toFixed(2)} ${formatIdrSafe(tooltipModal) ? `(${formatIdrSafe(tooltipModal)})` : ''}`,
                                            `  🔄 PROSES: ${prosesText}`,
                                            `  ━━━━━━━━━━━━━━━━`,
                                            isKiri ? `  📥 INPUT (${ce}):` : `  📥 INPUT (${dx}):`,
                                            isKiri
                                                ? `    • Beli ${nameIn} @ $${cexBuyPrice.toFixed(6)}`
                                                : `    • Beli ${nameIn} @ $${dexEffPrice.toFixed(6)}`,
                                            isKiri
                                                ? `    • Amount: ${tooltipAmountIn.toFixed(6)} ${nameIn}`
                                                : `    • Amount: ${tooltipAmountIn.toFixed(6)} ${nameIn}`,
                                            isKiri
                                                ? `    • Harga (IDR): ${formatIdrSafe(cexBuyPrice) || '-'}`
                                                : `    • Harga (IDR): ${formatIdrSafe(dexEffPrice) || '-'}`,
                                            '',
                                            isKiri ? `  📤 OUTPUT (${dx}):` : `  📤 OUTPUT (${ce}):`,
                                            isKiri
                                                ? `    • Swap Result: ${outAmt.toFixed(6)} ${nameOut}`
                                                : `    • Swap Result: ${outAmt.toFixed(6)} ${nameOut}`,
                                            isKiri
                                                ? `    • Rate: $${dexEffPrice.toFixed(6)} / ${nameIn}`
                                                : `    • Jual @ $${cexSellPrice.toFixed(6)}`,
                                            isKiri
                                                ? `    • Harga (IDR): ${formatIdrSafe(dexEffPrice) || '-'}`
                                                : `    • Harga (IDR): ${formatIdrSafe(cexSellPrice) || '-'}`,
                                            isKiri
                                                ? `    • Total Value: $${totalValue.toFixed(2)}`
                                                : `    • Total Value: $${totalValue.toFixed(2)}`,
                                            '',
                                            `  📊 PRICE ANALYSIS:`,
                                            `    • Price Diff: ${priceDiff >= 0 ? '+' : ''}${priceDiff.toFixed(2)}%`,
                                            `    • Gross PNL: ${bruto >= 0 ? '+' : ''}$${bruto.toFixed(2)} (${pnlPct.toFixed(2)}%)`,
                                            '',
                                            `  💸 FEE BREAKDOWN:`,
                                            `    • Gas Swap: $${feeSwap.toFixed(4)}`,
                                            isKiri ? `    • Withdraw (${ce}): $${feeWD.toFixed(4)}` : null,
                                            !isKiri ? `    • Transfer Fee: $${feeTransfer.toFixed(4)}` : null,
                                            `    • Trading Fee (0.14%): $${feeTrade.toFixed(4)}`,
                                            `    • TOTAL FEE: $${totalFee.toFixed(4)}`,
                                            `  ━━━━━━━━━━━━━━━━━━`,
                                            `  ✨ NET PROFIT: ${profitLoss >= 0 ? '+' : ''}$${profitLoss.toFixed(2)} USDT`,
                                            profitLoss >= 0
                                                ? `       RATE IDR: ${formatIdrSafe(profitLoss) || '-'} ✅`
                                                : `       RATE IDR: -${formatIdrSafe(Math.abs(profitLoss)) || '-'} ❌`,
                                            `  ━━━━━━━━━━━━━━━━━━`
                                        ].filter(Boolean).join('\n');
                                        // ✅ FIX: Simpan tooltip ke update object agar DisplayPNL bisa menggunakannya
                                        update.tooltipText = lines;
                                        // FIX: Gunakan setCellTitleById untuk replace (bukan append) agar tidak ada header [LOG...]
                                        setCellTitleById(idCELL, lines);
                                        try { if (window.SCAN_LOG_ENABLED) console.log(`[TOOLTIP ENHANCED] Updated for ${idCELL}:`, lines); } catch (_) { }
                                        // Force tooltip update for UIkit
                                        try {
                                            const cell = document.getElementById(idCELL);
                                            if (cell && window.UIkit && UIkit.tooltip) {
                                                const tooltip = UIkit.tooltip(cell);
                                                if (tooltip) tooltip.$destroy();
                                                UIkit.tooltip(cell);
                                            }
                                        } catch (_) { }
                                    } catch (_) { }
                                    // Masukkan hasil kalkulasi ke antrian pembaruan UI.
                                    // console.log(`[PUSH TO QUEUE] Pushing update to uiUpdateQueue`, { idCELL, isFallback, type: update.type });
                                    uiUpdateQueue.push(update);
                                    if (!getScanRunning()) {
                                        try {
                                            setAnimationFrameId(requestAnimationFrame(processUiUpdates));
                                        } catch (_) {
                                            try { processUiUpdates(); } catch (_) { }
                                        }
                                    }
                                } finally {
                                    markDexRequestEnd();
                                    resolve(); // ✅ Resolve promise when success handler completes
                                }
                            };

                            /**
                             * Handler yang dijalankan jika panggilan API DEX utama gagal.
                             * @param {object} initialError - Objek error dari `getPriceDEX`.
                             */
                            const handleError = (initialError) => {
                                // debug logs removed
                                const dexConfig = CONFIG_DEXS[dex.toLowerCase()];
                                // Build richer error title with HTTP status code only if not already present
                                let msg = (initialError && initialError.pesanDEX) ? String(initialError.pesanDEX) : 'Unknown Error';
                                const hasPrefix = /\[(HTTP \d{3}|XHR ERROR 200)\]/.test(msg);
                                try {
                                    const code = Number(initialError && initialError.statusCode);
                                    if (!hasPrefix && Number.isFinite(code) && code > 0) {
                                        if (code === 200) msg = `[XHR ERROR 200] ${msg}`;
                                        else msg = `[HTTP ${code}] ${msg}`;
                                    }
                                } catch (_) { }

                                // ❌ REMOVED: allowFallback check (2026-01-12)
                                // CONFIG_DEXS.GLOBAL.allowFallback = false - pure rotation only
                                // All rotation logic handled internally by getPriceDEX() via primary/secondary

                                // Display error with provider/strategy details
                                updateDexCellStatus('error', dex, msg);

                                // ✅ ENHANCEMENT: Add detailed error info with provider/strategy details
                                try {
                                    const nowStr = (new Date()).toLocaleTimeString();
                                    const dxName = String(dex || '').toUpperCase();
                                    const ceName = String(token.cex || '').toUpperCase();

                                    // ✅ Detect if both primary and secondary failed
                                    const bothFailed = initialError && initialError.bothFailed === true;
                                    let providerInfo = '';

                                    if (bothFailed) {
                                        // Both strategies failed - show detailed breakdown
                                        const primaryProv = String(initialError.primaryProvider || 'PRIMARY');
                                        const secondaryProv = String(initialError.fallbackProvider || 'SECONDARY');
                                        const primaryCode = initialError.primaryCode || 'NA';
                                        const secondaryCode = initialError.fallbackCode || 'NA';
                                        providerInfo = `Primary: ${primaryProv} (${primaryCode}) | Secondary: ${secondaryProv} (${secondaryCode})`;
                                    } else if (initialError && initialError.providerName) {
                                        // Single strategy failed
                                        providerInfo = String(initialError.providerName);
                                    } else if (initialError && initialError.strategyUsed) {
                                        // Use strategy key
                                        providerInfo = String(initialError.strategyUsed).toUpperCase();
                                    } else {
                                        // Last resort: use DEX name
                                        providerInfo = dxName;
                                    }

                                    const prosesLine = (direction === 'TokentoPair')
                                        ? `PROSES : ${ceName} => ${dxName} (VIA ${providerInfo})`
                                        : `PROSES : ${dxName} => ${ceName} (VIA ${providerInfo})`;

                                    let s = 'FAILED';
                                    try {
                                        const ts = String(initialError && initialError.textStatus || '').toLowerCase();
                                        if (ts === 'timeout' || /timeout/i.test(String(initialError && initialError.pesanDEX || ''))) s = 'TIMEOUT';
                                    } catch (_) { s = 'FAILED'; }

                                    const codeNum = Number(initialError && initialError.statusCode);
                                    const statusLine = `STATUS DEX : ${s} (KODE ERROR : ${Number.isFinite(codeNum) ? codeNum : 'NA'})`;

                                    // ✅ Build detailed error breakdown
                                    const errorDetails = [];
                                    if (bothFailed) {
                                        errorDetails.push('======================================');
                                        errorDetails.push('⚠️  BOTH STRATEGIES FAILED');
                                        errorDetails.push('======================================');
                                        errorDetails.push(`PRIMARY STRATEGY: ${initialError.primaryStrategy || 'unknown'}`);
                                        errorDetails.push(`  Provider: ${initialError.primaryProvider || 'unknown'}`);
                                        errorDetails.push(`  Error Code: ${initialError.primaryCode || 'NA'}`);
                                        errorDetails.push(`  Error: ${initialError.primaryError || 'unknown'}`);
                                        errorDetails.push('');
                                        errorDetails.push(`SECONDARY STRATEGY: ${initialError.fallbackStrategy || 'unknown'}`);
                                        errorDetails.push(`  Provider: ${initialError.fallbackProvider || 'unknown'}`);
                                        errorDetails.push(`  Error Code: ${initialError.fallbackCode || 'NA'}`);
                                        errorDetails.push(`  Error: ${initialError.fallbackError || 'unknown'}`);
                                    } else if (initialError && initialError.strategyUsed) {
                                        // Add provider details if available
                                        errorDetails.push('');
                                        errorDetails.push(`STRATEGY: ${initialError.strategyUsed}`);
                                        errorDetails.push(`PROVIDER: ${providerInfo}`);
                                    }

                                    const headerBlock = [
                                        '======================================',
                                        `Time: ${nowStr}`,
                                        prosesLine,
                                        statusLine,
                                        ...errorDetails
                                    ].join('\n');

                                    setCellTitleById(idCELL, headerBlock);
                                    try { if (window.SCAN_LOG_ENABLED) console.log(headerBlock); } catch (_) { }
                                } catch (_) { }

                                markDexRequestEnd();
                                resolve(); // ✅ Resolve promise when error handler completes
                            };

                            // Update UI ke status "Checking" sebelum memanggil API.
                            // Include CEX summary in title while checking
                            const fmt6 = v => (Number.isFinite(+v) ? (+v).toFixed(6) : String(v));
                            const cexSummary = `CEX READY BT=${fmt6(DataCEX.priceBuyToken)} ST=${fmt6(DataCEX.priceSellToken)} BP=${fmt6(DataCEX.priceBuyPair)} SP=${fmt6(DataCEX.priceSellPair)}`;
                            updateDexCellStatus('checking', dex, cexSummary);
                            // OPTIMIZED: Scanner timeout mengikuti speedScan setting + buffer
                            // CRITICAL: Scanner window HARUS LEBIH BESAR dari API timeout!
                            // - ODOS: API timeout 4s → scanner window 5.5s (4s + 1.5s buffer)
                            // - Multi-Aggregators: API timeout 8s → scanner window 9.5s (8s + 1.5s buffer)
                            // - Other DEX: API timeout speedScan → scanner window (speedScan + 1.5s buffer)
                            const dexLower = String(dex).toLowerCase();
                            const isOdos = dexLower === 'odos';
                            // ✅ REMOVED: dzap is now REST API provider (single-quote), no longer multi-aggregator
                            const isMultiAggregator = ['swing'].includes(dexLower); // Only SWING still uses multi-aggregator

                            let dexTimeoutWindow;
                            if (isOdos) {
                                // ✅ OPTIMIZED: Reduced from 10s to 5.5s (API timeout 4s + 1.5s buffer)
                                dexTimeoutWindow = 5500;  // 5.5s for ODOS (was 10s - too slow!)
                            } else if (isMultiAggregator) {
                                // ✅ FIX: Multi-aggregators need extended timeout (API 8s + 1.5s buffer)
                                dexTimeoutWindow = 9500;  // 9.5s for SWING only
                                try { if (window.SCAN_LOG_ENABLED) console.log(`⏱️ [${dexLower.toUpperCase()} SCANNER WINDOW] Using extended deadline: ${dexTimeoutWindow}ms`); } catch (_) { }
                            } else {
                                // Use speedScan setting + buffer (not hardcoded!)
                                const apiTimeout = Math.max(speedScan, 1000);  // Match API timeout calculation
                                const buffer = 1500;  // 1.5s buffer (API timeout + buffer > API timeout)
                                dexTimeoutWindow = apiTimeout + buffer;
                            }
                            // Mulai ticker countdown untuk menampilkan sisa detik pada label "Checking".
                            try {
                                const endAt = Date.now() + dexTimeoutWindow;
                                // Stamp a deadline on the cell for a global safety sweeper
                                try { const c = document.getElementById(idCELL); if (c) { c.dataset.deadline = String(endAt); c.dataset.dex = String(dex); c.dataset.checking = '1'; } } catch (_) { }
                                const renderCheck = (secs, cell) => {
                                    const span = ensureDexStatusSpan(cell);
                                    span.innerHTML = `<span class=\"uk-margin-small-right\" uk-spinner=\"ratio: 0.5\"></span>${String(dex || '').toUpperCase()} (${secs}s)`;
                                    try { if (window.UIkit && UIkit.update) UIkit.update(cell); } catch (_) { }
                                };
                                const onEndCheck = () => {
                                    // Timeout will be handled by ticker and safety sweeper in processUiUpdates
                                };
                                // Define lightweight helper locally (reused)
                                const startTicker = (endAt, render, onEnd) => {
                                    try {
                                        window._DEX_TICKERS = window._DEX_TICKERS || new Map();
                                        const key = idCELL + ':ticker';
                                        if (window._DEX_TICKERS.has(key)) { clearInterval(window._DEX_TICKERS.get(key)); window._DEX_TICKERS.delete(key); }
                                        const tick = () => {
                                            const rem = endAt - Date.now();
                                            const secs = Math.max(0, Math.ceil(rem / 1000));
                                            const cell = document.getElementById(idCELL);
                                            if (!cell) { clearDexTickerById(idCELL); return; }
                                            if (cell.dataset && cell.dataset.final === '1') { clearDexTickerById(idCELL); return; }
                                            render(secs, cell);
                                            if (rem <= 0) { clearDexTickerById(idCELL); /*if (typeof onEnd === 'function') onEnd();*/ }
                                        };
                                        const intId = setInterval(tick, 1000);
                                        window._DEX_TICKERS.set(key, intId);
                                        tick();
                                    } catch (_) { }
                                };
                                startTicker(endAt, renderCheck, onEndCheck);
                            } catch (_) { }

                            // Panggil API DEX setelah jeda yang dikonfigurasi.
                            setTimeout(() => {
                                markDexRequestStart();
                                if (!getScanRunning()) {
                                    markDexRequestEnd();
                                    resolve();
                                    return;
                                }
                                getPriceDEX(
                                    scInSafe, desInSafe,
                                    scOutSafe, desOutSafe,
                                    amountIn,  // Use calculated amount from Auto Volume or fixed modal
                                    // ===== AUTO SKIP FEATURE =====
                                    // Jika CEX gagal, gunakan default price pair (1 untuk simplicity)
                                    (cexResult.ok && DataCEX.priceBuyPair > 0) ? DataCEX.priceBuyPair : 1,
                                    dex,
                                    isKiri ? token.symbol_in : token.symbol_out, isKiri ? token.symbol_out : token.symbol_in,
                                    token.cex, token.chain, CONFIG_CHAINS[token.chain.toLowerCase()].Kode_Chain, direction, tableBodyId
                                )
                                    // Panggil handler yang sesuai berdasarkan hasil promise.
                                    .then((dexRes) => { handleSuccess(dexRes); })
                                    .catch((err) => { handleError(err); });
                            }, getJedaDex(dex));
                        }); // ✅ Close Promise constructor
                    };
                    // Jalankan untuk kedua arah: CEX->DEX dan DEX->CEX.
                    // OPTIMASI: Skip fetch jika checkbox Wallet CEX aktif DAN status WD/DP OFF
                    const isWalletCEXChecked = (typeof $ === 'function') ? $('#checkWalletCEX').is(':checked') : false;

                    // Get symbols for skip reason messages
                    const sym1 = String(token.symbol_in || '').toUpperCase();
                    const sym2 = String(token.symbol_out || '').toUpperCase();

                    // CEX→DEX (TokentoPair): User beli TOKEN di CEX → WD TOKEN → Swap di DEX → DP PAIR ke CEX
                    // Required: WD TOKEN dan DP PAIR harus ON
                    // ✅ FIX: Prioritize CEX-specific status from dataCexs
                    const cexDataForSkip = (token.dataCexs && token.cex) ? token.dataCexs[String(token.cex).toUpperCase()] : null;
                    const withdrawToken = (cexDataForSkip && cexDataForSkip.withdrawToken !== undefined) ? cexDataForSkip.withdrawToken : token.withdrawToken;
                    const depositPair = (cexDataForSkip && cexDataForSkip.depositPair !== undefined) ? cexDataForSkip.depositPair : token.depositPair;

                    const shouldSkipTokenToPair = !cexResult.ok ||
                        (isWalletCEXChecked && (withdrawToken === false || depositPair === false));
                    if (!shouldSkipTokenToPair) {
                        // ✅ OPTIMIZED: Fire and forget with concurrency control
                        callDex('TokentoPair'); // Don't await - let semaphore control concurrency
                    } else {
                        // Set status SKIP untuk sel yang di-skip (CEX no price atau Withdraw OFF)
                        const tokenId = String(token.id || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
                        const baseIdRaw = `${String(token.cex).toUpperCase()}_${String(dex).toUpperCase()}_${sym1}_${sym2}_${String(token.chain).toUpperCase()}_${tokenId}`;
                        const baseId = baseIdRaw.replace(/[^A-Z0-9_]/g, '');
                        const idCELL = tableBodyId + '_' + baseId;
                        const cell = document.getElementById(idCELL);
                        if (cell) {
                            try { cell.classList.add('dex-skip'); } catch (_) { }
                            const span = ensureDexStatusSpan(cell);
                            span.className = 'dex-status uk-text-muted';
                            span.innerHTML = `<span class=\"uk-label uk-label-warning\"><< SKIP >></span>`;
                            // Tentukan alasan skip untuk CEX→DEX
                            let skipReason = 'CEX tidak ada harga - DEX di-skip';
                            if (cexResult.ok) {
                                // CEX→DEX butuh: WD TOKEN dan DP PAIR
                                const missing = [];
                                if (withdrawToken === false) missing.push(`WD ${sym1}`);
                                if (depositPair === false) missing.push(`DP ${sym2}`);

                                if (missing.length === 2) {
                                    skipReason = `${missing.join(' & ')} OFF - Complete cycle tidak viable`;
                                } else if (withdrawToken === false) {
                                    skipReason = `WD ${sym1} OFF - Tidak bisa withdraw Token dari CEX`;
                                } else if (depositPair === false) {
                                    skipReason = `DP ${sym2} OFF - Tidak bisa deposit Pair hasil swap ke CEX`;
                                }
                            }
                            span.title = skipReason;
                            try { if (cell.dataset) cell.dataset.final = '1'; } catch (_) { }
                        }
                    }

                    // DEX→CEX (PairtoToken): User WD PAIR dari CEX → Swap di DEX → DP TOKEN hasil swap ke CEX
                    // Required: WD PAIR dan DP TOKEN harus ON
                    // ✅ FIX: Prioritize CEX-specific status from dataCexs
                    const withdrawPair = (cexDataForSkip && cexDataForSkip.withdrawPair !== undefined) ? cexDataForSkip.withdrawPair : token.withdrawPair;
                    const depositToken = (cexDataForSkip && cexDataForSkip.depositToken !== undefined) ? cexDataForSkip.depositToken : token.depositToken;

                    const shouldSkipPairToToken = !cexResult.ok ||
                        (isWalletCEXChecked && (withdrawPair === false || depositToken === false));
                    if (!shouldSkipPairToToken) {
                        // ✅ OPTIMIZED: Fire and forget with concurrency control
                        callDex('PairtoToken'); // Don't await - let semaphore control concurrency
                    } else {
                        // Set status SKIP untuk sel yang di-skip (CEX no price atau Deposit OFF)
                        const sym1Out = String(token.symbol_out || '').toUpperCase();
                        const sym2In = String(token.symbol_in || '').toUpperCase();
                        const tokenId = String(token.id || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
                        const baseIdRaw = `${String(token.cex).toUpperCase()}_${String(dex).toUpperCase()}_${sym1Out}_${sym2In}_${String(token.chain).toUpperCase()}_${tokenId}`;
                        const baseId = baseIdRaw.replace(/[^A-Z0-9_]/g, '');
                        const idCELL = tableBodyId + '_' + baseId;
                        const cell = document.getElementById(idCELL);
                        if (cell) {
                            try { cell.classList.add('dex-skip'); } catch (_) { }
                            const span = ensureDexStatusSpan(cell);
                            span.className = 'dex-status uk-text-muted';
                            span.innerHTML = `<span class=\"uk-label uk-label-warning\"><< SKIP >> </span>`;
                            // Tentukan alasan skip untuk DEX→CEX
                            let skipReason = 'CEX tidak ada harga - DEX di-skip';
                            if (cexResult.ok) {
                                // DEX→CEX butuh: WD PAIR dan DP TOKEN
                                const missing = [];
                                if (withdrawPair === false) missing.push(`WD ${sym1Out}`);
                                if (depositToken === false) missing.push(`DP ${sym2In}`);

                                if (missing.length === 2) {
                                    skipReason = `${missing.join(' & ')} OFF - Complete cycle tidak viable`;
                                } else if (withdrawPair === false) {
                                    skipReason = `WD ${sym1Out} OFF - Tidak bisa withdraw Pair dari CEX`;
                                } else if (depositToken === false) {
                                    skipReason = `DP ${sym2In} OFF - Tidak bisa deposit Token hasil swap ke CEX`;
                                }
                            }
                            span.title = skipReason;
                            try { if (cell.dataset) cell.dataset.final = '1'; } catch (_) { }
                        }
                    }
                }); // ✅ OPTIMIZED: forEach with concurrency control (no await needed)
            }
            // Beri jeda antar token dalam satu grup.
            await delay(jedaKoin);
        } catch (error) {
            // console.error(`Kesalahan saat memproses ${token.symbol_in}_${token.symbol_out}:`, error);
        }
    }

    async function processTokens(tokensToProcess, tableBodyId) {
        // Set flag bahwa scan sedang berjalan dan mulai loop update UI.
        setScanRunning(true);
        setEditFormState(true); // Disable form edit saat scanning
        setAnimationFrameId(requestAnimationFrame(processUiUpdates));

        const startTime = Date.now();
        // Bagi daftar token menjadi beberapa grup kecil.
        const tokenGroups = [];
        for (let i = 0; i < tokensToProcess.length; i += scanPerKoin) {
            tokenGroups.push(tokensToProcess.slice(i, i + scanPerKoin));
        }
        let processed = 0; // track tokens completed across groups

        // --- PROSES UTAMA ---

        // 1. Ambil data harga gas dan kurs USDT/IDR sebelum memulai loop token.
        try {

            $('#progress-bar').css('width', '5%');
            $('#progress-text').text('5%');
        } catch (_) { }
        await feeGasGwei();
        try {
            $('#progress').text('GAS / GWEI CHAINS READY');
            $('#progress-bar').css('width', '8%');
            $('#progress-text').text('8%');
        } catch (_) { }
        await getRateUSDT();

        // 2. Loop melalui setiap grup token.
        for (let groupIndex = 0; groupIndex < tokenGroups.length; groupIndex++) {
            // Jika user menekan STOP, hentikan loop.
            if (!getScanRunning()) { break; }
            const groupTokens = tokenGroups[groupIndex];

            // Jika auto-scroll aktif, scroll ke baris token pertama dari grup saat ini.
            if ($('#autoScrollCheckbox').is(':checked') && groupTokens.length > 0) {
                const first = groupTokens[0];
                const suffix = `DETAIL_${first.cex.toUpperCase()}_${first.symbol_in.toUpperCase()}_${first.symbol_out.toUpperCase()}_${first.chain.toUpperCase()}`.replace(/[^A-Z0-9_]/g, '');
                const fullId = `${tableBodyId}_${suffix}`;
                requestAnimationFrame(() => { // REFACTORED
                    // Respect user interaction: temporarily suspend auto-scroll
                    try { if (window.__AUTO_SCROLL_SUSPEND_UNTIL && Date.now() < window.__AUTO_SCROLL_SUSPEND_UNTIL) return; } catch (_) { }
                    const $target = $('#' + fullId).length ? $('#' + fullId) : $(`[id$="${suffix}"]`).first();
                    if (!$target.length) return;
                    $target.addClass('auto-focus');
                    setTimeout(() => $target.removeClass('auto-focus'), 900);
                    // Prefer explicit monitoring container; fallback to nearest scrollable
                    let $container = $('#monitoring-scroll');
                    if (!$container.length) $container = $target.closest('.uk-overflow-auto');
                    if (!$container.length) return; // do not scroll the main page

                    // If container not scrollable, skip instead of scrolling the body
                    const cEl = $container[0];
                    if (!(cEl.scrollHeight > cEl.clientHeight)) return;

                    const tRect = $target[0].getBoundingClientRect();
                    const cRect = cEl.getBoundingClientRect();
                    // Skip if already fully visible inside container viewport
                    const fullyVisible = (tRect.top >= cRect.top) && (tRect.bottom <= cRect.bottom);
                    if (fullyVisible) return;

                    const desiredTop = (tRect.top - cRect.top) + $container.scrollTop() - (cEl.clientHeight / 2) + ($target[0].clientHeight / 2);
                    $container.animate({ scrollTop: Math.max(desiredTop, 0) }, 200);
                });
            }

            // Proses token-token dalam satu grup secara paralel,
            // dengan jeda kecil antar pemanggilan untuk menghindari rate-limit.
            const jobs = groupTokens.map((token, tokenIndex) => (async () => {
                if (!getScanRunning()) return;
                // OPTIMIZED: Hapus stagger delay (redundant, processRequest sudah ada jedaKoin delay)
                if (!getScanRunning()) return;
                try { await processRequest(token, tableBodyId); } catch (e) { console.error(`Err token ${token.symbol_in}_${token.symbol_out}`, e); }
                // Update progress as each token finishes
                processed += 1;
                updateProgress(processed, tokensToProcess.length, startTime, `${token.symbol_in}_${token.symbol_out}`);
            })());

            // Tunggu semua proses dalam grup selesai.
            await Promise.allSettled(jobs);
            if (!getScanRunning()) break;
            // Beri jeda antar grup.
            if (groupIndex < tokenGroups.length - 1) { await delay(jedaTimeGroup); }
        }

        // --- FINALISASI SETELAH SEMUA TOKEN SELESAI ---

        updateProgress(tokensToProcess.length, tokensToProcess.length, startTime, 'SELESAI');

        // REFACTORED: Tunggu semua request DEX (termasuk fallback) benar-benar selesai.
        //('[FINAL] Waiting for pending DEX requests to settle...');
        await waitForPendingDexRequests(8000);
        if (getActiveDexRequests() > 0) {
            // console.warn(`[FINAL] Continuing with ${activeDexRequests} pending DEX request(s) after timeout window.`);
        }

        // Trigger final processUiUpdates untuk memastikan semua item di queue diproses
        // console.log(`[FINAL] Queue length before final processing: ${uiUpdateQueue.length}`);

        if (uiUpdateQueue.length > 0) {
            // console.log(`[FINAL] Processing remaining ${uiUpdateQueue.length} items in queue...`);

            // Process semua item yang ada di queue
            while (uiUpdateQueue.length > 0) {
                const updateData = uiUpdateQueue.shift();
                if (!updateData) { continue; }
                if (updateData.type === 'error') {
                    const { id, message, swapMessage } = updateData;
                    const cell = document.getElementById(id);
                    if (cell) {
                        try {
                            if (cell.dataset && cell.dataset.final === '1') {
                                continue;
                            }
                        } catch (_) { }
                        try { clearDexTickerById(id); } catch (_) { }
                        try { if (cell.dataset) { cell.dataset.final = '1'; delete cell.dataset.checking; delete cell.dataset.deadline; } } catch (_) { }
                        setDexErrorBackground(cell);
                        const statusSpan = ensureDexStatusSpan(cell);
                        if (statusSpan) {
                            try { statusSpan.className = 'dex-status uk-text-danger'; } catch (_) { }
                            try {
                                statusSpan.classList.remove('uk-text-muted', 'uk-text-warning');
                                statusSpan.classList.add('uk-text-danger');
                            } catch (_) { }
                            statusSpan.textContent = swapMessage || '[ERROR]';
                            statusSpan.title = message || '';
                        }
                    }
                    continue;
                }
                // console.log(`[FINAL PROCESS]`, { idCELL: updateData.idPrefix + updateData.baseId });
                try {
                    DisplayPNL(updateData);
                } catch (e) {
                    // console.error('[FINAL PROCESS ERROR]', e);
                }
            }
            // console.log('[FINAL] All items processed.');
        } else {
            // console.log('[FINAL] No items in queue to process.');
        }

        // Set flag dan hentikan loop UI.
        setScanRunning(false);
        setEditFormState(false); // Placeholder (form tetap aktif saat scanning)
        cancelAnimationFrame(getAnimationFrameId());
        setPageTitleForRun(false);

        // === RELEASE GLOBAL SCAN LOCK ===
        try {
            // Clear global scan lock
            const filterKey = typeof getActiveFilterKey === 'function' ? getActiveFilterKey() : 'FILTER_MULTICHAIN';
            if (typeof clearGlobalScanLock === 'function') {
                clearGlobalScanLock(filterKey);
                // console.log('[SCANNER] Global scan lock released:', filterKey);
            }

            // Clear per-tab scanning state
            if (typeof sessionStorage !== 'undefined') {
                sessionStorage.removeItem('TAB_SCANNING');
                sessionStorage.removeItem('TAB_SCAN_CHAIN');
                sessionStorage.removeItem('TAB_SCAN_START');
            }

            // Notify TabManager untuk broadcast ke tab lain
            if (window.TabManager && typeof window.TabManager.notifyScanStop === 'function') {
                window.TabManager.notifyScanStop();
                // console.log(`[SCANNER] Tab ${window.getTabId()} stopped scanning`);
            }
        } catch (e) {
            // console.error('[SCANNER] Error releasing scan state:', e);
        }

        // Aktifkan kembali UI.
        form_on();
        $("#stopSCAN").hide().prop("disabled", true);
        $('#startSCAN').prop('disabled', false).text('START').removeClass('uk-button-disabled');
        // Release gating via centralized helper
        if (typeof setScanUIGating === 'function') setScanUIGating(false); // REFACTORED
        // Persist run=NO reliably before any potential next action
        await persistRunStateNo();

        // Buka kunci daftar DEX dan refresh header tabel.
        try {
            if (typeof window !== 'undefined') { window.__LOCKED_DEX_LIST = null; }
            if (typeof window.renderMonitoringHeader === 'function' && typeof window.computeActiveDexList === 'function') {
                window.renderMonitoringHeader(window.computeActiveDexList());
            }
        } catch (_) { }

        // Jika auto-run aktif, mulai countdown untuk scan berikutnya.
        // GUARD: Check if autorun feature is enabled in config
        try {
            const autorunFeatureEnabled = (window.CONFIG_APP?.APP?.AUTORUN !== false);
            const autorunUserEnabled = (window.AUTORUN_ENABLED === true);

            if (autorunFeatureEnabled && autorunUserEnabled) {
                const total = 10; // seconds
                let remain = total;
                const $cd = $('#autoRunCountdown');
                // Disable UI while waiting, similar to running state
                $('#startSCAN').prop('disabled', true).addClass('uk-button-disabled'); // REFACTORED
                $('#stopSCAN').show().prop('disabled', false);
                if (typeof setScanUIGating === 'function') setScanUIGating(true);
                const tick = () => {
                    // Double-check feature + user flags on each tick
                    const stillEnabled = (window.CONFIG_APP?.APP?.AUTORUN !== false) && window.AUTORUN_ENABLED;
                    if (!stillEnabled) { clearInterval(window.__autoRunInterval); window.__autoRunInterval = null; return; }
                    $cd.text(`AutoRun ${remain}s`).css({ color: '#e53935', fontWeight: 'bold' }); // REFACTORED
                    remain -= 1;
                    if (remain < 0) {
                        clearInterval(window.__autoRunInterval);
                        window.__autoRunInterval = null;
                        $cd.text('').css({ color: '', fontWeight: '' }); // REFACTORED
                        // Trigger new scan using current filters/selection
                        $('#startSCAN').trigger('click');
                    }
                };
                clearInterval(window.__autoRunInterval); // REFACTORED
                window.__autoRunInterval = setInterval(tick, 1000);
                tick();
            }
        } catch (_) { }
    }

    processTokens(flatTokens, tableBodyId);
}


/**
 * Stops the currently running scanner.
 * - Jika scan SEDANG berjalan: "hard stop" dengan reload halaman
 * - Jika scan SUDAH selesai (autorun countdown): stop countdown tanpa reload
 * FIX: Prevent losing scan results when user stops autorun countdown
 */
async function stopScanner() {
    const wasScanning = getScanRunning(); // Capture state sebelum di-set false

    setScanRunning(false);
    try { cancelAnimationFrame(getAnimationFrameId()); } catch (_) { }
    clearInterval(window.__autoRunInterval);
    window.__autoRunInterval = null;
    setPageTitleForRun(false);
    if (typeof form_on === 'function') form_on();

    // === RELEASE GLOBAL SCAN LOCK (MANUAL STOP) ===
    try {
        // Clear global scan lock
        const filterKey = typeof getActiveFilterKey === 'function' ? getActiveFilterKey() : 'FILTER_MULTICHAIN';
        if (typeof clearGlobalScanLock === 'function') {
            clearGlobalScanLock(filterKey);
            // console.log('[SCANNER] Global scan lock released (manual stop):', filterKey);
        }

        // Clear per-tab scanning state
        if (typeof sessionStorage !== 'undefined') {
            sessionStorage.removeItem('TAB_SCANNING');
            sessionStorage.removeItem('TAB_SCAN_CHAIN');
            sessionStorage.removeItem('TAB_SCAN_START');
            sessionStorage.setItem('APP_FORCE_RUN_NO', '1');
        }

        // Notify TabManager untuk broadcast ke tab lain
        if (window.TabManager && typeof window.TabManager.notifyScanStop === 'function') {
            window.TabManager.notifyScanStop();
            // console.log(`[SCANNER] Tab ${window.getTabId()} stopped scanning (manual stop)`);
        }
    } catch (e) {
        // console.error('[SCANNER] Error releasing scan state on manual stop:', e);
    }

    // Simpan state 'run:NO'
    await persistRunStateNo();

    // ===== FIX: HANYA reload jika scan SEDANG berjalan =====
    // Jika scan sudah selesai (hanya autorun countdown), JANGAN reload
    if (wasScanning) {
        // Scan sedang berjalan → reload untuk clean state
        try { if (window.SCAN_LOG_ENABLED) console.log('[SCANNER] Scan was running, reloading page...'); } catch (_) { }
        location.reload();
    } else {
        // Scan sudah selesai, hanya stop autorun countdown
        try { if (window.SCAN_LOG_ENABLED) console.log('[SCANNER] Scan already completed, stopping autorun countdown without reload'); } catch (_) { }

        // Reset UI ke state normal
        $('#stopSCAN').hide().prop('disabled', true);
        $('#startSCAN').prop('disabled', false).text('START').removeClass('uk-button-disabled');
        $('#autoRunCountdown').text('').css({ color: '', fontWeight: '' });

        // Release UI gating
        if (typeof setScanUIGating === 'function') setScanUIGating(false);

        // Show toast notification
        if (typeof toast !== 'undefined' && toast.info) {
            toast.info('Autorun countdown stopped', { duration: 2000 });
        }
    }
}

/**
 * Soft-stop scanner without reloading the page.
 * Useful before running long operations (e.g., Update Wallet CEX).
 */
function stopScannerSoft() {
    setScanRunning(false);
    try { cancelAnimationFrame(getAnimationFrameId()); } catch (_) { }

    // === RELEASE GLOBAL SCAN LOCK (SOFT STOP) ===
    try {
        // Clear global scan lock
        const filterKey = typeof getActiveFilterKey === 'function' ? getActiveFilterKey() : 'FILTER_MULTICHAIN';
        if (typeof clearGlobalScanLock === 'function') {
            clearGlobalScanLock(filterKey);
            // console.log('[SCANNER] Global scan lock released (soft stop):', filterKey);
        }

        // Clear per-tab scanning state
        if (typeof sessionStorage !== 'undefined') {
            sessionStorage.removeItem('TAB_SCANNING');
            sessionStorage.removeItem('TAB_SCAN_CHAIN');
            sessionStorage.removeItem('TAB_SCAN_START');
        }

        // Notify TabManager untuk broadcast ke tab lain
        if (window.TabManager && typeof window.TabManager.notifyScanStop === 'function') {
            window.TabManager.notifyScanStop();
            // console.log(`[SCANNER] Tab ${window.getTabId()} soft stopped scanning`);
        }
    } catch (e) {
        // console.error('[SCANNER] Error releasing scan state on soft stop:', e);
    }

    // Simpan state 'run:NO' tanpa me-reload halaman.
    try { (async () => { await persistRunStateNo(); })(); } catch (_) { }
    clearInterval(window.__autoRunInterval);
    window.__autoRunInterval = null;
    if (typeof form_on === 'function') form_on();
}

/**
 * Memperbarui banner info di atas untuk menunjukkan chain mana saja yang sedang dipindai.
 * @param {string[]} [seedChains] - Daftar awal chain yang akan ditampilkan.
 */
function updateRunningChainsBanner(seedChains) {
    try {
        const setKeys = new Set();
        if (Array.isArray(seedChains)) seedChains.forEach(c => { if (c) setKeys.add(String(c).toLowerCase()); });
        const cache = (typeof window.RUN_STATES === 'object' && window.RUN_STATES) ? window.RUN_STATES : {};
        Object.keys(window.CONFIG_CHAINS || {}).forEach(k => { if (cache[String(k).toLowerCase()]) setKeys.add(String(k).toLowerCase()); });
        const labels = Array.from(setKeys).map(k => {
            const cfg = (window.CONFIG_CHAINS || {})[k] || {};
            return (cfg.Nama_Pendek || cfg.Nama_Chain || k).toString().toUpperCase();
        });
        // If multichain mode is running, prepend MULTICHAIN flag
        try { if (cache.multichain) labels.unshift('MULTICHAIN'); } catch (_) { }
        if (labels.length > 0) {
            $('#infoAPP').html(` RUN SCANNING: ${labels.join(' | ')}`).show();
        } else {
            // No running chains → clear banner
            $('#infoAPP').text('').hide();
        }
    } catch (_) { }
}

try { window.updateRunningChainsBanner = window.updateRunningChainsBanner || updateRunningChainsBanner; } catch (_) { }

/**
 * Helper terpusat untuk menyimpan state `run: 'NO'` ke storage,
 * dan memperbarui indikator UI yang relevan.
 */
async function persistRunStateNo() {
    try {
        const key = (typeof getActiveFilterKey === 'function') ? getActiveFilterKey() : 'FILTER_MULTICHAIN';
        const cur = (typeof getFromLocalStorage === 'function') ? (getFromLocalStorage(key, {}) || {}) : {};
        if (typeof saveToLocalStorageAsync === 'function') {
            await saveToLocalStorageAsync(key, Object.assign({}, cur, { run: 'NO' }));
        } else {
            setAppState({ run: 'NO' });
        }
        if (typeof window.updateRunStateCache === 'function') { try { window.updateRunStateCache(key, { run: 'NO' }); } catch (_) { } }
    } catch (_) { try { setAppState({ run: 'NO' }); } catch (__) { } }
    try {
        if (typeof window.updateRunStateCache === 'function') {
            try { window.updateRunStateCache(getActiveFilterKey(), { run: 'NO' }); } catch (_) { }
        }
        try { (window.CURRENT_CHAINS || []).forEach(c => window.updateRunStateCache(`FILTER_${String(c).toUpperCase()}`, { run: 'NO' })); } catch (_) { }
    } catch (_) { }
    try {
        if (typeof window.updateRunningChainsBanner === 'function') window.updateRunningChainsBanner();
        if (typeof window.updateToolbarRunIndicators === 'function') window.updateToolbarRunIndicators();
    } catch (_) { }
}

// =================================================================================
// EXPORT TO APP NAMESPACE
// =================================================================================
// Register scanner functions to window.App.Scanner for use by main.js
if (typeof window !== 'undefined' && window.App && typeof window.App.register === 'function') {
    window.App.register('Scanner', {
        startScanner,
        stopScanner,
        stopScannerSoft,
        // Return per-tab scanning state (not global)
        isScanRunning: () => isThisTabScanning(),
        // Expose helper untuk external access
        isThisTabScanning: isThisTabScanning,
        // Fungsi untuk disable/enable form edit saat scanning
        setEditFormState: setEditFormState
    });
}

// Expose untuk backward compatibility
if (typeof window !== 'undefined') {
    window.isThisTabScanning = isThisTabScanning;
    window.setEditFormState = setEditFormState;
}
