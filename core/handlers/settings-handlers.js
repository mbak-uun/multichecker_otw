/**
 * =================================================================================
 * SETTINGS EVENT HANDLERS
 * =================================================================================
 *
 * This module contains all settings-related event handlers including:
 * - Settings modal open/close
 * - Settings form save
 * - Settings cancel button
 * - RPC configuration
 * - DEX delay configuration
 * - User profile settings
 *
 * Dependencies:
 * - jQuery
 * - getFromLocalStorage, saveToLocalStorage (storage utilities)
 * - renderSettingsForm (UI rendering)
 * - showMainSection (section navigation)
 * - window.RPCDatabaseMigrator (RPC migration utility)
 * - CONFIG_CHAINS, CONFIG_DEXS (chain/dex configurations)
 * - toast notifications
 * - UIkit notifications
 *
 * @module core/handlers/settings-handlers
 */

(function() {
    'use strict';

    /**
     * Settings config button handler
     * Opens settings section and renders form
     */
    $("#SettingConfig").on("click", function () {
        showMainSection('#form-setting-app');
        try { document.getElementById('form-setting-app').scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch(_) {}
        renderSettingsForm();
    });

    /**
     * Cancel settings button handler
     * Restore without broadcasting to other tabs
     */
    $(document).on('click', '#btn-cancel-setting', function () {
        try { sessionStorage.setItem('APP_FORCE_RUN_NO', '1'); } catch(_) {}
        try { location.reload(); } catch(_) {}
    });

    /**
     * Save settings button handler
     * Validates and saves all settings to localStorage
     */
    $('#btn-save-setting').on('click', async function() {
        const nickname = $('#user').val().trim();
        const jedaTimeGroup = parseInt($('#jeda-time-group').val(), 10);
        const jedaKoin = parseInt($('#jeda-koin').val(), 10);
        const walletMeta = $('#walletMeta').val().trim();
        // ✅ apiKey0x removed - now managed in secrets.js
        const scanPerKoin = $('input[name="koin-group"]:checked').val();
        const speedScan = $('input[name="waktu-tunggu"]:checked').val();

        if (!nickname || nickname.length < 6) return UIkit.notification({message: 'Nickname harus diisi (minimal 6 karakter)!', status: 'danger'});
        if (!/^[a-zA-Z\s]+$/.test(nickname)) return UIkit.notification({message: 'Nickname hanya boleh berisi huruf dan spasi!', status: 'danger'});

        if (!jedaTimeGroup || jedaTimeGroup <= 0) return UIkit.notification({message: 'Jeda / Group harus lebih dari 0!', status: 'danger'});
        if (!jedaKoin || jedaKoin <= 0) return UIkit.notification({message: 'Jeda / Koin harus lebih dari 0!', status: 'danger'});
        if (!walletMeta || !walletMeta.startsWith('0x')) return UIkit.notification({message: 'Wallet Address harus valid!', status: 'danger'});

        let JedaDexs = {};
        $('.dex-delay-input').each(function() {
            JedaDexs[$(this).data('dex')] = parseFloat($(this).val()) || 100;
        });

        // Collect user RPC settings (NEW: simplified structure using database)
        let userRPCs = {};
        // Get initial values from database migrator (not hardcoded anymore)
        const getInitialRPC = (chain) => {
            if (window.RPCDatabaseMigrator && window.RPCDatabaseMigrator.INITIAL_RPC_VALUES) {
                return window.RPCDatabaseMigrator.INITIAL_RPC_VALUES[chain] || '';
            }
            return '';
        };

        $('.rpc-input').each(function() {
            const chain = $(this).data('chain');
            const rpc = $(this).val().trim();

            // Simpan RPC yang diinput user, atau gunakan initial value dari migrator jika kosong
            if (rpc) {
                userRPCs[chain] = rpc;
            } else {
                const initialRPC = getInitialRPC(chain);
                if (initialRPC) {
                    userRPCs[chain] = initialRPC;
                }
            }
        });

        // Validasi: pastikan semua chain punya RPC
        const missingRPCs = Object.keys(CONFIG_CHAINS).filter(chain => !userRPCs[chain]);
        if (missingRPCs.length > 0) {
            UIkit.notification({
                message: `RPC untuk chain berikut harus diisi: ${missingRPCs.join(', ')}`,
                status: 'danger',
                timeout: 5000
            });
            return;
        }

        const settingData = {
            nickname, jedaTimeGroup, jedaKoin, walletMeta,
            // ✅ apiKey0x removed - now managed in secrets.js
            scanPerKoin: parseInt(scanPerKoin, 10),
            speedScan: parseFloat(speedScan),
            JedaDexs,
            userRPCs  // NEW: hanya simpan RPC yang diinput user (1 per chain)
        };

        saveToLocalStorage('SETTING_SCANNER', settingData);

        try { setLastAction("SIMPAN SETTING"); } catch(_) {}
        if (typeof UIkit !== 'undefined' && UIkit.notification) {
            UIkit.notification("✅ SETTING SCANNER BERHASIL DISIMPAN", {status:'success'});
        } else if (typeof toast !== 'undefined' && toast.success) {
            toast.success("✅ SETTING SCANNER BERHASIL DISIMPAN");
        }
        setTimeout(() => location.reload(), 500);
    });

})();
