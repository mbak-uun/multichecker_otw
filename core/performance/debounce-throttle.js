/**
 * =================================================================================
 * DEBOUNCE & THROTTLE UTILITIES - Performance Optimization
 * =================================================================================
 *
 * Provides debouncing and throttling utilities to limit function execution rate.
 *
 * Features:
 * - Debounce: Delay execution until user stops action
 * - Throttle: Limit execution rate (max once per interval)
 * - RAF Throttle: Throttle using requestAnimationFrame for smooth 60fps
 * - Leading/Trailing edge options
 * - Cancelable timers
 *
 * Usage Examples:
 * ```javascript
 * // Debounce search input (wait 300ms after user stops typing)
 * const debouncedSearch = debounce((query) => {
 *     searchAPI(query);
 * }, 300);
 *
 * // Throttle scroll handler (max once per 100ms)
 * const throttledScroll = throttle(() => {
 *     updateScrollPosition();
 * }, 100);
 *
 * // RAF throttle for smooth animations (60fps)
 * const rafScroll = rafThrottle(() => {
 *     updateParallax();
 * });
 * ```
 *
 * @module core/performance/debounce-throttle
 */

(function() {
    'use strict';

    // ✅ SAFETY: Check if optimization should be disabled
    if (typeof window !== 'undefined' && window.DISABLE_OPTIMIZATIONS === true) {
        console.warn('[Debounce/Throttle] Optimizations disabled via DISABLE_OPTIMIZATIONS flag');
        return;
    }

    /**
     * Debounce function
     * Delays execution until after wait milliseconds have elapsed since the last call.
     * Useful for input handlers, resize events, etc.
     *
     * @param {Function} func - Function to debounce
     * @param {number} wait - Milliseconds to wait
     * @param {object} options - Options { leading: boolean, trailing: boolean, maxWait: number }
     * @returns {Function} Debounced function with cancel() method
     *
     * @example
     * const debouncedSave = debounce(() => saveData(), 500);
     * input.addEventListener('input', debouncedSave);
     * // If user stops typing for 500ms, saveData() will be called
     */
    function debounce(func, wait, options = {}) {
        if (typeof func !== 'function') {
            throw new TypeError('Expected a function');
        }

        const leading = options.leading === true;
        const trailing = options.trailing !== false; // Default: true
        const maxWait = Number(options.maxWait) > 0 ? Number(options.maxWait) : null;

        let timerId = null;
        let lastCallTime = null;
        let lastInvokeTime = 0;
        let lastArgs = null;
        let lastThis = null;
        let result = undefined;

        function invokeFunc(time) {
            const args = lastArgs;
            const thisArg = lastThis;

            lastArgs = lastThis = null;
            lastInvokeTime = time;
            result = func.apply(thisArg, args);
            return result;
        }

        function startTimer(pendingFunc, wait) {
            return setTimeout(pendingFunc, wait);
        }

        function cancelTimer(id) {
            clearTimeout(id);
        }

        function leadingEdge(time) {
            // Reset any `maxWait` timer
            lastInvokeTime = time;
            // Start the timer for the trailing edge
            timerId = startTimer(timerExpired, wait);
            // Invoke the leading edge
            return leading ? invokeFunc(time) : result;
        }

        function remainingWait(time) {
            const timeSinceLastCall = time - lastCallTime;
            const timeSinceLastInvoke = time - lastInvokeTime;
            const timeWaiting = wait - timeSinceLastCall;

            return maxWait !== null
                ? Math.min(timeWaiting, maxWait - timeSinceLastInvoke)
                : timeWaiting;
        }

        function shouldInvoke(time) {
            const timeSinceLastCall = time - lastCallTime;
            const timeSinceLastInvoke = time - lastInvokeTime;

            // Either this is the first call, activity has stopped and we're at the
            // trailing edge, the system time has gone backwards and we're treating
            // it as the trailing edge, or we've hit the `maxWait` limit.
            return (lastCallTime === null || (timeSinceLastCall >= wait) ||
                    (timeSinceLastCall < 0) || (maxWait !== null && timeSinceLastInvoke >= maxWait));
        }

        function timerExpired() {
            const time = Date.now();
            if (shouldInvoke(time)) {
                return trailingEdge(time);
            }
            // Restart the timer
            timerId = startTimer(timerExpired, remainingWait(time));
        }

        function trailingEdge(time) {
            timerId = null;

            // Only invoke if we have `lastArgs` which means `func` has been
            // debounced at least once
            if (trailing && lastArgs) {
                return invokeFunc(time);
            }
            lastArgs = lastThis = null;
            return result;
        }

        function cancel() {
            if (timerId !== null) {
                cancelTimer(timerId);
            }
            lastInvokeTime = 0;
            lastArgs = lastCallTime = lastThis = timerId = null;
        }

        function flush() {
            return timerId === null ? result : trailingEdge(Date.now());
        }

        function pending() {
            return timerId !== null;
        }

        function debounced(...args) {
            const time = Date.now();
            const isInvoking = shouldInvoke(time);

            lastArgs = args;
            lastThis = this;
            lastCallTime = time;

            if (isInvoking) {
                if (timerId === null) {
                    return leadingEdge(lastCallTime);
                }
                if (maxWait !== null) {
                    // Handle invocations in a tight loop
                    timerId = startTimer(timerExpired, wait);
                    return invokeFunc(lastCallTime);
                }
            }
            if (timerId === null) {
                timerId = startTimer(timerExpired, wait);
            }
            return result;
        }

        debounced.cancel = cancel;
        debounced.flush = flush;
        debounced.pending = pending;

        return debounced;
    }

    /**
     * Throttle function
     * Limits execution to once per wait milliseconds.
     * Useful for scroll handlers, mousemove, etc.
     *
     * @param {Function} func - Function to throttle
     * @param {number} wait - Milliseconds between executions
     * @param {object} options - Options { leading: boolean, trailing: boolean }
     * @returns {Function} Throttled function with cancel() method
     *
     * @example
     * const throttledScroll = throttle(() => {
     *     console.log('Scroll position:', window.scrollY);
     * }, 100);
     * window.addEventListener('scroll', throttledScroll);
     * // Function will execute max once per 100ms
     */
    function throttle(func, wait, options = {}) {
        const leading = options.leading !== false; // Default: true
        const trailing = options.trailing !== false; // Default: true

        return debounce(func, wait, {
            leading,
            trailing,
            maxWait: wait
        });
    }

    /**
     * RequestAnimationFrame throttle
     * Throttles function to run at most once per animation frame (~60fps).
     * Perfect for smooth scroll animations and visual updates.
     *
     * @param {Function} func - Function to throttle
     * @returns {Function} RAF-throttled function with cancel() method
     *
     * @example
     * const rafScroll = rafThrottle(() => {
     *     element.style.transform = `translateY(${window.scrollY}px)`;
     * });
     * window.addEventListener('scroll', rafScroll);
     * // Smooth 60fps updates
     */
    function rafThrottle(func) {
        if (typeof func !== 'function') {
            throw new TypeError('Expected a function');
        }

        let rafId = null;
        let lastArgs = null;
        let lastThis = null;

        function throttled(...args) {
            lastArgs = args;
            lastThis = this;

            if (rafId === null) {
                rafId = requestAnimationFrame(() => {
                    rafId = null;
                    func.apply(lastThis, lastArgs);
                    lastArgs = lastThis = null;
                });
            }
        }

        throttled.cancel = function() {
            if (rafId !== null) {
                cancelAnimationFrame(rafId);
                rafId = null;
            }
            lastArgs = lastThis = null;
        };

        throttled.pending = function() {
            return rafId !== null;
        };

        return throttled;
    }

    /**
     * Immediate debounce
     * Executes immediately on first call, then debounces subsequent calls.
     * Useful for click handlers where you want immediate feedback.
     *
     * @param {Function} func - Function to debounce
     * @param {number} wait - Milliseconds to wait
     * @returns {Function} Debounced function with cancel() method
     *
     * @example
     * const debouncedClick = debounceImmediate(() => {
     *     submitForm();
     * }, 1000);
     * button.addEventListener('click', debouncedClick);
     * // First click executes immediately, subsequent clicks ignored for 1000ms
     */
    function debounceImmediate(func, wait) {
        return debounce(func, wait, { leading: true, trailing: false });
    }

    /**
     * Create a debounced version of async function
     * Properly handles promise resolution/rejection
     *
     * @param {Function} func - Async function to debounce
     * @param {number} wait - Milliseconds to wait
     * @param {object} options - Options { leading: boolean, trailing: boolean }
     * @returns {Function} Debounced async function
     *
     * @example
     * const debouncedFetch = debounceAsync(async (query) => {
     *     const response = await fetch(`/api/search?q=${query}`);
     *     return response.json();
     * }, 300);
     *
     * // Usage
     * const result = await debouncedFetch('test');
     */
    function debounceAsync(func, wait, options = {}) {
        if (typeof func !== 'function') {
            throw new TypeError('Expected a function');
        }

        let pendingPromise = null;

        const debounced = debounce(async function(...args) {
            try {
                const result = await func.apply(this, args);
                return result;
            } catch (error) {
                throw error;
            }
        }, wait, options);

        return function(...args) {
            return debounced.apply(this, args);
        };
    }

    // =================================================================================
    // COMMON PRESETS FOR TYPICAL USE CASES
    // =================================================================================

    /**
     * Preset: Debounce for search input (300ms)
     */
    function debounceSearch(func) {
        return debounce(func, 300, { leading: false, trailing: true });
    }

    /**
     * Preset: Debounce for auto-save (1000ms)
     */
    function debounceAutoSave(func) {
        return debounce(func, 1000, { leading: false, trailing: true });
    }

    /**
     * Preset: Throttle for scroll events (100ms)
     */
    function throttleScroll(func) {
        return throttle(func, 100, { leading: true, trailing: true });
    }

    /**
     * Preset: Throttle for resize events (200ms)
     */
    function throttleResize(func) {
        return throttle(func, 200, { leading: true, trailing: true });
    }

    /**
     * Preset: Throttle for mousemove (50ms)
     */
    function throttleMouseMove(func) {
        return throttle(func, 50, { leading: true, trailing: true });
    }

    // =================================================================================
    // STATISTICS & MONITORING
    // =================================================================================

    const stats = {
        debounceCreated: 0,
        throttleCreated: 0,
        rafThrottleCreated: 0
    };

    function getStats() {
        return { ...stats };
    }

    function resetStats() {
        stats.debounceCreated = 0;
        stats.throttleCreated = 0;
        stats.rafThrottleCreated = 0;
    }

    // =================================================================================
    // EXPORT TO GLOBAL SCOPE
    // =================================================================================
    if (typeof window !== 'undefined') {
        // Core functions
        window.debounce = debounce;
        window.throttle = throttle;
        window.rafThrottle = rafThrottle;
        window.debounceImmediate = debounceImmediate;
        window.debounceAsync = debounceAsync;

        // Presets
        window.debounceSearch = debounceSearch;
        window.debounceAutoSave = debounceAutoSave;
        window.throttleScroll = throttleScroll;
        window.throttleResize = throttleResize;
        window.throttleMouseMove = throttleMouseMove;

        // Stats
        window.DebounceThrottleStats = {
            get: getStats,
            reset: resetStats
        };

        try {
            if (window.SCAN_LOG_ENABLED) {
                console.log('[Debounce/Throttle] ✅ Initialized - Performance utilities ready');
            }
        } catch (_) {}
    }

})(); // End IIFE
