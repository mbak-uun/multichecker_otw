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
    let selectedCexList = [];
    let activeChain = null;
    let problemCoins = [];

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
            updateCekButton();
            return;
        }

        // Get problem coins sesuai chain
        updateProblemCoins();

        // Render each CEX card
        availableCexes.forEach(cexName => {
            const cexConfig = CONFIG_CEX[cexName] || {};
            const cexColor = cexConfig.WARNA || '#333';
            const isSelected = selectedCexList.includes(cexName);

            // Filter problem coins untuk CEX ini
            const cexProblems = problemCoins.filter(coin => {
                return (coin.selectedCexs || []).map(c => String(c).toUpperCase()).includes(cexName);
            });

            const cardHtml = `
                <div class="wallet-cex-card ${isSelected ? 'selected' : ''}" data-cex="${cexName}">
                    <div class="wallet-cex-header" data-cex="${cexName}">
                        <div class="wallet-cex-name" style="color: ${cexColor}">
                            <input type="checkbox" class="wallet-cex-checkbox" data-cex="${cexName}" ${isSelected ? 'checked' : ''}>
                            ${cexName}
                        </div>
                        <span class="uk-text-meta uk-text-small">
                            ${cexProblems.length} koin bermasalah
                        </span>
                    </div>
                    <div class="wallet-cex-table-wrapper">
                        ${renderCexTable(cexName, cexProblems)}
                    </div>
                </div>
            `;

            $grid.append(cardHtml);
        });

        // Bind events
        bindCexCardEvents();
        updateCekButton();
    }

    /**
     * Render tabel koin untuk CEX
     */
    function renderCexTable(cexName, coins) {
        if (!coins || coins.length === 0) {
            return `
                <div class="uk-text-center uk-padding-small uk-text-muted">
                    <p>Belum ada data koin bermasalah</p>
                    <p class="uk-text-small">Pilih CEX ini dan klik "UPDATE WALLET EXCHANGER"</p>
                </div>
            `;
        }

        let tableHtml = `
            <table class="wallet-cex-table uk-table uk-table-divider uk-table-hover uk-table-small">
                <thead>
                    <tr>
                        <th style="width:30px">No</th>
                        <th style="width:40px">Symbol</th>
                        <th style="width:220px">SC</th>
                        <th style="width:60px">WD</th>
                        <th style="width:60px">DP</th>
                    </tr>
                </thead>
                <tbody>
        `;

        coins.forEach((coin, idx) => {
            const dataCex = (coin.dataCexs || {})[cexName] || {};

            // Status untuk Token
            const wdToken = dataCex.withdrawToken;
            const dpToken = dataCex.depositToken;
            const wdTokenLabel = wdToken === true ? '<span class="wallet-status-badge wallet-status-on">ON</span>' :
                                 wdToken === false ? '<span class="wallet-status-badge wallet-status-off">OFF</span>' :
                                 '<span class="wallet-status-badge wallet-status-loading">?</span>';
            const dpTokenLabel = dpToken === true ? '<span class="wallet-status-badge wallet-status-on">ON</span>' :
                                 dpToken === false ? '<span class="wallet-status-badge wallet-status-off">OFF</span>' :
                                 '<span class="wallet-status-badge wallet-status-loading">?</span>';

            // Status untuk Pair
            const wdPair = dataCex.withdrawPair;
            const dpPair = dataCex.depositPair;
            const wdPairLabel = wdPair === true ? '<span class="wallet-status-badge wallet-status-on">ON</span>' :
                                wdPair === false ? '<span class="wallet-status-badge wallet-status-off">OFF</span>' :
                                '<span class="wallet-status-badge wallet-status-loading">?</span>';
            const dpPairLabel = dpPair === true ? '<span class="wallet-status-badge wallet-status-on">ON</span>' :
                                dpPair === false ? '<span class="wallet-status-badge wallet-status-off">OFF</span>' :
                                '<span class="wallet-status-badge wallet-status-loading">?</span>';

            const tokenSymbol = (coin.symbol_in || '?').toUpperCase();
            const pairSymbol = (coin.symbol_out || '?').toUpperCase();
            const tokenSc = coin.sc_in || '-';
            const pairSc = coin.sc_out || '-';

            // Shorten smart contract addresses
            const shortenSc = (sc) => {
                if (!sc || sc === '-' || sc.length < 12) return sc;
                return `${sc.substring(0, 6)}...${sc.substring(sc.length - 4)}`;
            };

            tableHtml += `
                <tr>
                    <td>${idx + 1}</td>
                    <td>
                        <div class="uk-text-bold uk-text-success uk-text-small">${tokenSymbol}</div>
                        <div class="uk-text-bold uk-text-danger uk-text-small">${pairSymbol}</div>
                    </td>
                    <td class="uk-text-truncate" title="Token: ${tokenSc}&#10;Pair: ${pairSc}" style="max-width: 120px;">
                        <div class="uk-text-small">${tokenSc }</div>
                        <div class="uk-text-small">${pairSc }</div>
                    </td>
                    <td>
                        <div>${wdTokenLabel}</div>
                        <div>${wdPairLabel}</div>
                    </td>
                    <td>
                        <div>${dpTokenLabel}</div>
                        <div>${dpPairLabel}</div>
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
     * Update problem coins berdasarkan chain aktif
     * Menampilkan koin yang memiliki status WD/DP = false atau undefined/null
     */
    function updateProblemCoins() {
        try {
            const mode = (typeof getAppMode === 'function') ? getAppMode() : { type: 'multi' };
            let tokens = [];

            if (mode.type === 'single') {
                tokens = (typeof getTokensChain === 'function') ? getTokensChain(mode.chain) : [];
            } else {
                tokens = getFromLocalStorage('TOKEN_MULTICHAIN', []);
            }

            // Filter tokens yang memiliki masalah WD/DP atau belum ada data
            problemCoins = tokens.filter(token => {
                if (!token.selectedCexs || token.selectedCexs.length === 0) return false;

                // Check if token has any CEX with problems
                const hasProblem = token.selectedCexs.some(cexKey => {
                    const cexKeyUpper = String(cexKey).toUpperCase();
                    const cexData = (token.dataCexs || {})[cexKeyUpper] || {};

                    // Problem if: WD/DP is false, OR data belum ada (undefined/null)
                    const tokenHasProblem = cexData.withdrawToken === false ||
                                           cexData.depositToken === false ||
                                           cexData.withdrawToken === undefined ||
                                           cexData.depositToken === undefined;

                    const pairHasProblem = cexData.withdrawPair === false ||
                                          cexData.depositPair === false ||
                                          cexData.withdrawPair === undefined ||
                                          cexData.depositPair === undefined;

                    return tokenHasProblem || pairHasProblem;
                });

                return hasProblem;
            });

        } catch(err) {
            console.error('[Wallet Exchanger] Error updating problem coins:', err);
            problemCoins = [];
        }
    }

    /**
     * Bind events untuk CEX cards
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
     * Update button CEK WALLET EXCHANGER state
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
     * Handle CEK WALLET EXCHANGER button click
     */
    async function handleCekWallet() {
        if (selectedCexList.length === 0) {
            try {
                if (typeof toast !== 'undefined' && toast.error) {
                    toast.error('Pilih minimal 1 CEX terlebih dahulu');
                }
            } catch(_) {}
            return;
        }

        if (!confirm(`Apakah Anda ingin melakukan pengecekan wallet untuk ${selectedCexList.length} exchanger?\n\n${selectedCexList.join(', ')}`)) {
            return;
        }

        // Ensure scanner is stopped
        try {
            const st = getAppState();
            if (st && st.run === 'YES' && window.App?.Scanner?.stopScannerSoft) {
                window.App.Scanner.stopScannerSoft();
                await new Promise(r => setTimeout(r, 200));
            }
        } catch(_) {}

        // Save selected CEXes to filter temporarily
        try {
            const mode = (typeof getAppMode === 'function') ? getAppMode() : { type: 'multi' };

            if (mode.type === 'single') {
                const key = `FILTER_${String(mode.chain).toUpperCase()}`;
                const filter = getFromLocalStorage(key, {});
                filter.cex = selectedCexList;
                saveToLocalStorage(key, filter);
            } else {
                const filter = getFromLocalStorage('FILTER_MULTICHAIN', {});
                filter.cex = selectedCexList;
                saveToLocalStorage('FILTER_MULTICHAIN', filter);
            }
        } catch(_) {}

        // Call the existing checkAllCEXWallets function
        try {
            if (typeof checkAllCEXWallets === 'function') {
                await checkAllCEXWallets();
            } else if (window.App?.Services?.CEX?.checkAllCEXWallets) {
                await window.App.Services.CEX.checkAllCEXWallets();
            } else {
                throw new Error('checkAllCEXWallets function not found');
            }
        } catch(err) {
            console.error('[Wallet Exchanger] Error during wallet check:', err);
            try {
                if (typeof toast !== 'undefined' && toast.error) {
                    toast.error('Gagal melakukan pengecekan wallet: ' + err.message);
                }
            } catch(_) {}
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

        // Render CEX cards
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
