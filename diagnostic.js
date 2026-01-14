/**
 * DIAGNOSTIC SCRIPT - Check Performance Modules
 * Run this in browser console to check if optimization modules loaded correctly
 */

(function runDiagnostics() {
    console.log('=== PERFORMANCE OPTIMIZATION DIAGNOSTICS ===\n');

    const checks = {
        '✅ Storage (getFromLocalStorage)': typeof window.getFromLocalStorage === 'function',
        '✅ Storage Async (getFromLocalStorageAsync)': typeof window.getFromLocalStorageAsync === 'function',
        '✅ CEX Cache': typeof window.CEXCache !== 'undefined',
        '✅ DEX Cache': typeof window.DEXCache !== 'undefined',
        '✅ Gas Cache': typeof window.GasCache !== 'undefined',
        '✅ CEX Batcher': typeof window.CEXBatcher !== 'undefined',
        '✅ DEX Batcher': typeof window.DEXBatcher !== 'undefined',
        '✅ DOM Batcher': typeof window.DOMBatcher !== 'undefined',
        '✅ Cleanup Manager': typeof window.CleanupManager !== 'undefined',
        '✅ IDB Flush Function': typeof window.__IDB_FLUSH_PENDING__ === 'function',
        '✅ Safe SetInterval': typeof window.safeSetInterval === 'function',
        '✅ Update Cell Helpers': typeof window.updateCellText === 'function',
        '✅ Fetch CEX With Retry': typeof window.fetchCEXWithRetry === 'function'
    };

    let allPassed = true;
    Object.entries(checks).forEach(([name, passed]) => {
        const status = passed ? '✅' : '❌';
        console.log(`${status} ${name.replace(/^✅ /, '')}: ${passed}`);
        if (!passed) allPassed = false;
    });

    console.log('\n=== CACHE STATISTICS ===');
    try {
        if (window.CEXCache) {
            console.log('CEX Cache:', window.CEXCache.getStats());
        }
        if (window.DEXCache) {
            console.log('DEX Cache:', window.DEXCache.getStats());
        }
    } catch (e) {
        console.error('Error getting cache stats:', e);
    }

    console.log('\n=== BATCHER STATISTICS ===');
    try {
        if (window.CEXBatcher) {
            console.log('CEX Batcher queue:', window.CEXBatcher.getQueueSize());
        }
        if (window.DEXBatcher) {
            console.log('DEX Batcher queue:', window.DEXBatcher.getQueueSize());
        }
    } catch (e) {
        console.error('Error getting batcher stats:', e);
    }

    console.log('\n=== DOM BATCHER STATISTICS ===');
    try {
        if (window.DOMBatcher) {
            console.log('DOM Batcher:', window.DOMBatcher.getStats());
        }
    } catch (e) {
        console.error('Error getting DOM batcher stats:', e);
    }

    console.log('\n=== CLEANUP MANAGER STATISTICS ===');
    try {
        if (window.CleanupManager) {
            console.log('Cleanup Manager:', window.CleanupManager.getStats());
            const leakCheck = window.CleanupManager.checkLeaks();
            if (leakCheck.hasLeaks) {
                console.warn('⚠️ Memory leaks detected:', leakCheck.warnings);
            } else {
                console.log('✅ No memory leaks detected');
            }
        }
    } catch (e) {
        console.error('Error getting cleanup stats:', e);
    }

    console.log('\n=== OVERALL STATUS ===');
    if (allPassed) {
        console.log('%c✅ ALL OPTIMIZATION MODULES LOADED SUCCESSFULLY', 'color: green; font-weight: bold; font-size: 14px;');
    } else {
        console.log('%c❌ SOME MODULES FAILED TO LOAD - CHECK ERRORS ABOVE', 'color: red; font-weight: bold; font-size: 14px;');
    }

    return {
        allPassed,
        checks,
        timestamp: new Date().toISOString()
    };
})();
