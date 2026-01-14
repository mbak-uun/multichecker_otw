/**
 * =================================================================================
 * DOM BATCHER - Performance Optimization
 * =================================================================================
 *
 * Batches DOM updates to prevent layout thrashing and excessive repaints.
 *
 * Features:
 * - RequestAnimationFrame-based batching
 * - Read/Write separation to prevent forced reflows
 * - Queue management with automatic flushing
 * - Multiple update types support
 *
 * Usage:
 * ```javascript
 * DOMBatcher.scheduleUpdate(element, {
 *     read: (el) => el.offsetWidth,
 *     write: (el) => el.style.width = '100px'
 * });
 * ```
 *
 * @module core/performance/dom-batcher
 */

(function() {
    'use strict';

    // ✅ SAFETY: Check if optimization should be disabled
    if (typeof window !== 'undefined' && window.DISABLE_OPTIMIZATIONS === true) {
        console.warn('[DOMBatcher] Optimizations disabled via DISABLE_OPTIMIZATIONS flag');
        return;
    }

    /**
     * DOM Batcher Class
     * ✅ OPTIMIZATION: Eliminates layout thrashing by batching DOM operations
     *
     * Implements the FastDOM pattern:
     * 1. Batch all reads first (measure)
     * 2. Then batch all writes (mutate)
     * 3. Execute in single animation frame
     */
    class DOMBatcher {
        constructor() {
            this.reads = [];
            this.writes = [];
            this.rafId = null;
            this.stats = {
                totalReads: 0,
                totalWrites: 0,
                batchCount: 0
            };
        }

        /**
         * Schedule a DOM update
         * @param {HTMLElement} element - Target element
         * @param {object} operations - Read and/or write operations
         * @param {Function} operations.read - Read operation (optional)
         * @param {Function} operations.write - Write operation (optional)
         * @returns {Promise} Promise that resolves when operation completes
         */
        scheduleUpdate(element, operations) {
            return new Promise((resolve, reject) => {
                try {
                    if (!element) {
                        reject(new Error('Element is required'));
                        return;
                    }

                    const task = {
                        element,
                        operations,
                        resolve,
                        reject
                    };

                    // Add to appropriate queue
                    if (operations.read) {
                        this.reads.push(task);
                    }
                    if (operations.write) {
                        this.writes.push(task);
                    }

                    // Schedule flush if not already scheduled
                    if (!this.rafId) {
                        this.rafId = requestAnimationFrame(() => this.flush());
                    }
                } catch (error) {
                    reject(error);
                }
            });
        }

        /**
         * Batch multiple text content updates
         * Optimized for table cell updates during scan
         * @param {Array<{element: HTMLElement, content: string}>} updates
         */
        batchTextUpdates(updates) {
            if (!Array.isArray(updates) || updates.length === 0) return;

            updates.forEach(({ element, content }) => {
                this.scheduleUpdate(element, {
                    write: (el) => {
                        if (el && typeof content !== 'undefined') {
                            el.textContent = content;
                        }
                    }
                });
            });
        }

        /**
         * Batch multiple HTML updates
         * @param {Array<{element: HTMLElement, html: string}>} updates
         */
        batchHTMLUpdates(updates) {
            if (!Array.isArray(updates) || updates.length === 0) return;

            updates.forEach(({ element, html }) => {
                this.scheduleUpdate(element, {
                    write: (el) => {
                        if (el && typeof html !== 'undefined') {
                            el.innerHTML = html;
                        }
                    }
                });
            });
        }

        /**
         * Batch class modifications
         * @param {Array<{element: HTMLElement, add: string[], remove: string[]}>} updates
         */
        batchClassUpdates(updates) {
            if (!Array.isArray(updates) || updates.length === 0) return;

            updates.forEach(({ element, add, remove }) => {
                this.scheduleUpdate(element, {
                    write: (el) => {
                        if (!el) return;
                        if (Array.isArray(remove)) {
                            el.classList.remove(...remove);
                        }
                        if (Array.isArray(add)) {
                            el.classList.add(...add);
                        }
                    }
                });
            });
        }

        /**
         * Batch style updates
         * @param {Array<{element: HTMLElement, styles: object}>} updates
         */
        batchStyleUpdates(updates) {
            if (!Array.isArray(updates) || updates.length === 0) return;

            updates.forEach(({ element, styles }) => {
                this.scheduleUpdate(element, {
                    write: (el) => {
                        if (!el || !styles) return;
                        Object.assign(el.style, styles);
                    }
                });
            });
        }

        /**
         * Flush all pending operations
         * Executes all reads first, then all writes
         */
        flush() {
            this.rafId = null;
            this.stats.batchCount++;

            // PHASE 1: Execute all reads (measure)
            const readResults = [];
            while (this.reads.length > 0) {
                const task = this.reads.shift();
                try {
                    const result = task.operations.read(task.element);
                    readResults.push({ task, result });
                    this.stats.totalReads++;
                } catch (error) {
                    task.reject(error);
                }
            }

            // PHASE 2: Execute all writes (mutate)
            while (this.writes.length > 0) {
                const task = this.writes.shift();
                try {
                    task.operations.write(task.element);
                    task.resolve();
                    this.stats.totalWrites++;
                } catch (error) {
                    task.reject(error);
                }
            }

            // Resolve read tasks
            readResults.forEach(({ task, result }) => {
                task.resolve(result);
            });
        }

        /**
         * Force immediate flush (use sparingly)
         */
        forceFlush() {
            if (this.rafId) {
                cancelAnimationFrame(this.rafId);
                this.rafId = null;
            }
            this.flush();
        }

        /**
         * Clear all pending operations
         */
        clear() {
            if (this.rafId) {
                cancelAnimationFrame(this.rafId);
                this.rafId = null;
            }

            // Reject all pending tasks
            [...this.reads, ...this.writes].forEach(task => {
                task.reject(new Error('Batch cleared'));
            });

            this.reads = [];
            this.writes = [];
        }

        /**
         * Get batching statistics
         * @returns {object} Stats
         */
        getStats() {
            return {
                ...this.stats,
                pendingReads: this.reads.length,
                pendingWrites: this.writes.length,
                avgReadsPerBatch: this.stats.batchCount > 0
                    ? (this.stats.totalReads / this.stats.batchCount).toFixed(2)
                    : 0,
                avgWritesPerBatch: this.stats.batchCount > 0
                    ? (this.stats.totalWrites / this.stats.batchCount).toFixed(2)
                    : 0
            };
        }

        /**
         * Reset statistics
         */
        resetStats() {
            this.stats = {
                totalReads: 0,
                totalWrites: 0,
                batchCount: 0
            };
        }
    }

    // =================================================================================
    // EXPORT TO GLOBAL SCOPE
    // =================================================================================
    if (typeof window !== 'undefined') {
        // Create singleton instance
        window.DOMBatcher = new DOMBatcher();

        // Helper functions for common operations
        window.updateCellText = function(cellId, text) {
            const cell = document.getElementById(cellId);
            if (cell) {
                window.DOMBatcher.scheduleUpdate(cell, {
                    write: (el) => { el.textContent = text; }
                });
            }
        };

        window.updateCellHTML = function(cellId, html) {
            const cell = document.getElementById(cellId);
            if (cell) {
                window.DOMBatcher.scheduleUpdate(cell, {
                    write: (el) => { el.innerHTML = html; }
                });
            }
        };

        window.updateCellClass = function(cellId, addClass, removeClass) {
            const cell = document.getElementById(cellId);
            if (cell) {
                window.DOMBatcher.scheduleUpdate(cell, {
                    write: (el) => {
                        if (removeClass) el.classList.remove(...(Array.isArray(removeClass) ? removeClass : [removeClass]));
                        if (addClass) el.classList.add(...(Array.isArray(addClass) ? addClass : [addClass]));
                    }
                });
            }
        };

        try {
            if (window.SCAN_LOG_ENABLED) {
                console.log('[DOMBatcher] ✅ Initialized - Ready for batched DOM updates');
            }
        } catch (_) {}
    }

})(); // End IIFE
