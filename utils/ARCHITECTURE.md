# Utils.js Architecture Diagram

## Module Organization

```
┌─────────────────────────────────────────────────────────────────┐
│                         ORIGINAL utils.js                        │
│                         (1333 lines, 55+ functions)              │
└─────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
          ┌───────────────────────────────────────────┐
          │         REFACTORED INTO MODULES           │
          │         (1575 lines, 62 functions)        │
          └───────────────────────────────────────────┘
                                  │
        ┌─────────────────────────┼─────────────────────────┐
        │                         │                         │
        ▼                         ▼                         ▼
┌──────────────┐         ┌──────────────┐         ┌──────────────┐
│  CORE        │         │  DATA        │         │  UI & THEME  │
│  UTILITIES   │         │  MANAGEMENT  │         │  UTILITIES   │
└──────────────┘         └──────────────┘         └──────────────┘
        │                         │                         │
        ├─────────────┐           ├──────────────┐          ├──────────────┐
        ▼             ▼           ▼              ▼          ▼              ▼
  ┌─────────┐   ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐
  │ logger  │   │app-state│  │ filters │  │ tokens  │  │  theme  │  │ui-utils │
  │  .js    │   │  .js    │  │  .js    │  │  .js    │  │  .js    │  │  .js    │
  │         │   │         │  │         │  │         │  │         │  │         │
  │ 66 lines│   │ 92 lines│  │106 lines│  │244 lines│  │146 lines│  │ 99 lines│
  │ 5 funcs │   │ 7 funcs │  │ 6 funcs │  │12 funcs │  │ 2 funcs │  │ 2 funcs │
  └─────────┘   └─────────┘  └─────────┘  └─────────┘  └─────────┘  └─────────┘
                      │              │           │
                      └──────┬───────┴───────────┘
                             ▼
                    ┌──────────────┐
                    │scan-lock.js  │
                    │              │
                    │  250 lines   │
                    │  6 functions │
                    └──────────────┘
                             │
                    ┌────────┴────────┐
                    ▼                 ▼
            ┌──────────────┐  ┌──────────────┐
            │ formatting   │  │chain-helpers │
            │     .js      │  │     .js      │
            │              │  │              │
            │  144 lines   │  │  361 lines   │
            │  8 functions │  │ 14 functions │
            └──────────────┘  └──────────────┘
```

## Dependency Flow

```
┌────────────────────────────────────────────────────────────────────┐
│                         EXTERNAL DEPENDENCIES                       │
│  ────────────────────────────────────────────────────────────────  │
│  • getFromLocalStorage()  • saveToLocalStorage()                   │
│  • CONFIG_CHAINS         • CONFIG_CEX         • CONFIG_DEXS        │
│  • jQuery ($)            • getTabId()                               │
└────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    ▼                               ▼
        ┌─────────────────────┐         ┌─────────────────────┐
        │  LAYER 1: CORE      │         │  LAYER 1: LOGGING   │
        │  ─────────────────  │         │  ─────────────────  │
        │  app-state.js       │         │  logger.js          │
        │  (Mode management)  │         │  (Logging system)   │
        └─────────────────────┘         └─────────────────────┘
                    │
        ┌───────────┼───────────┐
        ▼           ▼           ▼
┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│  LAYER 2:   │ │  LAYER 2:   │ │  LAYER 2:   │
│  DATA       │ │  SECURITY   │ │  DATA       │
│  ─────────  │ │  ─────────  │ │  ─────────  │
│  filters.js │ │scan-lock.js │ │  tokens.js  │
│  (Filters)  │ │  (Locking)  │ │  (Tokens)   │
└─────────────┘ └─────────────┘ └─────────────┘
        │               │               │
        └───────┬───────┴───────┬───────┘
                ▼               ▼
        ┌─────────────┐ ┌─────────────┐
        │  LAYER 3:   │ │  LAYER 3:   │
        │  DISPLAY    │ │  CHAIN      │
        │  ─────────  │ │  ─────────  │
        │formatting.js│ │chain-       │
        │ (Formatting)│ │helpers.js   │
        └─────────────┘ └─────────────┘
                │               │
                └───────┬───────┘
                        ▼
                ┌─────────────┐
                │  LAYER 4:   │
                │  UI         │
                │  ─────────  │
                │  theme.js   │
                │  ui-utils.js│
                └─────────────┘
```

## Function Distribution by Category

