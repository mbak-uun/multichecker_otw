/**
 * =================================================================================
 * PROGRESSIVE DATA LOADER - Performance Optimization
 * =================================================================================
 *
 * Loads and processes large datasets progressively to prevent UI freezing.
 *
 * Features:
 * - Chunk-based processing to keep UI responsive
 * - RequestAnimationFrame scheduling for smooth rendering
 * - RequestIdleCallback support for low-priority work
 * - Progress tracking and cancellation
 * - Automatic yield to browser for painting
 * - Configurable chunk sizes and delays
 *
 * Usage:
 * ```javascript
 * const loader = new ProgressiveLoader({
 *     chunkSize: 50, // Process 50 items at a time
 *     onProgress: (processed, total) => {
 *         console.log(`Progress: ${processed}/${total}`);
 *     },
 *     onComplete: (results) => {
 *         console.log('All done!', results);
 *     }
 * });
 *
 * loader.load(largeArray, (item, index) => {
 *     // Process each item
 *     return processItem(item);
 * });
 * ```
 *
 * @module core/performance/progressive-loader
 */

(function() {
    'use strict';

    // ✅ SAFETY: Check if optimization should be disabled
    if (typeof window !== 'undefined' && window.DISABLE_OPTIMIZATIONS === true) {
        console.warn('[ProgressiveLoader] Optimizations disabled via DISABLE_OPTIMIZATIONS flag');
        return;
    }

    /**
     * Progressive Loader Class
     * ✅ OPTIMIZATION: Prevents UI freezing when processing large datasets
     */
    class ProgressiveLoader {
        constructor(options = {}) {
            // Configuration
            this.chunkSize = Number(options.chunkSize) || 50;
            this.delay = Number(options.delay) >= 0 ? Number(options.delay) : 0;
            this.useRAF = options.useRAF !== false; // Default: true
            this.useIdleCallback = options.useIdleCallback === true; // Default: false
            this.priority = options.priority || 'normal'; // 'high', 'normal', 'low'

            // Callbacks
            this.onProgress = options.onProgress || null;
            this.onChunkComplete = options.onChunkComplete || null;
            this.onComplete = options.onComplete || null;
            this.onError = options.onError || null;

            // State
            this.isLoading = false;
            this.isCancelled = false;
            this.currentIndex = 0;
            this.totalItems = 0;
            this.results = [];
            this.startTime = 0;
            this.rafId = null;
            this.timeoutId = null;

            // Statistics
            this.stats = {
                totalLoaded: 0,
                chunksProcessed: 0,
                avgChunkTime: 0,
                totalTime: 0,
                itemsPerSecond: 0
            };
        }

        /**
         * Load and process data progressively
         * @param {Array} data - Array of data to process
         * @param {Function} processor - Function to process each item (item, index) => result
         * @returns {Promise} Promise that resolves with results array
         */
        load(data, processor) {
            if (!Array.isArray(data)) {
                return Promise.reject(new Error('Data must be an array'));
            }
            if (typeof processor !== 'function') {
                return Promise.reject(new Error('Processor must be a function'));
            }

            // Reset state
            this.isLoading = true;
            this.isCancelled = false;
            this.currentIndex = 0;
            this.totalItems = data.length;
            this.results = [];
            this.startTime = performance.now();

            try {
                if (window.SCAN_LOG_ENABLED) {
                    console.log(`[ProgressiveLoader] Starting load: ${data.length} items, ${this.chunkSize} per chunk`);
                }
            } catch (_) {}

            return new Promise((resolve, reject) => {
                this.resolve = resolve;
                this.reject = reject;
                this.data = data;
                this.processor = processor;

                // Start processing
                this.processNextChunk();
            });
        }

        /**
         * Process the next chunk of data
         */
        processNextChunk() {
            if (this.isCancelled) {
                this.finish(true);
                return;
            }

            if (this.currentIndex >= this.totalItems) {
                this.finish(false);
                return;
            }

            const chunkStartTime = performance.now();
            const chunkEndIndex = Math.min(this.currentIndex + this.chunkSize, this.totalItems);
            const chunkResults = [];

            try {
                // Process chunk
                for (let i = this.currentIndex; i < chunkEndIndex; i++) {
                    try {
                        const result = this.processor(this.data[i], i);
                        chunkResults.push(result);
                        this.results.push(result);
                    } catch (error) {
                        console.error(`[ProgressiveLoader] Error processing item ${i}:`, error);
                        if (this.onError) {
                            this.onError(error, i, this.data[i]);
                        }
                        // Continue processing despite error
                        chunkResults.push(null);
                        this.results.push(null);
                    }
                }

                this.currentIndex = chunkEndIndex;
                this.stats.chunksProcessed++;

                // Update statistics
                const chunkTime = performance.now() - chunkStartTime;
                this.stats.avgChunkTime = (this.stats.avgChunkTime * 0.9) + (chunkTime * 0.1);

                // Progress callback
                if (this.onProgress) {
                    this.onProgress(this.currentIndex, this.totalItems, chunkResults);
                }

                // Chunk complete callback
                if (this.onChunkComplete) {
                    this.onChunkComplete(chunkResults, this.currentIndex, this.totalItems);
                }

                // Schedule next chunk
                this.scheduleNextChunk();

            } catch (error) {
                console.error('[ProgressiveLoader] Chunk processing error:', error);
                if (this.onError) {
                    this.onError(error);
                }
                this.finish(true, error);
            }
        }

        /**
         * Schedule the next chunk processing
         */
        scheduleNextChunk() {
            // Cancel any pending schedule
            this.cancelSchedule();

            // Choose scheduling strategy based on priority and options
            if (this.priority === 'high' || !this.useRAF) {
                // Immediate or delayed processing
                if (this.delay > 0) {
                    this.timeoutId = setTimeout(() => this.processNextChunk(), this.delay);
                } else {
                    // Use setImmediate polyfill or setTimeout(0)
                    this.timeoutId = setTimeout(() => this.processNextChunk(), 0);
                }
            } else if (this.useIdleCallback && typeof requestIdleCallback === 'function') {
                // Use requestIdleCallback for low-priority work
                this.rafId = requestIdleCallback(() => this.processNextChunk(), { timeout: 1000 });
            } else {
                // Use requestAnimationFrame (default)
                this.rafId = requestAnimationFrame(() => this.processNextChunk());
            }
        }

        /**
         * Cancel scheduled next chunk
         */
        cancelSchedule() {
            if (this.rafId !== null) {
                if (typeof cancelIdleCallback === 'function') {
                    cancelIdleCallback(this.rafId);
                } else {
                    cancelAnimationFrame(this.rafId);
                }
                this.rafId = null;
            }
            if (this.timeoutId !== null) {
                clearTimeout(this.timeoutId);
                this.timeoutId = null;
            }
        }

        /**
         * Finish loading
         * @param {boolean} cancelled - Whether loading was cancelled
         * @param {Error} error - Error if loading failed
         */
        finish(cancelled, error) {
            this.isLoading = false;
            this.cancelSchedule();

            // Update final statistics
            this.stats.totalTime = performance.now() - this.startTime;
            this.stats.totalLoaded = this.currentIndex;
            this.stats.itemsPerSecond = this.stats.totalTime > 0
                ? (this.currentIndex / this.stats.totalTime) * 1000
                : 0;

            try {
                if (window.SCAN_LOG_ENABLED) {
                    console.log('[ProgressiveLoader] Finished', {
                        cancelled,
                        error: error ? error.message : null,
                        stats: this.stats
                    });
                }
            } catch (_) {}

            if (error) {
                if (this.reject) {
                    this.reject(error);
                }
            } else if (cancelled) {
                if (this.reject) {
                    this.reject(new Error('Loading cancelled'));
                }
            } else {
                if (this.onComplete) {
                    this.onComplete(this.results, this.stats);
                }
                if (this.resolve) {
                    this.resolve(this.results);
                }
            }

            // Cleanup
            this.data = null;
            this.processor = null;
            this.resolve = null;
            this.reject = null;
        }

        /**
         * Cancel loading
         */
        cancel() {
            if (!this.isLoading) return;

            try {
                if (window.SCAN_LOG_ENABLED) {
                    console.log('[ProgressiveLoader] Cancelled');
                }
            } catch (_) {}

            this.isCancelled = true;
            this.cancelSchedule();
        }

        /**
         * Check if currently loading
         * @returns {boolean}
         */
        isActive() {
            return this.isLoading;
        }

        /**
         * Get current progress
         * @returns {object} Progress info
         */
        getProgress() {
            return {
                current: this.currentIndex,
                total: this.totalItems,
                percentage: this.totalItems > 0 ? (this.currentIndex / this.totalItems) * 100 : 0,
                isLoading: this.isLoading,
                isCancelled: this.isCancelled
            };
        }

        /**
         * Get statistics
         * @returns {object} Statistics
         */
        getStats() {
            return { ...this.stats };
        }
    }

    // =================================================================================
    // HELPER FUNCTIONS
    // =================================================================================

    /**
     * Load data progressively with simple API
     * @param {Array} data - Data array
     * @param {Function} processor - Processing function
     * @param {object} options - Options
     * @returns {Promise} Promise with results
     */
    function progressiveLoad(data, processor, options = {}) {
        const loader = new ProgressiveLoader(options);
        return loader.load(data, processor);
    }

    /**
     * Render DOM elements progressively
     * @param {Array} items - Items to render
     * @param {Function} renderer - Render function (item, index) => HTMLElement
     * @param {HTMLElement} container - Container to append to
     * @param {object} options - Options
     * @returns {Promise} Promise that resolves when complete
     */
    async function progressiveRender(items, renderer, container, options = {}) {
        const loader = new ProgressiveLoader({
            chunkSize: options.chunkSize || 20,
            useRAF: true,
            ...options,
            onChunkComplete: (elements) => {
                // Append elements to container in batches
                const fragment = document.createDocumentFragment();
                elements.forEach(el => {
                    if (el instanceof HTMLElement) {
                        fragment.appendChild(el);
                    }
                });
                if (fragment.childNodes.length > 0) {
                    container.appendChild(fragment);
                }
                // Call user's onChunkComplete if provided
                if (options.onChunkComplete) {
                    options.onChunkComplete(elements);
                }
            }
        });

        return loader.load(items, renderer);
    }

    /**
     * Process array in chunks without blocking UI
     * @param {Array} array - Array to process
     * @param {Function} fn - Function to call for each item
     * @param {number} chunkSize - Items per chunk
     * @returns {Promise} Promise that resolves when complete
     */
    function processInChunks(array, fn, chunkSize = 100) {
        return progressiveLoad(array, fn, { chunkSize });
    }

    // =================================================================================
    // EXPORT TO GLOBAL SCOPE
    // =================================================================================
    if (typeof window !== 'undefined') {
        window.ProgressiveLoader = ProgressiveLoader;
        window.progressiveLoad = progressiveLoad;
        window.progressiveRender = progressiveRender;
        window.processInChunks = processInChunks;

        try {
            if (window.SCAN_LOG_ENABLED) {
                console.log('[ProgressiveLoader] ✅ Initialized - Progressive loading utilities ready');
            }
        } catch (_) {}
    }

})(); // End IIFE
