/**
 * =================================================================================
 * WEB WORKER MANAGER - Performance Optimization
 * =================================================================================
 *
 * Manages Web Workers for offloading heavy computations to background threads.
 * Prevents UI freezing during intensive calculations.
 *
 * Features:
 * - Worker pool management
 * - Automatic worker lifecycle
 * - Promise-based API
 * - Task queuing when all workers busy
 * - Worker health monitoring
 * - Graceful degradation if workers not supported
 *
 * Usage:
 * ```javascript
 * // Create worker pool
 * const workerPool = new WorkerPool({
 *     workerScript: 'path/to/worker.js',
 *     poolSize: 4
 * });
 *
 * // Execute task
 * const result = await workerPool.execute({
 *     type: 'calculate',
 *     data: { ... }
 * });
 * ```
 *
 * @module core/performance/worker-manager
 */

(function() {
    'use strict';

    // ✅ SAFETY: Check if optimization should be disabled
    if (typeof window !== 'undefined' && window.DISABLE_OPTIMIZATIONS === true) {
        console.warn('[WorkerManager] Optimizations disabled via DISABLE_OPTIMIZATIONS flag');
        return;
    }

    // Check if Web Workers are supported
    const WORKERS_SUPPORTED = typeof Worker !== 'undefined';

    /**
     * Worker Pool Manager
     * ✅ OPTIMIZATION: Offloads heavy computations to background threads
     */
    class WorkerPool {
        constructor(options = {}) {
            // Configuration
            this.workerScript = options.workerScript;
            this.poolSize = Number(options.poolSize) || navigator.hardwareConcurrency || 4;
            this.maxQueueSize = Number(options.maxQueueSize) || 100;
            this.taskTimeout = Number(options.taskTimeout) || 30000; // 30 seconds
            this.enabled = options.enabled !== false && WORKERS_SUPPORTED;

            // State
            this.workers = [];
            this.availableWorkers = [];
            this.busyWorkers = new Set();
            this.taskQueue = [];
            this.nextTaskId = 1;
            this.pendingTasks = new Map(); // taskId -> { resolve, reject, timeoutId }

            // Statistics
            this.stats = {
                tasksCompleted: 0,
                tasksFailed: 0,
                tasksQueued: 0,
                avgTaskTime: 0,
                workersCreated: 0,
                workersTerminated: 0
            };

            // Initialize if enabled
            if (this.enabled) {
                this.init();
            } else {
                try {
                    if (!WORKERS_SUPPORTED) {
                        console.warn('[WorkerPool] Web Workers not supported - operations will run on main thread');
                    }
                } catch (_) {}
            }
        }

        /**
         * Initialize worker pool
         */
        init() {
            if (!this.workerScript) {
                console.warn('[WorkerPool] No worker script provided - pool disabled');
                this.enabled = false;
                return;
            }

            try {
                // Create workers
                for (let i = 0; i < this.poolSize; i++) {
                    this.createWorker();
                }

                try {
                    if (window.SCAN_LOG_ENABLED) {
                        console.log(`[WorkerPool] ✅ Initialized with ${this.poolSize} workers`);
                    }
                } catch (_) {}
            } catch (error) {
                console.error('[WorkerPool] Initialization error:', error);
                this.enabled = false;
            }
        }

        /**
         * Create a new worker
         */
        createWorker() {
            try {
                const worker = new Worker(this.workerScript);
                const workerId = this.stats.workersCreated++;

                worker.workerId = workerId;
                worker.isBusy = false;

                // Handle messages from worker
                worker.onmessage = (event) => {
                    this.handleWorkerMessage(worker, event.data);
                };

                // Handle worker errors
                worker.onerror = (error) => {
                    console.error(`[WorkerPool] Worker ${workerId} error:`, error);
                    this.handleWorkerError(worker, error);
                };

                this.workers.push(worker);
                this.availableWorkers.push(worker);

                return worker;
            } catch (error) {
                console.error('[WorkerPool] Failed to create worker:', error);
                throw error;
            }
        }

        /**
         * Handle message from worker
         * @param {Worker} worker - Worker instance
         * @param {object} data - Message data
         */
        handleWorkerMessage(worker, data) {
            const { taskId, type, result, error } = data;

            if (type === 'result') {
                // Task completed successfully
                const task = this.pendingTasks.get(taskId);
                if (task) {
                    clearTimeout(task.timeoutId);

                    // Update statistics
                    this.stats.tasksCompleted++;
                    const taskTime = performance.now() - task.startTime;
                    this.stats.avgTaskTime = (this.stats.avgTaskTime * 0.9) + (taskTime * 0.1);

                    task.resolve(result);
                    this.pendingTasks.delete(taskId);
                }

                // Mark worker as available
                this.markWorkerAvailable(worker);

                // Process next queued task
                this.processQueue();

            } else if (type === 'error') {
                // Task failed
                const task = this.pendingTasks.get(taskId);
                if (task) {
                    clearTimeout(task.timeoutId);
                    this.stats.tasksFailed++;
                    task.reject(new Error(error || 'Worker task failed'));
                    this.pendingTasks.delete(taskId);
                }

                // Mark worker as available
                this.markWorkerAvailable(worker);

                // Process next queued task
                this.processQueue();
            }
        }

        /**
         * Handle worker error
         * @param {Worker} worker - Worker instance
         * @param {Error} error - Error object
         */
        handleWorkerError(worker, error) {
            // Find all tasks assigned to this worker and reject them
            this.pendingTasks.forEach((task, taskId) => {
                if (task.workerId === worker.workerId) {
                    clearTimeout(task.timeoutId);
                    this.stats.tasksFailed++;
                    task.reject(error);
                    this.pendingTasks.delete(taskId);
                }
            });

            // Remove worker from pool
            const index = this.workers.indexOf(worker);
            if (index > -1) {
                this.workers.splice(index, 1);
            }

            const availIndex = this.availableWorkers.indexOf(worker);
            if (availIndex > -1) {
                this.availableWorkers.splice(availIndex, 1);
            }

            this.busyWorkers.delete(worker);

            // Terminate worker
            try {
                worker.terminate();
                this.stats.workersTerminated++;
            } catch (_) {}

            // Create replacement worker
            try {
                this.createWorker();
            } catch (error) {
                console.error('[WorkerPool] Failed to create replacement worker:', error);
            }
        }

        /**
         * Mark worker as available
         * @param {Worker} worker - Worker instance
         */
        markWorkerAvailable(worker) {
            worker.isBusy = false;
            this.busyWorkers.delete(worker);
            if (!this.availableWorkers.includes(worker)) {
                this.availableWorkers.push(worker);
            }
        }

        /**
         * Execute task on worker
         * @param {object} task - Task data
         * @returns {Promise} Promise that resolves with result
         */
        execute(task) {
            if (!this.enabled) {
                // Fallback: execute on main thread
                return this.executeFallback(task);
            }

            // Check queue size limit
            if (this.taskQueue.length >= this.maxQueueSize) {
                return Promise.reject(new Error('Worker queue full'));
            }

            return new Promise((resolve, reject) => {
                const taskId = this.nextTaskId++;
                const taskData = {
                    taskId,
                    task,
                    resolve,
                    reject,
                    startTime: performance.now()
                };

                // Try to execute immediately if worker available
                if (this.availableWorkers.length > 0) {
                    this.executeTask(taskData);
                } else {
                    // Queue task
                    this.taskQueue.push(taskData);
                    this.stats.tasksQueued++;
                }
            });
        }

        /**
         * Execute task on available worker
         * @param {object} taskData - Task data with resolve/reject
         */
        executeTask(taskData) {
            const worker = this.availableWorkers.pop();
            if (!worker) {
                // No worker available, queue it
                this.taskQueue.push(taskData);
                return;
            }

            worker.isBusy = true;
            this.busyWorkers.add(worker);

            // Set timeout
            const timeoutId = setTimeout(() => {
                this.stats.tasksFailed++;
                taskData.reject(new Error('Worker task timeout'));
                this.pendingTasks.delete(taskData.taskId);
                this.markWorkerAvailable(worker);
                this.processQueue();
            }, this.taskTimeout);

            // Store pending task
            taskData.timeoutId = timeoutId;
            taskData.workerId = worker.workerId;
            this.pendingTasks.set(taskData.taskId, taskData);

            // Send task to worker
            try {
                worker.postMessage({
                    taskId: taskData.taskId,
                    task: taskData.task
                });
            } catch (error) {
                clearTimeout(timeoutId);
                this.stats.tasksFailed++;
                taskData.reject(error);
                this.pendingTasks.delete(taskData.taskId);
                this.markWorkerAvailable(worker);
            }
        }

        /**
         * Process queued tasks
         */
        processQueue() {
            while (this.taskQueue.length > 0 && this.availableWorkers.length > 0) {
                const taskData = this.taskQueue.shift();
                this.executeTask(taskData);
            }
        }

        /**
         * Fallback execution on main thread
         * @param {object} task - Task data
         * @returns {Promise} Promise with result
         */
        async executeFallback(task) {
            // This should be implemented by the specific worker type
            // For now, just reject
            return Promise.reject(new Error('Worker not available and no fallback implemented'));
        }

        /**
         * Terminate all workers
         */
        terminate() {
            // Reject all pending tasks
            this.pendingTasks.forEach((task) => {
                clearTimeout(task.timeoutId);
                task.reject(new Error('Worker pool terminated'));
            });
            this.pendingTasks.clear();

            // Terminate all workers
            this.workers.forEach(worker => {
                try {
                    worker.terminate();
                    this.stats.workersTerminated++;
                } catch (_) {}
            });

            this.workers = [];
            this.availableWorkers = [];
            this.busyWorkers.clear();
            this.taskQueue = [];

            try {
                if (window.SCAN_LOG_ENABLED) {
                    console.log('[WorkerPool] Terminated');
                }
            } catch (_) {}
        }

        /**
         * Get pool statistics
         * @returns {object} Statistics
         */
        getStats() {
            return {
                ...this.stats,
                poolSize: this.poolSize,
                activeWorkers: this.workers.length,
                availableWorkers: this.availableWorkers.length,
                busyWorkers: this.busyWorkers.size,
                queuedTasks: this.taskQueue.length,
                pendingTasks: this.pendingTasks.size,
                enabled: this.enabled
            };
        }
    }

    // =================================================================================
    // INLINE WORKER CREATION (for simple tasks without external script)
    // =================================================================================

    /**
     * Create an inline worker from a function
     * @param {Function} fn - Function to run in worker
     * @returns {Worker} Worker instance
     */
    function createInlineWorker(fn) {
        if (!WORKERS_SUPPORTED) {
            throw new Error('Web Workers not supported');
        }

        const blob = new Blob([`
            self.onmessage = function(e) {
                try {
                    const result = (${fn.toString()})(e.data.task);
                    self.postMessage({
                        taskId: e.data.taskId,
                        type: 'result',
                        result: result
                    });
                } catch (error) {
                    self.postMessage({
                        taskId: e.data.taskId,
                        type: 'error',
                        error: error.message
                    });
                }
            };
        `], { type: 'application/javascript' });

        return new Worker(URL.createObjectURL(blob));
    }

    // =================================================================================
    // EXPORT TO GLOBAL SCOPE
    // =================================================================================
    if (typeof window !== 'undefined') {
        window.WorkerPool = WorkerPool;
        window.createInlineWorker = createInlineWorker;
        window.WORKERS_SUPPORTED = WORKERS_SUPPORTED;

        try {
            if (window.SCAN_LOG_ENABLED) {
                console.log('[WorkerManager] ✅ Initialized - Worker pool management ready', {
                    supported: WORKERS_SUPPORTED,
                    cores: navigator.hardwareConcurrency
                });
            }
        } catch (_) {}
    }

})(); // End IIFE