```
┌─────────────────────────────────────────────────────────┐
│                    62 TOTAL FUNCTIONS                    │
├─────────────────────────────────────────────────────────┤
│  LOGGING (5)                                             │
│  ├─ isEnabled, log, warn, error, info                   │
│                                                          │
│  MODE & STATE (7)                                        │
│  ├─ getAppMode, getActiveTokenKey, getActiveFilterKey   │
│  └─ getActiveTokens, saveActiveTokens, etc.             │
│                                                          │
│  SCAN LOCK (6)                                           │
│  ├─ getGlobalScanLock, setGlobalScanLock               │
│  └─ clearGlobalScanLock, checkCanStartScan, etc.       │
│                                                          │
│  FILTERS (6)                                             │
│  ├─ getPNLFilter, setPNLFilter                          │
│  ├─ getFilterMulti, setFilterMulti                      │
│  └─ getFilterChain, setFilterChain                      │
│                                                          │
│  TOKENS (12)                                             │
│  ├─ getTokensMulti, setTokensMulti, setTokensMultiAsync│
│  ├─ getTokensChain, setTokensChain, setTokensChainAsync│
│  ├─ sortBySymbolIn, getSortPrefForMulti, etc.          │
│  └─ getFlattenedSortedMulti/Chain, flattenDataKoin     │
│                                                          │
│  FORMATTING (8)                                          │
│  ├─ formatPrice, formatIDRfromUSDT                      │
│  ├─ convertIDRtoUSDT, convertUSDTtoIDR                  │
│  ├─ hexToRgba, createHoverLink                          │
│  └─ safeUrl, linkifyStatus                              │
│                                                          │
│  CHAIN HELPERS (14)                                      │
│  ├─ getChainData, GeturlExchanger                       │
│  ├─ _normalizeChainLabel, resolveWalletChainBySynonym  │
│  ├─ getWarnaCEX, generateDexLink, generateDexCellId    │
│  ├─ getFeeSwap, getStableSymbols                        │
│  ├─ getBaseTokenSymbol, getBaseTokenUSD                 │
│  ├─ getRPC, isDarkMode                                   │
│  └─ resolveActiveDexList                                │
│                                                          │
│  THEME (2)                                               │
│  ├─ getFeatureReadiness                                 │
│  └─ applyThemeForMode                                   │
│                                                          │
│  UI UTILITIES (2)                                        │
│  ├─ debounce                                            │
│  └─ setScanUIGating                                     │
└─────────────────────────────────────────────────────────┘
```

## Loading Sequence

```
HTML Page Loads
      │
      ├─→ CONFIG_CHAINS.js
      ├─→ CONFIG_CEX.js
      ├─→ CONFIG_DEXS.js
      ├─→ localStorage.js
      ├─→ jQuery
      │
      ├─→ utils/helpers/logger.js          ✓ Ready
      │
      ├─→ utils/helpers/app-state.js       ✓ Ready
      │                                      (getAppMode available)
      │
      ├─→ utils/helpers/filters.js         ✓ Ready
      │                                      (Filter functions available)
      │
      ├─→ utils/helpers/scan-lock.js       ✓ Ready
      │                                      (Scan lock available)
      │
      ├─→ utils/helpers/tokens.js          ✓ Ready
      │                                      (Token functions available)
      │
      ├─→ utils/helpers/formatting.js      ✓ Ready
      │                                      (Format functions available)
      │
      ├─→ utils/helpers/chain-helpers.js   ✓ Ready
      │                                      (Chain functions available)
      │
      ├─→ utils/helpers/theme.js           ✓ Ready
      │                                      (Theme functions available)
      │
      ├─→ utils/helpers/ui-utils.js        ✓ Ready
      │                                      (UI functions available)
      │
      ├─→ utils.js                          ✓ All Ready
      │                                      (Namespace registered)
      │
      └─→ main.js, scanner.js, ui.js       ✓ Application Runs
```

## Data Flow Example: Scanning

```
User clicks "Start Scan"
      │
      ├─→ checkCanStartScan() [scan-lock.js]
      │   └─→ getGlobalScanLock() [scan-lock.js]
      │       └─→ getFromLocalStorage() [external]
      │
      ├─→ getAppMode() [app-state.js]
      │   └─→ Returns { type: 'multi' | 'single', chain?: '...' }
      │
      ├─→ getActiveTokens() [app-state.js]
      │   ├─→ getActiveTokenKey() [app-state.js]
      │   │   └─→ getAppMode() [app-state.js]
      │   └─→ getFromLocalStorage() [external]
      │
      ├─→ flattenDataKoin(tokens) [tokens.js]
      │   └─→ Returns flattened token array
      │
      ├─→ setScanUIGating(true) [ui-utils.js]
      │   └─→ Disables UI controls
      │
      ├─→ setGlobalScanLock(filterKey, meta) [scan-lock.js]
      │   ├─→ startScanLockHeartbeat() [scan-lock.js]
      │   └─→ saveToLocalStorage() [external]
      │
      └─→ [Scanning Process Runs...]
          │
          └─→ On Complete:
              ├─→ clearGlobalScanLock() [scan-lock.js]
              │   └─→ stopScanLockHeartbeat() [scan-lock.js]
              └─→ setScanUIGating(false) [ui-utils.js]
```

## Module Responsibilities

| Module | Primary Purpose | Secondary Purpose |
|--------|----------------|-------------------|
| **logger.js** | Centralized logging | Debug control |
| **app-state.js** | Mode detection | Storage key resolution |
| **scan-lock.js** | Prevent concurrent scans | Tab coordination |
| **filters.js** | Filter state management | Chain/CEX/DEX selection |
| **tokens.js** | Token CRUD operations | Sorting & flattening |
| **formatting.js** | Display formatting | Currency conversion |
| **chain-helpers.js** | Chain configuration | URL generation |
| **theme.js** | Theme application | Feature gating |
| **ui-utils.js** | UI state management | Debouncing |

## Key Design Principles

1. **Single Responsibility**: Each module has one clear purpose
2. **Minimal Dependencies**: Modules depend only on what they need
3. **Global Exposure**: All functions accessible via window object
4. **Backward Compatible**: Zero breaking changes
5. **Well Documented**: Comprehensive JSDoc headers
6. **Testable**: Modules can be tested in isolation
7. **Maintainable**: Clear organization and structure
8. **Scalable**: Easy to add new modules

## Success Metrics

✅ **Code Organization**: 9 focused modules vs 1 monolith
✅ **Maintainability**: 100-400 lines per module vs 1333
✅ **Documentation**: Comprehensive headers & guides
✅ **Compatibility**: 100% backward compatible
✅ **Testability**: Modular architecture enables testing
✅ **Developer Experience**: Clear structure & quick lookup
