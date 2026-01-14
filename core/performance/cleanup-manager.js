/**
 * =================================================================================
 * CLEANUP MANAGER - Performance Optimization
 * =================================================================================
 *
 * Manages cleanup of resources to prevent memory leaks.
 *
 * Features:
 * - Centralized cleanup registration
 * - Automatic cleanup on scan stop
 * - Event listener tracking
 * - Timer/interval tracking
 * - Global state cleanup
 *
 * Usage:
 * ```javascript
 * CleanupManager.register(() => {
 *     clearInterval(myInterval);
 * });
 *
 * CleanupManager.cleanup(); // Execute all cleanup functions
 * ```
 *
 * @module core/performance/cleanup-manager
 */

(function() {
    'use strict';

    // ✅ SAFETY: Check if optimization should be disabled
    if (typeof window !== 'undefined' && window.DISABLE_OPTIMIZATIONS === true) {
        console.warn('[CleanupManager] Optimizations disabled via DISABLE_OPTIMIZATIONS flag');
        return;
    }

    /**
     * Cleanup Manager Class
     * ✅ OPTIMIZATION: Prevents memory leaks by tracking and cleaning resources
     */
    class CleanupManager {
        constructor() {
            this.cleanupFns = [];
            this.intervals = new Map();
            this.timeouts = new Map();
            this.eventListeners = new Map();
            this.stats = {
                totalCleanups: 0,
                intervalsCleared: 0,
                timeoutsCleared: 0,
                listenersRemoved: 0
            };
        }

        /**
         * Register a cleanup function
         * @param {Function} fn - Cleanup function to execute
         * @param {string} name - Optional name for debugging
         */
        register(fn, name) {
            if (typeof fn !== 'function') {
                console.warn('[CleanupManager] Invalid cleanup function');
                return;
            }

            this.cleanupFns.push({
                fn,
                name: name || 'anonymous',
                registeredAt: Date.now()
            });
        }

        /**
         * Track an interval for automatic cleanup
         * @param {number} id - Interval ID from setInterval
         * @param {string} name - Name for debugging
         */
        trackInterval(id, name) {
            this.intervals.set(id, {
                name: name || 'anonymous',
                createdAt: Date.now()
            });

            // Auto-register cleanup
            this.register(() => {
                clearInterval(id);
                this.intervals.delete(id);
            }, `interval:${name}`);

            return id;
        }

        /**
         * Track a timeout for automatic cleanup
         * @param {number} id - Timeout ID from setTimeout
         * @param {string} name - Name for debugging
         */
        trackTimeout(id, name) {
            this.timeouts.set(id, {
                name: name || 'anonymous',
                createdAt: Date.now()
            });

            // Auto-register cleanup
            this.register(() => {
                clearTimeout(id);
                this.timeouts.delete(id);
            }, `timeout:${name}`);

            return id;
        }

        /**
         * Track an event listener for automatic cleanup
         * @param {HTMLElement} element - Target element
         * @param {string} event - Event name
         * @param {Function} handler - Event handler
         * @param {object} options - Event listener options
         */
        trackEventListener(element, event, handler, options) {
            const key = `${element.id || 'element'}-${event}`;

            if (!this.eventListeners.has(key)) {
                this.eventListeners.set(key, []);
            }

            this.eventListeners.get(key).push({
                element,
                event,
                handler,
                options,
                addedAt: Date.now()
            });

            // Auto-register cleanup
            this.register(() => {
                element.removeEventListener(event, handler, options);
            }, `listener:${key}`);

            // Add the listener
            element.addEventListener(event, handler, options);
        }

        /**
         * Clear a specific interval
         * @param {number} id - Interval ID
         */
        clearInterval(id) {
            if (this.intervals.has(id)) {
                clearInterval(id);
                this.intervals.delete(id);
                this.stats.intervalsCleared++;
            }
        }

        /**
         * Clear a specific timeout
         * @param {number} id - Timeout ID
         */
        clearTimeout(id) {
            if (this.timeouts.has(id)) {
                clearTimeout(id);
                this.timeouts.delete(id);
                this.stats.timeoutsCleared++;
            }
        }

        /**
         * Execute all cleanup functions
         */
        async cleanup() {
            try {
                if (window.SCAN_LOG_ENABLED) {
                    console.log(`[CleanupManager] Running cleanup (${this.cleanupFns.length} functions)...`);
                }
            } catch (_) {}

            // Execute all cleanup functions
            for (const item of this.cleanupFns) {
                try {
                    await item.fn();
                    this.stats.totalCleanups++;
                } catch (error) {
                    console.error(`[CleanupManager] Cleanup error (${item.name}):`, error);
                }
            }

            // Clear all intervals
            this.intervals.forEach((info, id) => {
                try {
                    clearInterval(id);
                    this.stats.intervalsCleared++;
                } catch (_) {}
            });
            this.intervals.clear();

            // Clear all timeouts
            this.timeouts.forEach((info, id) => {
                try {
                    clearTimeout(id);
                    this.stats.timeoutsCleared++;
                } catch (_) {}
            });
            this.timeouts.clear();

            // Remove all event listeners
            this.eventListeners.forEach((listeners, key) => {
                listeners.forEach(({ element, event, handler, options }) => {
                    try {
                        element.removeEventListener(event, handler, options);
                        this.stats.listenersRemoved++;
                    } catch (_) {}
                });
            });
            this.eventListeners.clear();

            // Clear cleanup functions
            this.cleanupFns = [];

            try {
                if (window.SCAN_LOG_ENABLED) {
                    console.log('[CleanupManager] ✅ Cleanup complete', this.stats);
                }
            } catch (_) {}
        }

        /**
         * Cleanup specific to scanner operations
         */
        async cleanupScanner() {
            // Clear global scanner variables
            if (typeof window !== 'undefined') {
                try {
                    // Clear token arrays
                    if (window.filteredTokens) window.filteredTokens = [];
                    if (window.originalTokens) window.originalTokens = [];

                    // Clear DEX tickers
                    if (window._DEX_TICKERS) {
                        window._DEX_TICKERS.forEach(id => clearInterval(id));
                        window._DEX_TICKERS.clear();
                    }

                    // Clear auto-run interval
                    if (window.__autoRunInterval) {
                        clearInterval(window.__autoRunInterval);
                        window.__autoRunInterval = null;
                    }

                    // Clear animation frame
                    if (window.__scanAnimationFrameId) {
                        cancelAnimationFrame(window.__scanAnimationFrameId);
                        window.__scanAnimationFrameId = null;
                    }

                    // Clear request batchers queue (but keep instance)
                    if (window.CEXBatcher && typeof window.CEXBatcher.clear === 'function') {
                        // Don't clear - let pending requests complete
                    }

                    // Clear caches (optional - preserve for performance)
                    // if (window.CEXCache) window.CEXCache.clear();
                    // if (window.DEXCache) window.DEXCache.clear();

                } catch (error) {
                    console.error('[CleanupManager] Scanner cleanup error:', error);
                }
            }

            // Execute general cleanup
            await this.cleanup();
        }

        /**
         * Get cleanup statistics
         * @returns {object} Statistics
         */
        getStats() {
            return {
                ...this.stats,
                pendingCleanups: this.cleanupFns.length,
                activeIntervals: this.intervals.size,
                activeTimeouts: this.timeouts.size,
                activeListeners: Array.from(this.eventListeners.values()).reduce((sum, arr) => sum + arr.length, 0)
            };
        }

        /**
         * Reset statistics
         */
        resetStats() {
            this.stats = {
                totalCleanups: 0,
                intervalsCleared: 0,
                timeoutsCleared: 0,
                listenersRemoved: 0
            };
        }

        /**
         * Check for potential memory leaks
         * @returns {object} Leak warnings
         */
        checkLeaks() {
            const warnings = [];

            // Check for too many intervals
            if (this.intervals.size > 50) {
                warnings.push({
                    type: 'intervals',
                    count: this.intervals.size,
                    message: `${this.intervals.size} active intervals detected (potential leak)`
                });
            }

            // Check for too many timeouts
            if (this.timeouts.size > 100) {
                warnings.push({
                    type: 'timeouts',
                    count: this.timeouts.size,
                    message: `${this.timeouts.size} active timeouts detected (potential leak)`
                });
            }

            // Check for too many event listeners
            const listenerCount = Array.from(this.eventListeners.values()).reduce((sum, arr) => sum + arr.length, 0);
            if (listenerCount > 200) {
                warnings.push({
                    type: 'listeners',
                    count: listenerCount,
                    message: `${listenerCount} active event listeners detected (potential leak)`
                });
            }

            return {
                hasLeaks: warnings.length > 0,
                warnings
            };
        }
    }

    // =================================================================================
    // EXPORT TO GLOBAL SCOPE
    // =================================================================================
    if (typeof window !== 'undefined') {
        // Create singleton instance
        window.CleanupManager = new CleanupManager();

        // Helper functions for common patterns
        window.safeSetInterval = function(fn, delay, name) {
            const id = setInterval(fn, delay);
            window.CleanupManager.trackInterval(id, name);
            return id;
        };

        window.safeSetTimeout = function(fn, delay, name) {
            const id = setTimeout(fn, delay);
            window.CleanupManager.trackTimeout(id, name);
            return id;
        };

        window.safeAddEventListener = function(element, event, handler, options, name) {
            window.CleanupManager.trackEventListener(element, event, handler, options);
        };

        try {
            if (window.SCAN_LOG_ENABLED) {
                console.log('[CleanupManager] ✅ Initialized - Memory leak prevention active');
            }
        } catch (_) {}

        // Auto-check for leaks every 5 minutes (in development)
        if (window.SCAN_LOG_ENABLED) {
            setInterval(() => {
                const leakCheck = window.CleanupManager.checkLeaks();
                if (leakCheck.hasLeaks) {
                    console.warn('[CleanupManager] ⚠️ Potential memory leaks detected:', leakCheck.warnings);
                }
            }, 300000); // 5 minutes
        }
    }

})(); // End IIFE
