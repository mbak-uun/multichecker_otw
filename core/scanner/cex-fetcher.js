/**
 * =================================================================================
 * CEX FETCHER MODULE
 * =================================================================================
 *
 * This module handles all CEX (Centralized Exchange) price fetching operations:
 * - Fetching orderbook data from CEX with retry mechanism
 * - Validating CEX price data
 * - Error handling for CEX requests
 *
 * @module core/scanner/cex-fetcher
 */

(function() {
    'use strict';

/**
 * Mengambil data order book dari CEX dengan mekanisme coba ulang (retry).
 * ✅ OPTIMIZATION: Exponential backoff dengan jitter + caching + batching
 * @param {object} token - Objek data token.
 * @param {string} tableBodyId - ID dari tbody tabel.
 * @param {object} options - Opsi tambahan (maxAttempts, baseDelay, useCache, useBatcher).
 * @returns {Promise<{ok: boolean, data: object|null, error: any}>} Hasil fetch.
 */
async function fetchCEXWithRetry(token, tableBodyId, options = {}) {
    const maxAttempts = Number(options.maxAttempts) > 0 ? Number(options.maxAttempts) : 3;
    const baseDelay = Number(options.baseDelay) >= 0 ? Number(options.baseDelay) : 200; // Base delay 200ms
    const useCache = options.useCache !== false; // Default: enabled
    const useBatcher = options.useBatcher !== false; // Default: enabled

    // ✅ OPTIMIZATION: Generate cache key
    const cacheKey = useCache ? `${token.cex}:${token.symbol_in}:${token.symbol_out}` : null;

    // ✅ OPTIMIZATION: Check cache first (with safety checks)
    if (useCache && typeof window !== 'undefined' && window.CEXCache && typeof window.CEXCache.has === 'function') {
        try {
            const cached = window.CEXCache.has(cacheKey);
            if (cached) {
                const data = await window.CEXCache.get(cacheKey, async () => null);
                if (data) {
                    return { ok: true, data, fromCache: true };
                }
            }
        } catch (error) {
            // Cache error - continue to fetch (log for debugging)
            try {
                if (window.SCAN_LOG_ENABLED) {
                    console.warn('[CEX Fetcher] Cache error:', error);
                }
            } catch (_) {}
        }
    }

    let attempts = 0;
    let lastError = null;
    let lastData = null;

    // Core fetch function with retry logic
    const fetchWithRetry = async () => {
        while (attempts < maxAttempts) {
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
                    // ✅ OPTIMIZATION: Cache successful response (with safety check)
                    if (useCache && cacheKey && typeof window !== 'undefined' && window.CEXCache && typeof window.CEXCache.set === 'function') {
                        try {
                            window.CEXCache.set(cacheKey, data);
                        } catch (error) {
                            // Cache write failed - continue anyway (not critical)
                            try {
                                if (window.SCAN_LOG_ENABLED) {
                                    console.warn('[CEX Fetcher] Cache write error:', error);
                                }
                            } catch (_) {}
                        }
                    }
                    return { ok: true, data };
                }
                lastError = 'Harga CEX tidak lengkap';
            } catch (error) {
                lastError = error;
            }

            // Jika gagal, tunggu dengan exponential backoff + jitter
            attempts += 1;
            if (attempts < maxAttempts) {
                // ✅ Exponential backoff: 200ms → 400ms → 800ms
                const delay = baseDelay * Math.pow(2, attempts - 1);
                // ✅ Add jitter (±25%) to prevent thundering herd
                const jitter = delay * (0.75 + Math.random() * 0.5); // 75%-125% of delay
                const finalDelay = Math.min(Math.round(jitter), 2000); // Cap at 2 seconds

                await new Promise(resolve => setTimeout(resolve, finalDelay));
            }
        }
        return { ok: false, data: lastData, error: lastError };
    };

    // ✅ OPTIMIZATION: Use request batcher if enabled (with safety check)
    if (useBatcher && typeof window !== 'undefined' && window.CEXBatcher && typeof window.CEXBatcher.add === 'function') {
        try {
            return await window.CEXBatcher.add(fetchWithRetry);
        } catch (error) {
            // Batcher failed, fallback to direct fetch
            try {
                if (window.SCAN_LOG_ENABLED) {
                    console.warn('[CEX Fetcher] Batcher error, using direct fetch:', error);
                }
            } catch (_) {}
            return await fetchWithRetry();
        }
    }

    // Direct fetch without batcher
    return await fetchWithRetry();
}

// =================================================================================
// EXPORT TO GLOBAL SCOPE (for backward compatibility)
// =================================================================================
if (typeof window !== 'undefined') {
    window.fetchCEXWithRetry = fetchCEXWithRetry;
}

})(); // End IIFE
