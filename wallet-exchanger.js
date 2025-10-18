// =================================================================================
// WALLET EXCHANGER UI MODULE
// =================================================================================
/**
 * Module untuk mengelola UI Update Wallet Exchanger
 * - Render CEX cards dengan tabel koin
 * - Handle pemilihan CEX
 * - Integrate dengan fetchWalletStatus dari services/cex.js
 */
(function initWalletExchangerUI(global) {
    const root = global || (typeof window !== 'undefined' ? window : {});
    const App = root.App || (root.App = {});

    // State management
    let activeChain = null;
    let selectedCexList = [];

    /**
     * Load coins data from storage (localStorage or IndexedDB)
     */
    function loadCoinsFromStorage() {
        try {
            const mode = (typeof getAppMode === 'function') ? getAppMode() : { type: 'multi' };
            let tokens = [];

            if (mode.type === 'single' && mode.chain) {
                // Single chain mode
                tokens = (typeof getTokensChain === 'function') ? getTokensChain(mode.chain) : [];
            } else {
                // Multichain mode
                tokens = (typeof getFromLocalStorage === 'function') ? getFromLocalStorage('TOKEN_MULTICHAIN', []) : [];
            }

            return tokens || [];
        } catch(err) {
            console.error('[Wallet Exchanger] Error loading coins from storage:', err);
            return [];
        }
    }

    /**
     * Merge wallet data hasil fetch dengan data existing
     * Update hanya dataCexs untuk CEX yang di-fetch
     */
    function mergeWalletData(existingCoins, newCoinsMap, updatedCexes) {
        const merged = [...existingCoins];

        // Update dataCexs untuk coins yang sudah ada
        Object.keys(newCoinsMap).forEach(coinKey => {
            const newCoin = newCoinsMap[coinKey];
            const existingIndex = merged.findIndex(c =>
                c.symbol_in === newCoin.symbol_in && c.chain === newCoin.chain
            );

            if (existingIndex >= 0) {
                // Update existing coin's dataCexs
                merged[existingIndex].dataCexs = merged[existingIndex].dataCexs || {};
                Object.assign(merged[existingIndex].dataCexs, newCoin.dataCexs);
            } else {
                // Add new coin
                merged.push(newCoin);
            }
        });

        return merged;
    }

    /**
     * Save coins data to storage
     */
    function saveCoinsToStorage(coins) {
        try {
            const mode = (typeof getAppMode === 'function') ? getAppMode() : { type: 'multi' };

            if (mode.type === 'single' && mode.chain) {
                // Single chain mode - save to specific chain storage
                const storageKey = `TOKEN_${String(mode.chain).toUpperCase()}`;
                if (typeof saveToLocalStorage === 'function') {
                    saveToLocalStorage(storageKey, coins);
                }
            } else {
                // Multichain mode
                if (typeof saveToLocalStorage === 'function') {
                    saveToLocalStorage('TOKEN_MULTICHAIN', coins);
                }
            }

            console.log(`[Wallet Exchanger] Saved ${coins.length} coins to storage`);
        } catch(err) {
            console.error('[Wallet Exchanger] Error saving coins to storage:', err);
        }
    }

    /**
     * Show update result notification
     */
    function showUpdateResult(success, failedCexes) {
        const $result = $('#wallet-update-result');
        const $resultText = $result.find('p');

        if (success && (!failedCexes || failedCexes.length === 0)) {
            $result.removeClass('uk-alert-warning uk-alert-danger').addClass('uk-alert-success');
            $resultText.html('<strong>✅ Update Berhasil!</strong> Semua exchanger berhasil diperbarui. Data terbaru ditampilkan di bawah.');
        } else if (failedCexes && failedCexes.length > 0) {
            $result.removeClass('uk-alert-success uk-alert-danger').addClass('uk-alert-warning');
            const failedList = failedCexes.join(', ');
            $resultText.html(`<strong>⚠️ Update Sebagian Berhasil</strong><br>Exchanger yang gagal: ${failedList}`);
        } else {
            $result.removeClass('uk-alert-success uk-alert-warning').addClass('uk-alert-danger');
            $resultText.html('<strong>❌ Update Gagal</strong> Tidak ada exchanger yang berhasil diperbarui.');
        }

        $result.fadeIn(300);

        // Auto-hide after 10 seconds
        setTimeout(() => {
            $result.fadeOut(300);
        }, 10000);
    }

    /**
     * Render CEX cards grid sesuai dengan filter chain aktif
     * Menampilkan semua CEX yang ada di filter, dengan data koin dari storage
     */
    function renderCexCards() {
        const $grid = $('#wallet-cex-grid');
        if (!$grid.length) return;

        $grid.empty();

        // Get active mode and chain
        const mode = (typeof getAppMode === 'function') ? getAppMode() : { type: 'multi' };
        let availableCexes = [];

        if (mode.type === 'single') {
            const filterChain = (typeof getFilterChain === 'function') ? getFilterChain(mode.chain || '') : {};
            availableCexes = (filterChain?.cex || []).map(x => String(x).toUpperCase());
            activeChain = mode.chain;
        } else {
            const filterMulti = (typeof getFilterMulti === 'function') ? getFilterMulti() : {};
            availableCexes = (filterMulti?.cex || []).map(x => String(x).toUpperCase());
            activeChain = 'MULTICHAIN';
        }

        // Filter hanya CEX yang valid dari CONFIG_CEX
        const CONFIG_CEX = root.CONFIG_CEX || {};
        const CONFIG_CHAINS = root.CONFIG_CHAINS || {};
        availableCexes = availableCexes.filter(cx => !!CONFIG_CEX[cx]);

        // Update chain label
        try {
            const chainName = (activeChain === 'MULTICHAIN') ? 'MULTICHAIN' :
                              (CONFIG_CHAINS?.[String(activeChain).toLowerCase()]?.Nama_Chain || activeChain);
            $('#wallet-chain-label').text(String(chainName).toUpperCase());
        } catch(_) {}

        // Jika tidak ada CEX yang tersedia
        if (!availableCexes.length) {
            $grid.html(`
                <div class="uk-width-1-1">
                    <div class="uk-alert uk-alert-warning">
                        <p>Tidak ada exchanger yang tersedia pada filter chain aktif. Silakan pilih minimal 1 CEX pada filter.</p>
                    </div>
                </div>
            `);
            return;
        }

        // Get all coins from storage untuk chain aktif
        const allCoinsData = loadCoinsFromStorage();

        // Render each CEX card berdasarkan availableCexes (filter)
        availableCexes.forEach(cexName => {
            const cexConfig = CONFIG_CEX[cexName] || {};
            const cexColor = cexConfig.WARNA || '#333';

            // Filter coins untuk CEX ini: hanya yang bermasalah WD/Depo
            const cexCoins = allCoinsData.filter(coin => {
                // Check if coin has data for this CEX
                if (!coin.dataCexs || !coin.dataCexs[cexName]) return false;

                // For single chain mode, filter by chain
                if (mode.type === 'single') {
                    const coinChain = String(coin.chain || '').toLowerCase();
                    const targetChain = String(activeChain || '').toLowerCase();
                    if (coinChain !== targetChain) return false;
                }

                // FILTER: Hanya tampilkan yang bermasalah (WD atau Depo CLOSED)
                const dataCex = coin.dataCexs[cexName];
                const wdClosed = dataCex.withdrawEnable === false || dataCex.withdrawToken === false;
                const dpClosed = dataCex.depositEnable === false || dataCex.depositToken === false;

                return wdClosed || dpClosed;
            });

            // Jumlah koin bermasalah = jumlah total (karena sudah difilter)
            const problemCount = cexCoins.length;

            const isSelected = selectedCexList.includes(cexName);

            const cardHtml = `
                <div class="wallet-cex-card ${isSelected ? 'selected' : ''}" data-cex="${cexName}">
                    <div class="wallet-cex-header" data-cex="${cexName}">
                        <div class="wallet-cex-name" style="color: ${cexColor}">
                            <input type="checkbox" class="wallet-cex-checkbox" data-cex="${cexName}" ${isSelected ? 'checked' : ''}>
                            ${cexName}
                        </div>
                        <span class="uk-text-meta uk-text-small">
                            ${problemCount} koin bermasalah
                        </span>
                    </div>
                    <div class="wallet-cex-table-wrapper">
                        ${renderCexTable(cexName, cexCoins)}
                    </div>
                </div>
            `;

            $grid.append(cardHtml);
        });

        // Bind events untuk checkbox
        bindCexCardEvents();
        updateCekButton();
    }

    /**
     * Render tabel koin untuk CEX
     * Data koin akan di-fetch dari CEX saat user mengklik UPDATE WALLET EXCHANGER
     */
    function renderCexTable(cexName, coins) {
        if (!coins || coins.length === 0) {
            return `
                <div class="uk-text-center uk-padding-small uk-text-muted">
                    <p>Belum ada data wallet</p>
                    <p class="uk-text-small">Pilih CEX ini dan klik "UPDATE WALLET EXCHANGER" untuk fetch data</p>
                </div>
            `;
        }

        let tableHtml = `
            <table class="wallet-cex-table uk-table uk-table-divider uk-table-hover uk-table-small">
                <thead>
                    <tr>
                        <th style="width:30px">No</th>
                        <th style="width:70px">Symbol</th>
                        <th style="width:130px">SC</th>
                        <th style="width:60px">Decimals</th>
                        <th style="width:90px">Trade Status</th>
                        <th style="width:80px">Status WD</th>
                        <th style="width:80px">Status Depo</th>
                    </tr>
                </thead>
                <tbody>
        `;

        coins.forEach((coin, idx) => {
            const dataCex = (coin.dataCexs || {})[cexName] || {};

            // Symbol dan SC data
            const tokenSymbol = (coin.symbol_in || coin.tokenName || '?').toUpperCase();
            const tokenSc = coin.sc_in || coin.contractAddress || '-';

            // Decimals dari enrichment
            const decimals = coin.des_in || coin.decimals || '-';

            // Status WD (Withdraw)
            const wdToken = dataCex.withdrawToken || dataCex.withdrawEnable;
            let statusWd = '';
            if (wdToken === true) {
                statusWd = '<span class="wallet-status-badge wallet-status-on">OPEN</span>';
            } else if (wdToken === false) {
                statusWd = '<span class="wallet-status-badge wallet-status-off">CLOSED</span>';
            } else {
                statusWd = '<span class="wallet-status-badge wallet-status-loading">UNKNOWN</span>';
            }

            // Status Depo (Deposit)
            const dpToken = dataCex.depositToken || dataCex.depositEnable;
            let statusDepo = '';
            if (dpToken === true) {
                statusDepo = '<span class="wallet-status-badge wallet-status-on">OPEN</span>';
            } else if (dpToken === false) {
                statusDepo = '<span class="wallet-status-badge wallet-status-off">CLOSED</span>';
            } else {
                statusDepo = '<span class="wallet-status-badge wallet-status-loading">UNKNOWN</span>';
            }

            // Trade Status - status trading pair (misal BTC/USDT aktif atau tidak)
            const tradingActive = dataCex.tradingActive || dataCex.isSpotTradingAllowed;
            let tradeStatus = '';
            if (tradingActive === true) {
                tradeStatus = '<span class="wallet-status-badge wallet-status-on">ACTIVE</span>';
            } else if (tradingActive === false) {
                tradeStatus = '<span class="wallet-status-badge wallet-status-off">INACTIVE</span>';
            } else {
                // Fallback: jika WD dan Depo keduanya aktif, anggap trading aktif
                if (wdToken === true && dpToken === true) {
                    tradeStatus = '<span class="wallet-status-badge wallet-status-on">ACTIVE</span>';
                } else {
                    tradeStatus = '<span class="wallet-status-badge wallet-status-loading">UNKNOWN</span>';
                }
            }

            // Shorten smart contract addresses
            const shortenSc = (sc) => {
                if (!sc || sc === '-' || sc.length < 12) return sc;
                return `${sc.substring(0, 6)}...${sc.substring(sc.length - 4)}`;
            };

            tableHtml += `
                <tr>
                    <td>${idx + 1}</td>
                    <td>
                        <span class="uk-text-bold uk-text-emphasis">${tokenSymbol}</span>
                    </td>
                    <td class="uk-text-truncate" title="${tokenSc}" style="max-width: 130px;">
                        <code class="uk-text-small">${shortenSc(tokenSc)}</code>
                    </td>
                    <td class="uk-text-center">
                        <span class="uk-text-small">${decimals}</span>
                    </td>
                    <td class="uk-text-center">
                        ${tradeStatus}
                    </td>
                    <td class="uk-text-center">
                        ${statusWd}
                    </td>
                    <td class="uk-text-center">
                        ${statusDepo}
                    </td>
                </tr>
            `;
        });

        tableHtml += `
                </tbody>
            </table>
        `;

        return tableHtml;
    }


    /**
     * Bind events untuk CEX cards checkbox
     */
    function bindCexCardEvents() {
        // Checkbox click
        $('.wallet-cex-checkbox').off('click').on('click', function(e) {
            e.stopPropagation();
            const cexName = $(this).data('cex');
            toggleCexSelection(cexName);
        });

        // Header click (toggle checkbox)
        $('.wallet-cex-header').off('click').on('click', function(e) {
            if ($(e.target).hasClass('wallet-cex-checkbox')) return;
            const cexName = $(this).data('cex');
            toggleCexSelection(cexName);
        });
    }

    /**
     * Toggle CEX selection
     */
    function toggleCexSelection(cexName) {
        const idx = selectedCexList.indexOf(cexName);

        if (idx >= 0) {
            // Remove from selection
            selectedCexList.splice(idx, 1);
            $(`.wallet-cex-card[data-cex="${cexName}"]`).removeClass('selected');
            $(`.wallet-cex-checkbox[data-cex="${cexName}"]`).prop('checked', false);
        } else {
            // Add to selection
            selectedCexList.push(cexName);
            $(`.wallet-cex-card[data-cex="${cexName}"]`).addClass('selected');
            $(`.wallet-cex-checkbox[data-cex="${cexName}"]`).prop('checked', true);
        }

        updateCekButton();
    }

    /**
     * Update button state berdasarkan selection
     */
    function updateCekButton() {
        const $btn = $('#btn-cek-wallet-exchanger');
        if (selectedCexList.length > 0) {
            $btn.prop('disabled', false).removeClass('uk-button-default').addClass('uk-button-primary');
        } else {
            $btn.prop('disabled', true).removeClass('uk-button-primary').addClass('uk-button-default');
        }
    }

    /**
     * Show progress overlay saat fetch CEX wallet (layar freeze)
     */
    function showFetchProgressOverlay(cexList) {
        // Create overlay element
        const overlayHtml = `
            <div id="wallet-fetch-overlay" style="
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.85);
                z-index: 9999;
                display: flex;
                align-items: center;
                justify-content: center;
                flex-direction: column;
            ">
                <div style="
                    background: white;
                    padding: 30px;
                    border-radius: 10px;
                    max-width: 500px;
                    width: 90%;
                    box-shadow: 0 10px 40px rgba(0,0,0,0.3);
                ">
                    <h3 class="uk-text-center uk-margin-small-bottom">
                        <span uk-spinner="ratio: 1"></span>
                        Fetching Wallet Data...
                    </h3>
                    <p class="uk-text-center uk-text-muted uk-margin-small-bottom">
                        Mohon tunggu, aplikasi sedang melakukan fetch data wallet dari exchanger
                    </p>
                    <div id="wallet-fetch-progress" class="uk-margin-top">
                        <!-- Progress items akan ditambahkan di sini -->
                    </div>
                </div>
            </div>
        `;

        // Remove existing overlay jika ada
        $('#wallet-fetch-overlay').remove();

        // Add to body
        $('body').append(overlayHtml);

        // Initialize progress list
        const $progressContainer = $('#wallet-fetch-progress');
        cexList.forEach(cexName => {
            const progressItem = `
                <div id="progress-${cexName}" class="uk-margin-small" style="padding: 8px; border-left: 3px solid #999;">
                    <div class="uk-flex uk-flex-between uk-flex-middle">
                        <span class="uk-text-bold">${cexName}</span>
                        <span class="uk-badge" style="background: #999;">WAITING</span>
                    </div>
                    <div class="uk-text-small uk-text-muted uk-margin-small-top" id="progress-text-${cexName}">
                        Menunggu...
                    </div>
                </div>
            `;
            $progressContainer.append(progressItem);
        });
    }

    /**
     * Update progress untuk CEX tertentu
     */
    function updateFetchProgress(cexName, status, message, tokenCount) {
        const $progressItem = $(`#progress-${cexName}`);
        if (!$progressItem.length) return;

        const $badge = $progressItem.find('.uk-badge');
        const $text = $(`#progress-text-${cexName}`);

        let color = '#999';
        let badgeText = status.toUpperCase();

        switch(status.toLowerCase()) {
            case 'fetching':
                color = '#1e87f0';
                badgeText = 'FETCHING...';
                $progressItem.css('border-left-color', color);
                $badge.css('background', color).text(badgeText);
                $text.html(`<span uk-spinner="ratio: 0.6"></span> ${message || 'Fetching data...'}`);
                break;
            case 'processing':
                color = '#faa05a';
                badgeText = 'PROCESSING';
                $progressItem.css('border-left-color', color);
                $badge.css('background', color).text(badgeText);
                $text.text(message || 'Processing data...');
                break;
            case 'success':
                color = '#32d296';
                badgeText = 'SUCCESS';
                $progressItem.css('border-left-color', color);
                $badge.css('background', color).text(badgeText);
                const countMsg = tokenCount ? ` - ${tokenCount} koin ditemukan` : '';
                $text.html(`✓ ${message || 'Berhasil'}${countMsg}`);
                break;
            case 'error':
                color = '#f0506e';
                badgeText = 'FAILED';
                $progressItem.css('border-left-color', color);
                $badge.css('background', color).text(badgeText);
                $text.html(`✗ ${message || 'Gagal fetch data'}`);
                break;
        }
    }

    /**
     * Hide progress overlay
     */
    function hideFetchProgressOverlay() {
        setTimeout(() => {
            $('#wallet-fetch-overlay').fadeOut(300, function() {
                $(this).remove();
            });
        }, 1000);
    }

    /**
     * Handle CEK WALLET EXCHANGER button click
     * KONSEP: User pilih CEX dengan checkbox -> fetch wallet data -> update tabel
     */
    async function handleCekWallet() {
        // Validasi: harus ada CEX yang dipilih
        if (selectedCexList.length === 0) {
            try {
                if (typeof toast !== 'undefined' && toast.error) {
                    toast.error('Pilih minimal 1 CEX terlebih dahulu');
                }
            } catch(_) {}
            return;
        }

        if (!confirm(`Fetch data wallet dari ${selectedCexList.length} exchanger?\n\n${selectedCexList.join(', ')}\n\nProses ini akan memakan waktu beberapa saat.`)) {
            return;
        }

        // Ensure scanner is stopped
        try {
            const st = (typeof getAppState === 'function') ? getAppState() : {};
            if (st && st.run === 'YES' && window.App?.Scanner?.stopScannerSoft) {
                window.App.Scanner.stopScannerSoft();
                await new Promise(r => setTimeout(r, 200));
            }
        } catch(_) {}

        // Show progress overlay (layar freeze)
        showFetchProgressOverlay(selectedCexList);

        // Storage untuk menyimpan hasil fetch per CEX
        const cexWalletData = {};
        const failedCexes = [];

        // Fetch wallet data dari setiap CEX secara sequential
        for (const cexName of selectedCexList) {
            try {
                // Update progress: fetching
                updateFetchProgress(cexName, 'fetching', `Connecting to ${cexName} API...`);

                // Fetch wallet status menggunakan services/cex.js
                if (typeof window.App?.Services?.CEX?.fetchWalletStatus === 'function') {
                    const walletData = await window.App.Services.CEX.fetchWalletStatus(cexName);

                    // Update progress: processing
                    updateFetchProgress(cexName, 'processing', 'Memproses data wallet...');

                    // Filter data berdasarkan chain aktif
                    let filteredData = walletData;
                    if (mode.type === 'single' && mode.chain) {
                        // Dapatkan network mapping untuk chain ini
                        const chainConfig = window.CONFIG_CHAINS?.[mode.chain.toLowerCase()] || {};
                        const chainNetworks = [
                            chainConfig.Nama_Chain,
                            chainConfig.Network_Name,
                            mode.chain.toUpperCase()
                        ].filter(Boolean);

                        filteredData = walletData.filter(item => {
                            const itemChain = String(item.chain || '').toUpperCase();
                            return chainNetworks.some(cn =>
                                String(cn).toUpperCase() === itemChain
                            );
                        });
                    }

                    // Simpan data
                    cexWalletData[cexName] = filteredData;

                    // Update progress: success
                    updateFetchProgress(cexName, 'success', 'Berhasil', filteredData.length);

                } else {
                    throw new Error('fetchWalletStatus function not available');
                }

            } catch(err) {
                console.error(`[Wallet Exchanger] Error fetching ${cexName}:`, err);
                failedCexes.push(cexName);
                updateFetchProgress(cexName, 'error', err.message || 'Gagal fetch data');
            }

            // Delay antar CEX untuk menghindari rate limit
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        // Hide progress overlay
        hideFetchProgressOverlay();

        // Proses dan tampilkan hasil
        try {
            // Transform data ke format yang sesuai untuk renderCexTable
            const transformedCoins = {};

            Object.keys(cexWalletData).forEach(cexName => {
                const walletItems = cexWalletData[cexName] || [];

                walletItems.forEach(item => {
                    const key = `${item.tokenName}_${item.chain}`;

                    if (!transformedCoins[key]) {
                        transformedCoins[key] = {
                            symbol_in: item.tokenName,
                            tokenName: item.tokenName,
                            sc_in: item.contractAddress || '-',
                            contractAddress: item.contractAddress,
                            chain: item.chain,
                            decimals: item.decimals || '-',
                            dataCexs: {}
                        };
                    }

                    // Add CEX-specific data
                    transformedCoins[key].dataCexs[cexName] = {
                        withdrawEnable: item.withdrawEnable,
                        depositEnable: item.depositEnable,
                        withdrawToken: item.withdrawEnable,
                        depositToken: item.depositEnable,
                        feeWDs: item.feeWDs,
                        tradingActive: item.tradingActive !== false // default true if not specified
                    };
                });
            });

            // Merge dengan data existing di storage
            const existingCoins = loadCoinsFromStorage();
            const mergedCoins = mergeWalletData(existingCoins, transformedCoins, selectedCexList);

            // Save merged data ke storage
            saveCoinsToStorage(mergedCoins);

            // Re-render cards dengan data terbaru
            renderCexCards();

            // Show notification
            if (failedCexes.length === 0) {
                showUpdateResult(true, []);
                if (typeof toast !== 'undefined' && toast.success) {
                    const totalCoins = Object.keys(transformedCoins).length;
                    toast.success(`✅ Berhasil fetch ${totalCoins} koin dari ${selectedCexList.length} CEX`);
                }
            } else {
                showUpdateResult(false, failedCexes);
                if (typeof toast !== 'undefined' && toast.warning) {
                    toast.warning(`⚠️ Berhasil: ${selectedCexList.length - failedCexes.length}, Gagal: ${failedCexes.length}`);
                }
            }

        } catch(err) {
            console.error('[Wallet Exchanger] Error processing results:', err);
            showUpdateResult(false, selectedCexList);
            if (typeof toast !== 'undefined' && toast.error) {
                toast.error('Gagal memproses hasil: ' + err.message);
            }
        }
    }

    /**
     * Show wallet exchanger section
     */
    function show() {
        // Hide other sections
        try {
            $('#tabel-monitoring, #scanner-config, #filter-card, #sinyal-container').hide();
            $('#token-management, #form-setting-app, #iframe-container').hide();
            if (window.SnapshotModule && typeof window.SnapshotModule.hide === 'function') {
                window.SnapshotModule.hide();
            }
        } catch(_) {}

        // Reset selection
        selectedCexList = [];

        // Render CEX cards dengan data dari storage
        renderCexCards();

        // Show section
        $('#update-wallet-section').fadeIn(300);
    }

    /**
     * Hide wallet exchanger section
     */
    function hide() {
        $('#update-wallet-section').fadeOut(300);

        // Show scanner elements
        try {
            $('#tabel-monitoring, #scanner-config, #filter-card, #sinyal-container').fadeIn(300);
        } catch(_) {}
    }

    /**
     * Initialize module
     */
    function init() {
        // Bind CEK WALLET button
        $('#btn-cek-wallet-exchanger').off('click').on('click', handleCekWallet);

        // Bind close button
        $('#btn-close-wallet-section').off('click').on('click', hide);

        console.log('[Wallet Exchanger UI] Module initialized');
    }

    // Register to App namespace
    if (typeof App.register === 'function') {
        App.register('WalletExchanger', {
            show,
            hide,
            renderCexCards,
            showUpdateResult,
            init
        });
    } else {
        // Fallback registration
        App.WalletExchanger = { show, hide, renderCexCards, showUpdateResult, init };
    }

    // Auto-init on DOM ready
    $(document).ready(function() {
        init();
    });

})(typeof window !== 'undefined' ? window : this);
