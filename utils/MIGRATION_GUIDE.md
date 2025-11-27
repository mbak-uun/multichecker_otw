# Utils.js Refactoring - Migration Guide

## Overview

The original 1333-line `utils.js` file has been refactored into 9 focused modules under `utils/helpers/`. This guide explains the changes and how to migrate your HTML files.

## What Changed

### Before (Old Structure)
```
/Users/ochiem/Documents/ONLINE-APP/FIX-ALL/
├── utils.js (1333 lines - everything in one file)
```

### After (New Structure)
```
/Users/ochiem/Documents/ONLINE-APP/FIX-ALL/
├── utils.js (67 lines - main entry point)
└── utils/helpers/
    ├── logger.js (66 lines)
    ├── app-state.js (92 lines)
    ├── scan-lock.js (250 lines)
    ├── filters.js (106 lines)
    ├── tokens.js (244 lines)
    ├── formatting.js (144 lines)
    ├── chain-helpers.js (361 lines)
    ├── theme.js (146 lines)
    ├── ui-utils.js (99 lines)
    ├── README.md (documentation)
    ├── loader.html (HTML snippet)
    └── MIGRATION_GUIDE.md (this file)
```

## Migration Steps

### Step 1: Update HTML File Script References

**OLD** (in your index.html or other HTML files):
```html
<script src="utils.js"></script>
```

**NEW** (replace with):
```html
<!-- Utils Helpers - Modular Loading -->
<script src="utils/helpers/logger.js"></script>
<script src="utils/helpers/app-state.js"></script>
<script src="utils/helpers/filters.js"></script>
<script src="utils/helpers/scan-lock.js"></script>
<script src="utils/helpers/tokens.js"></script>
<script src="utils/helpers/formatting.js"></script>
<script src="utils/helpers/chain-helpers.js"></script>
<script src="utils/helpers/theme.js"></script>
<script src="utils/helpers/ui-utils.js"></script>
<script src="utils.js"></script>
```

### Step 2: Verify Script Loading Order

Ensure scripts are loaded in this order:

1. **Configuration files** (CONFIG_CHAINS, CONFIG_CEX, CONFIG_DEXS)
2. **localStorage helpers** (getFromLocalStorage, saveToLocalStorage)
3. **jQuery** (if using UI utilities)
4. **Utils modules** (see Step 1)
5. **Application scripts** (your main.js, scanner.js, etc.)

Example complete loading order:
```html
<!DOCTYPE html>
<html>
<head>
    <title>Scanner App</title>
    <!-- CSS files -->
</head>
<body>
    <!-- UI content -->

    <!-- 1. Configuration -->
    <script src="config/chains.js"></script>
    <script src="config/cex.js"></script>
    <script src="config/dexs.js"></script>

    <!-- 2. Core dependencies -->
    <script src="js/localStorage.js"></script>
    <script src="js/jquery.min.js"></script>

    <!-- 3. Utils modules (new modular structure) -->
    <script src="utils/helpers/logger.js"></script>
    <script src="utils/helpers/app-state.js"></script>
    <script src="utils/helpers/filters.js"></script>
    <script src="utils/helpers/scan-lock.js"></script>
    <script src="utils/helpers/tokens.js"></script>
    <script src="utils/helpers/formatting.js"></script>
    <script src="utils/helpers/chain-helpers.js"></script>
    <script src="utils/helpers/theme.js"></script>
    <script src="utils/helpers/ui-utils.js"></script>
    <script src="utils.js"></script>

    <!-- 4. Application scripts -->
    <script src="js/main.js"></script>
    <script src="js/scanner.js"></script>
    <script src="js/ui.js"></script>
</body>
</html>
```

### Step 3: No Code Changes Required

✅ **All functions remain globally accessible**
✅ **All function signatures unchanged**
✅ **No modifications needed in your application code**

All existing code continues to work:
```javascript
// All these still work exactly as before:
const mode = getAppMode();
const tokens = getActiveTokens();
const filter = getPNLFilter();
AppLogger.log('MyModule', 'Starting scan');
const formatted = formatPrice(123.456);
```

### Step 4: Optional - Backup Original utils.js

If you want to keep the original file as backup:
```bash
cp utils.js utils.js.backup
```

## Modules Overview

| Module | Purpose | Key Functions |
|--------|---------|---------------|
| **logger.js** | Centralized logging | AppLogger.log, warn, error |
| **app-state.js** | Mode management | getAppMode, getActiveTokenKey |
| **scan-lock.js** | Scan locking | getGlobalScanLock, setGlobalScanLock |
| **filters.js** | Filter state | getPNLFilter, getFilterMulti |
| **tokens.js** | Token operations | getTokensMulti, flattenDataKoin |
| **formatting.js** | Display helpers | formatPrice, formatIDRfromUSDT |
| **chain-helpers.js** | Chain utilities | getChainData, generateDexLink |
| **theme.js** | Theme & features | applyThemeForMode, getFeatureReadiness |
| **ui-utils.js** | UI utilities | debounce, setScanUIGating |

## Testing After Migration

### 1. Visual Check
- Open your application in browser
- Check browser console for errors
- Verify all UI elements load correctly

### 2. Functional Testing
- Test mode switching (multi ↔ single chain)
- Test token management (add/edit/delete)
- Test scanner functionality
- Test filter changes
- Test theme switching

### 3. Console Verification
Open browser console and verify all functions are accessible:
```javascript
// Test in browser console:
console.log(typeof getAppMode); // should be "function"
console.log(typeof AppLogger); // should be "object"
console.log(typeof formatPrice); // should be "function"
console.log(typeof getTokensMulti); // should be "function"
```

## Troubleshooting

### Issue: "Function is not defined" errors

**Cause**: Scripts loaded in wrong order

**Solution**: Verify utils modules load AFTER localStorage helpers and BEFORE application scripts

### Issue: Some functions missing

**Cause**: Missing module script tag

**Solution**: Ensure all 9 module files are included in HTML

### Issue: Styling broken

**Cause**: theme.js not loaded or loaded too late

**Solution**: Verify theme.js is loaded and applyThemeForMode() is called

### Issue: Scanner not starting

**Cause**: scan-lock.js or tokens.js not loaded

**Solution**: Include all modules in correct order

## Rollback Instructions

If you need to rollback to the old single-file version:

1. Restore the backup (if created):
   ```bash
   cp utils.js.backup utils.js
   ```

2. Update HTML to old structure:
   ```html
   <!-- Remove all utils/helpers/*.js scripts -->
   <!-- Replace with: -->
   <script src="utils.js"></script>
   ```

## Benefits of New Structure

1. **Maintainability**: Each module has clear responsibility
2. **Debugging**: Easier to locate and fix issues
3. **Performance**: Can selectively load only needed modules
4. **Testing**: Modules can be tested independently
5. **Documentation**: Each module has comprehensive headers
6. **Scalability**: Easy to add new features without bloating files

## Support

For questions or issues:
1. Check `utils/helpers/README.md` for detailed module documentation
2. Review this migration guide
3. Test in browser console to isolate issues
4. Check browser console for error messages

## Summary

✅ **No breaking changes** - All code remains backward compatible
✅ **No logic changes** - Pure code organization refactoring
✅ **All functions preserved** - Every function from original file included
✅ **Global access maintained** - All functions still accessible via window object
✅ **Comments preserved** - All original documentation kept
✅ **Easy migration** - Just update HTML script tags

The refactoring improves code organization without changing functionality.
