// =================================================================================
// CENTRALIZED UTILS - MODULAR REFACTORED VERSION
// =================================================================================
/**
 * This is the main entry point for all utility functions.
 * All functions have been split into logical modules under utils/helpers/
 *
 * Modules:
 * - logger.js: Centralized logging system (AppLogger)
 * - app-state.js: App mode and active token/filter management
 * - scan-lock.js: Global scan lock system
 * - filters.js: Filter management (PNL, multi-chain, single-chain)
 * - tokens.js: Token management, sorting, and flattening
 * - formatting.js: Price, currency, and display formatting
 * - chain-helpers.js: Chain data, CEX/DEX utilities, RPC helpers
 * - theme.js: Theme application and feature readiness
 * - ui-utils.js: UI utilities (debounce, scan gating)
 *
 * All functions are exposed to global scope (window) for backward compatibility.
 */

// Load all helper modules
// Note: These scripts should be loaded in order before the main application scripts

// Optional namespacing for future modular use
try {
    if (window.App && typeof window.App.register === 'function') {
        window.App.register('Utils', {
            getAppMode,
            getActiveTokenKey,
            getActiveFilterKey,
            getActiveTokens,
            saveActiveTokens,
            getActiveFilters,
            saveActiveFilters,
            getPNLFilter,
            setPNLFilter,
            getFilterMulti,
            setFilterMulti,
            getFilterChain,
            setFilterChain,
            getTokensMulti,
            setTokensMulti,
            getTokensChain,
            setTokensChain,
            getFeatureReadiness,
            applyThemeForMode,
            createHoverLink,
            safeUrl,
            linkifyStatus,
            hexToRgba,
            flattenDataKoin,
            getFeeSwap,
            getWarnaCEX,
            generateDexLink,
            convertIDRtoUSDT,
            debounce,
            getRPC,  // RPC helper with custom override
            setScanUIGating,
            // Global Scan Lock
            getGlobalScanLock,
            setGlobalScanLock,
            clearGlobalScanLock,
            checkCanStartScan
        });
    }
} catch(_) {}
