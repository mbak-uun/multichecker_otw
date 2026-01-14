/**
 * =================================================================================
 * REQUEST BATCHER - Performance Optimization
 * =================================================================================
 *
 * Batches multiple API requests to reduce network congestion and prevent rate limiting.
 *
 * Features:
 * - Automatic batching based on batch size and delay
 * - Concurrency control to prevent overwhelming the API
 * - Queue management with Promise-based API
 *
 * Usage:
 * ```javascript
 * const batcher = new RequestBatcher({ batchSize: 10, batchDelay: 50 });
 * const result = await batcher.add(() => fetch('https://api.example.com'));
 * ```
 *
 * @module core/performance/request-batcher
 */

(function() {
    'use strict';

    // ✅ SAFETY: Check if optimization should be disabled
    if (typeof window !== 'undefined' && window.DISABLE_OPTIMIZATIONS === true) {
        console.warn('[RequestBatcher] Optimizations disabled via DISABLE_OPTIMIZATIONS flag');
        return;
    }

    /**
     * Request Batcher Class
     * ✅ OPTIMIZATION: Reduces N requests → batches of M requests
     */
    class RequestBatcher {
        /**
         * Create a new request batcher
         * @param {object} options - Configuration options
         * @param {number} options.batchSize - Max requests per batch (default: 10)
         * @param {number} options.batchDelay - Delay before auto-flush in ms (default: 50)
         * @param {number} options.maxConcurrency - Max concurrent batches (default: 3)
         */
        constructor(options = {}) {
            this.batchSize = options.batchSize || 10;
            this.batchDelay = options.batchDelay || 50; // ms
            this.maxConcurrency = options.maxConcurrency || 3;
            this.queue = [];
            this.timer = null;
            this.activeBatches = 0;
        }

        /**
         * Add a request to the batch queue
         * @param {Function} fn - Async function to execute (returns Promise)
         * @returns {Promise} Promise that resolves with the result
         */
        async add(fn) {
            return new Promise((resolve, reject) => {
                this.queue.push({ fn, resolve, reject });

                // Auto-flush if batch is full
                if (this.queue.length >= this.batchSize) {
                    this.flush();
                } else if (!this.timer) {
                    // Schedule auto-flush after delay
                    this.timer = setTimeout(() => this.flush(), this.batchDelay);
                }
            });
        }

        /**
         * Flush the current batch
         * Executes all queued requests in parallel with concurrency control
         */
        async flush() {
            // Clear auto-flush timer
            if (this.timer) {
                clearTimeout(this.timer);
                this.timer = null;
            }

            // Wait if too many batches are running
            while (this.activeBatches >= this.maxConcurrency) {
                await new Promise(resolve => setTimeout(resolve, 50));
            }

            // Extract batch from queue
            const batch = this.queue.splice(0, this.batchSize);
            if (batch.length === 0) return;

            this.activeBatches++;

            try {
                // ✅ Execute requests in parallel
                const results = await Promise.allSettled(
                    batch.map(item => item.fn())
                );

                // Resolve/reject individual promises
                results.forEach((result, i) => {
                    if (result.status === 'fulfilled') {
                        batch[i].resolve(result.value);
                    } else {
                        batch[i].reject(result.reason);
                    }
                });
            } catch (error) {
                // Fallback: reject all if batch fails
                batch.forEach(item => item.reject(error));
            } finally {
                this.activeBatches--;

                // Continue processing queue if there are more items
                if (this.queue.length > 0) {
                    setTimeout(() => this.flush(), 0);
                }
            }
        }

        /**
         * Get current queue size
         * @returns {number} Number of pending requests
         */
        getQueueSize() {
            return this.queue.length;
        }

        /**
         * Clear all pending requests
         */
        clear() {
            if (this.timer) {
                clearTimeout(this.timer);
                this.timer = null;
            }
            this.queue.forEach(item => item.reject(new Error('Queue cleared')));
            this.queue = [];
        }
    }

    // =================================================================================
    // EXPORT TO GLOBAL SCOPE
    // =================================================================================
    if (typeof window !== 'undefined') {
        window.RequestBatcher = RequestBatcher;

        // ✅ Create singleton instances for CEX and DEX requests
        window.CEXBatcher = new RequestBatcher({
            batchSize: 10,
            batchDelay: 50,
            maxConcurrency: 3
        });

        window.DEXBatcher = new RequestBatcher({
            batchSize: 8,
            batchDelay: 100,
            maxConcurrency: 5
        });

        try {
            if (window.SCAN_LOG_ENABLED) {
                console.log('[RequestBatcher] ✅ Initialized - CEX & DEX batchers ready');
            }
        } catch (_) {}
    }

})(); // End IIFE
