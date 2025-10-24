// =================================================================================
// RPC DATABASE MIGRATOR - Auto-migrate RPC to Database
// =================================================================================
// Purpose: Automatically migrate default RPC suggestions to database
//
// Architecture:
// - Check if RPC already exists in database
// - If not, initialize with default values
// - Provide UI for user to update RPC endpoints
// - All RPC stored centrally in SETTING_SCANNER.userRPCs
// =================================================================================

(function() {
    'use strict';

    // Default RPC values (only used for initial setup, not as fallback)
    const INITIAL_RPC_VALUES = {
        bsc: 'https://binance.llamarpc.com',
        polygon: 'https://polygon-pokt.nodies.app',
        ethereum: 'https://eth.llamarpc.com',
        arbitrum: 'https://arbitrum-one-rpc.publicnode.com',
        base: 'https://base.llamarpc.com'
    };

    /**
     * Initialize RPC in database if not exists
     * This runs once on app startup
     * MODIFIED: No longer auto-saves to database, only provides initial values for UI
     */
    async function initializeRPCDatabase() {
        try {
            console.log('[RPC Migrator] 🔄 Checking RPC database...');

            // Get current settings
            const settings = (typeof getFromLocalStorage === 'function')
                ? getFromLocalStorage('SETTING_SCANNER', {})
                : {};

            // Check if userRPCs already exists
            if (settings.userRPCs && typeof settings.userRPCs === 'object') {
                const existingChains = Object.keys(settings.userRPCs);
                console.log(`[RPC Migrator] ✅ RPC database already initialized with ${existingChains.length} chains:`, existingChains);

                // REMOVED: No longer auto-adds missing chains to prevent autosave
                // User must explicitly click SIMPAN PENGATURAN to save RPC

                return true;
            }

            // No userRPCs exists - DO NOT auto-save, just log
            console.log('[RPC Migrator] ℹ️ No RPC found in database. Default values will be shown in UI.');
            console.log('[RPC Migrator] ⚠️ User must click SIMPAN PENGATURAN to save RPC settings.');

            // REMOVED: Auto-save functionality
            // settings.userRPCs = { ...INITIAL_RPC_VALUES };
            // saveToLocalStorage('SETTING_SCANNER', settings);

            return true;

        } catch (error) {
            console.error('[RPC Migrator] ❌ Error initializing RPC database:', error);
            return false;
        }
    }

    /**
     * Get RPC for a specific chain from database
     * @param {string} chainKey - Chain identifier
     * @returns {string|null} RPC URL or null
     */
    function getRPCFromDatabase(chainKey) {
        try {
            const chainLower = String(chainKey || '').toLowerCase();

            if (!chainLower) {
                console.error('[RPC Migrator] Chain key is required');
                return null;
            }

            const settings = (typeof getFromLocalStorage === 'function')
                ? getFromLocalStorage('SETTING_SCANNER', {})
                : {};

            if (settings.userRPCs && settings.userRPCs[chainLower]) {
                return settings.userRPCs[chainLower];
            }

            // If not found in database, return initial value (for first-time setup)
            if (INITIAL_RPC_VALUES[chainLower]) {
                console.warn(`[RPC Migrator] RPC not in database for ${chainKey}, using initial value`);
                return INITIAL_RPC_VALUES[chainLower];
            }

            console.error(`[RPC Migrator] No RPC available for chain: ${chainKey}`);
            return null;

        } catch (error) {
            console.error('[RPC Migrator] Error getting RPC from database:', error);
            return null;
        }
    }

    /**
     * Update RPC for a specific chain
     * @param {string} chainKey - Chain identifier
     * @param {string} rpcUrl - New RPC URL
     * @returns {boolean} Success status
     */
    function updateRPCInDatabase(chainKey, rpcUrl) {
        try {
            const chainLower = String(chainKey || '').toLowerCase();
            const url = String(rpcUrl || '').trim();

            if (!chainLower) {
                console.error('[RPC Migrator] Chain key is required');
                return false;
            }

            if (!url) {
                console.error('[RPC Migrator] RPC URL is required');
                return false;
            }

            // Validate URL format
            if (!url.startsWith('http://') && !url.startsWith('https://')) {
                console.error('[RPC Migrator] Invalid RPC URL format (must start with http:// or https://)');
                return false;
            }

            const settings = (typeof getFromLocalStorage === 'function')
                ? getFromLocalStorage('SETTING_SCANNER', {})
                : {};

            if (!settings.userRPCs) {
                settings.userRPCs = {};
            }

            settings.userRPCs[chainLower] = url;

            if (typeof saveToLocalStorage === 'function') {
                saveToLocalStorage('SETTING_SCANNER', settings);
                console.log(`[RPC Migrator] ✅ RPC updated for ${chainKey}: ${url}`);
                return true;
            } else {
                console.error('[RPC Migrator] saveToLocalStorage not available');
                return false;
            }

        } catch (error) {
            console.error('[RPC Migrator] Error updating RPC:', error);
            return false;
        }
    }

    /**
     * Get all RPCs from database
     * @returns {Object} Map of chainKey -> RPC URL
     */
    function getAllRPCsFromDatabase() {
        try {
            const settings = (typeof getFromLocalStorage === 'function')
                ? getFromLocalStorage('SETTING_SCANNER', {})
                : {};

            return settings.userRPCs || {};
        } catch (error) {
            console.error('[RPC Migrator] Error getting all RPCs:', error);
            return {};
        }
    }

    /**
     * Reset RPC to initial value
     * @param {string} chainKey - Chain identifier
     * @returns {boolean} Success status
     */
    function resetRPCToDefault(chainKey) {
        const chainLower = String(chainKey || '').toLowerCase();

        if (!INITIAL_RPC_VALUES[chainLower]) {
            console.error(`[RPC Migrator] No initial value for chain: ${chainKey}`);
            return false;
        }

        return updateRPCInDatabase(chainLower, INITIAL_RPC_VALUES[chainLower]);
    }

    // ====================
    // EXPORT PUBLIC API
    // ====================

    const RPCDatabaseMigrator = {
        initializeRPCDatabase,
        getRPCFromDatabase,
        updateRPCInDatabase,
        getAllRPCsFromDatabase,
        resetRPCToDefault,
        INITIAL_RPC_VALUES // expose for reference only
    };

    // Expose to window
    if (typeof window !== 'undefined') {
        window.RPCDatabaseMigrator = RPCDatabaseMigrator;
    }

    // Auto-initialize on script load (with delay to ensure storage.js is loaded)
    if (typeof window !== 'undefined') {
        window.addEventListener('DOMContentLoaded', () => {
            setTimeout(() => {
                initializeRPCDatabase();
            }, 500); // Small delay to ensure storage.js is ready
        });
    }

    console.log('[RPC Database Migrator] ✅ Module initialized');

})();
