# Utils Helpers - Modular Architecture

This directory contains the refactored utility modules from the original 1333-line `utils.js` file. All functions have been split into logical, focused modules while maintaining 100% backward compatibility.

## Module Structure

### 1. **logger.js** (66 lines)
Centralized logging system with configurable output.

**Functions:**
- `AppLogger.isEnabled()` - Check if logging is enabled
- `AppLogger.log(module, message, data)` - Conditional logging
- `AppLogger.warn(module, message, data)` - Always-on warnings
- `AppLogger.error(module, message, data)` - Always-on errors
- `AppLogger.info(module, message, data)` - Alias for log

### 2. **app-state.js** (92 lines)
Application mode detection and active state management.

**Functions:**
- `getAppMode()` - Resolves multi vs single-chain mode from URL
- `getActiveTokenKey()` - Returns storage key for current mode's tokens
- `getActiveFilterKey()` - Returns storage key for current mode's filters
- `getActiveTokens(defaultVal)` - Get tokens for active mode
- `saveActiveTokens(list)` - Save tokens for active mode
- `getActiveFilters(defaultVal)` - Get filters for active mode
- `saveActiveFilters(obj)` - Save filters for active mode

### 3. **scan-lock.js** (250 lines)
Global scan lock system to prevent concurrent scans across tabs.

**Functions:**
- `getGlobalScanLock()` - Get current scan lock info
- `setGlobalScanLock(filterKey, meta)` - Acquire scan lock
- `clearGlobalScanLock(filterKey)` - Release scan lock
- `checkCanStartScan()` - Check if scanning is allowed
- `startScanLockHeartbeat(filterKey)` - Keep lock alive
- `stopScanLockHeartbeat()` - Stop heartbeat

### 4. **filters.js** (106 lines)
Filter state management for chains, CEX, DEX, and PNL.

**Functions:**
- `getPNLFilter()` - Get PNL threshold for active mode
- `setPNLFilter(value)` - Set PNL threshold for active mode
- `getFilterMulti()` - Get multi-chain filters (chains, cex, dex)
- `setFilterMulti(val)` - Set multi-chain filters
- `getFilterChain(chain)` - Get single-chain filters (cex, pair, dex)
- `setFilterChain(chain, val)` - Set single-chain filters

### 5. **tokens.js** (244 lines)
Token data management, sorting, and flattening operations.

**Functions:**
- `getTokensMulti()` - Get multi-chain tokens with ID validation
- `setTokensMulti(list)` - Save multi-chain tokens
- `setTokensMultiAsync(list)` - Async variant for multi-chain
- `getTokensChain(chain)` - Get single-chain tokens
- `setTokensChain(chain, list)` - Save single-chain tokens
- `setTokensChainAsync(chain, list)` - Async variant for single-chain
- `sortBySymbolIn(list, pref)` - Sort tokens by symbol (ASC/DESC)
- `getSortPrefForMulti()` - Get sort preference for multi-chain
- `getSortPrefForChain(chain)` - Get sort preference for chain
- `getFlattenedSortedMulti()` - Get flattened & sorted multi-chain tokens
- `getFlattenedSortedChain(chain)` - Get flattened & sorted chain tokens
- `flattenDataKoin(dataTokens)` - Flatten tokens (one row per CEX)

### 6. **formatting.js** (144 lines)
Price, currency, and display formatting utilities.

**Functions:**
- `formatPrice(price)` - Format price with special decimal handling
- `formatIDRfromUSDT(usdtAmount)` - Format USDT as IDR currency
- `convertIDRtoUSDT(idrAmount)` - Convert IDR to USDT
- `convertUSDTtoIDR(usdtAmount)` - Convert USDT to IDR
- `hexToRgba(hex, alpha)` - Convert HEX to RGBA color
- `createHoverLink(url, text, className)` - Create hyperlink with title
- `safeUrl(u, fallback)` - Validate URL with fallback
- `linkifyStatus(flag, label, urlOk, colorOk)` - Create status link (DP/WD)

### 7. **chain-helpers.js** (361 lines)
Chain configuration, CEX/DEX utilities, and RPC management.

