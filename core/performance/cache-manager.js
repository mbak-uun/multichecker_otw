/**
 * =================================================================================
 * CACHE MANAGER - Performance Optimization
 * =================================================================================
 *
 * In-memory cache for API responses with TTL (Time To Live) support.
 *
 * Features:
 * - TTL-based expiration
 * - Automatic cleanup of expired entries
 * - Key-based caching with JSON serialization
 * - Cache statistics
 *
 * Usage:
 * ```javascript
 * const cache = new CacheManager({ ttl: 30000 }); // 30 seconds TTL
 * const data = await cache.get(key, async () => await fetchData());
 * ```
 *
 * @module core/performance/cache-manager
 */

(function() {
    'use strict';

    // ✅ SAFETY: Check if optimization should be disabled
    if (typeof window !== 'undefined' && window.DISABLE_OPTIMIZATIONS === true) {
        console.warn('[CacheManager] Optimizations disabled via DISABLE_OPTIMIZATIONS flag');
        return;
    }

    /**
     * Cache Manager Class
     * ✅ OPTIMIZATION: Eliminates duplicate API requests
     */
    class CacheManager {
        /**
         * Create a new cache manager
         * @param {object} options - Configuration options
         * @param {number} options.ttl - Time to live in milliseconds (default: 30000)
         * @param {number} options.maxSize - Maximum cache entries (default: 1000)
         * @param {number} options.cleanupInterval - Cleanup interval in ms (default: 60000)
         */
        constructor(options = {}) {
            this.ttl = options.ttl || 30000; // 30 seconds default
            this.maxSize = options.maxSize || 1000;
            this.cleanupInterval = options.cleanupInterval || 60000; // 1 minute
            this.cache = new Map();
            this.stats = {
                hits: 0,
                misses: 0,
                sets: 0,
                evictions: 0
            };

            // Start automatic cleanup
            this.startCleanup();
        }

        /**
         * Generate cache key from parameters
         * @param {object} params - Parameters to hash
         * @returns {string} Cache key
         */
        getCacheKey(params) {
            try {
                return JSON.stringify(params);
            } catch (e) {
                return String(params);
            }
        }

        /**
         * Get value from cache or fetch it
         * @param {string} key - Cache key
         * @param {Function} fetchFn - Async function to fetch data if not cached
         * @returns {Promise} Cached or fetched data
         */
        async get(key, fetchFn) {
            const cached = this.cache.get(key);

            // Check if cached and not expired
            if (cached && Date.now() - cached.timestamp < this.ttl) {
                this.stats.hits++;
                return cached.data;
            }

            // Cache miss or expired
            this.stats.misses++;

            // Fetch fresh data
            const data = await fetchFn();

            // Store in cache
            this.set(key, data);

            return data;
        }

        /**
         * Set value in cache
         * @param {string} key - Cache key
         * @param {*} data - Data to cache
         */
        set(key, data) {
            // Enforce max size (LRU eviction)
            if (this.cache.size >= this.maxSize) {
                const firstKey = this.cache.keys().next().value;
                this.cache.delete(firstKey);
                this.stats.evictions++;
            }

            this.cache.set(key, {
                data,
                timestamp: Date.now()
            });

            this.stats.sets++;
        }

        /**
         * Check if key exists and is not expired
         * @param {string} key - Cache key
         * @returns {boolean} True if key exists and is valid
         */
        has(key) {
            const cached = this.cache.get(key);
            if (!cached) return false;

            // Check expiration
            if (Date.now() - cached.timestamp >= this.ttl) {
                this.cache.delete(key);
                return false;
            }

            return true;
        }

        /**
         * Delete a key from cache
         * @param {string} key - Cache key
         */
        delete(key) {
            this.cache.delete(key);
        }

        /**
         * Clear all cache entries
         */
        clear() {
            this.cache.clear();
            this.stats.evictions += this.cache.size;
        }

        /**
         * Get cache statistics
         * @returns {object} Cache stats
         */
        getStats() {
            return {
                ...this.stats,
                size: this.cache.size,
                hitRate: this.stats.hits > 0
                    ? (this.stats.hits / (this.stats.hits + this.stats.misses) * 100).toFixed(2) + '%'
                    : '0%'
            };
        }

        /**
         * Start automatic cleanup of expired entries
         */
        startCleanup() {
            this.cleanupTimer = setInterval(() => {
                const now = Date.now();
                let cleaned = 0;

                for (const [key, value] of this.cache.entries()) {
                    if (now - value.timestamp >= this.ttl) {
                        this.cache.delete(key);
                        cleaned++;
                    }
                }

                if (cleaned > 0) {
                    try {
                        if (window.SCAN_LOG_ENABLED) {
                            console.log(`[CacheManager] Cleaned ${cleaned} expired entries`);
                        }
                    } catch (_) {}
                }
            }, this.cleanupInterval);
        }

        /**
         * Stop automatic cleanup
         */
        stopCleanup() {
            if (this.cleanupTimer) {
                clearInterval(this.cleanupTimer);
                this.cleanupTimer = null;
            }
        }

        /**
         * Destroy cache manager and cleanup
         */
        destroy() {
            this.stopCleanup();
            this.clear();
        }
    }

    // =================================================================================
    // EXPORT TO GLOBAL SCOPE
    // =================================================================================
    if (typeof window !== 'undefined') {
        window.CacheManager = CacheManager;

        // ✅ Create singleton instances for CEX and DEX responses
        window.CEXCache = new CacheManager({
            ttl: 30000, // 30 seconds (CEX prices change frequently)
            maxSize: 500,
            cleanupInterval: 60000
        });

        window.DEXCache = new CacheManager({
            ttl: 20000, // 20 seconds (DEX prices change very frequently)
            maxSize: 1000,
            cleanupInterval: 60000
        });

        // ✅ Gas price cache (longer TTL)
        window.GasCache = new CacheManager({
            ttl: 60000, // 1 minute (gas prices change slower)
            maxSize: 100,
            cleanupInterval: 120000
        });

        try {
            if (window.SCAN_LOG_ENABLED) {
                console.log('[CacheManager] ✅ Initialized - CEX, DEX & Gas caches ready');
            }
        } catch (_) {}
    }

})(); // End IIFE