**Functions:**
- `getChainData(chainName)` - Get chain configuration
- `GeturlExchanger(cex, NameToken, NamePair)` - Generate CEX URLs
- `_normalizeChainLabel(s)` - Normalize chain label for comparison
- `resolveWalletChainBySynonym(walletInfo, chainKey, desiredLabel)` - Resolve wallet chain
- `getWarnaCEX(cex)` - Get CEX brand color
- `generateDexLink(...)` - Generate DEX trade link
- `generateDexCellId(params)` - Generate consistent cell IDs
- `getFeeSwap(chainName)` - Calculate swap fee in USD
- `getStableSymbols()` - Get list of stablecoin symbols
- `getBaseTokenSymbol(chainName)` - Get chain's base token symbol
- `getBaseTokenUSD(chainName)` - Get base token USD price
- `getRPC(chainKey)` - Get RPC URL with custom override support
- `isDarkMode()` - Check if dark mode is active
- `resolveActiveDexList()` - Get active DEX list for current mode

### 8. **theme.js** (146 lines)
Theme application and feature readiness checks.

**Functions:**
- `getFeatureReadiness()` - Check which features are available
- `applyThemeForMode()` - Apply theme colors based on mode (multi/single-chain)

### 9. **ui-utils.js** (99 lines)
UI utilities including debouncing and scan gating.

**Functions:**
- `debounce(func, wait)` - Debounce function calls
- `setScanUIGating(isRunning)` - Enable/disable UI during scanning

## Loading Order

To maintain backward compatibility, load modules in this order in your HTML:

```html
<!-- 1. Logger (no dependencies) -->
<script src="utils/helpers/logger.js"></script>

<!-- 2. App State (depends on localStorage helpers) -->
<script src="utils/helpers/app-state.js"></script>

<!-- 3. Filters (depends on app-state) -->
<script src="utils/helpers/filters.js"></script>

<!-- 4. Scan Lock (depends on app-state) -->
<script src="utils/helpers/scan-lock.js"></script>

<!-- 5. Tokens (depends on app-state, filters) -->
<script src="utils/helpers/tokens.js"></script>

<!-- 6. Formatting (minimal dependencies) -->
<script src="utils/helpers/formatting.js"></script>

<!-- 7. Chain Helpers (depends on app-state, filters) -->
<script src="utils/helpers/chain-helpers.js"></script>

<!-- 8. Theme (depends on app-state, tokens) -->
<script src="utils/helpers/theme.js"></script>

<!-- 9. UI Utils (depends on app-state) -->
<script src="utils/helpers/ui-utils.js"></script>

<!-- 10. Main utils.js (optional namespace registration) -->
<script src="utils.js"></script>
```

## Backward Compatibility

✅ **All functions remain globally accessible via `window` object**
✅ **Function signatures are unchanged**
✅ **All original comments and logic preserved**
✅ **No breaking changes**

All existing code will continue to work without modification. Functions can be called exactly as before:

```javascript
// These all still work:
const mode = getAppMode();
const tokens = getActiveTokens();
const filter = getPNLFilter();
AppLogger.log('MyModule', 'Message');
```

## Dependencies Note

All modules depend on:
- `getFromLocalStorage()` and `saveToLocalStorage()` - Must be defined before loading modules
- `window.CONFIG_CHAINS`, `window.CONFIG_CEX`, `window.CONFIG_DEXS` - Global configuration objects
- jQuery ($) for UI utilities

## Benefits of Modular Structure

1. **Easier Maintenance** - Each module has a single responsibility
2. **Better Organization** - Related functions grouped together
3. **Improved Testability** - Modules can be tested in isolation
4. **Selective Loading** - Load only what you need
5. **Clear Dependencies** - Module headers document purpose and functions
6. **Scalability** - Easy to add new modules without bloating existing ones

## File Size Comparison

| File | Lines | Description |
|------|-------|-------------|
| Original utils.js | 1,333 | Monolithic file |
| **New Structure** | **1,575** | **Total (including headers/docs)** |
| logger.js | 66 | Logging system |
| app-state.js | 92 | Mode management |
| scan-lock.js | 250 | Scan locking |
| filters.js | 106 | Filter management |
| tokens.js | 244 | Token operations |
| formatting.js | 144 | Display formatting |
| chain-helpers.js | 361 | Chain utilities |
| theme.js | 146 | Theme & features |
| ui-utils.js | 99 | UI utilities |
| utils.js | 67 | Main entry point |

The slight increase in total lines is due to comprehensive module documentation and headers, which greatly improve maintainability and developer experience.
