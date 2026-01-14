/**
 * =================================================================================
 * VIRTUAL SCROLLING - Performance Optimization
 * =================================================================================
 *
 * Implements virtual scrolling for large lists/tables to improve rendering performance.
 * Only renders rows that are visible in the viewport + buffer zone.
 *
 * Features:
 * - Viewport detection with configurable buffer
 * - Dynamic row height support
 * - Smooth scrolling with RAF throttling
 * - Automatic cleanup on scroll end
 * - Statistics tracking
 *
 * Usage:
 * ```javascript
 * const virtualScroller = new VirtualScroller({
 *     container: document.getElementById('table-container'),
 *     tbody: document.getElementById('tbody'),
 *     rowHeight: 50, // Average row height in pixels
 *     bufferSize: 5, // Number of rows to render above/below viewport
 *     onRenderRow: (rowData, rowIndex) => {
 *         // Return HTML string or DOM element for this row
 *         return `<tr><td>${rowData.name}</td></tr>`;
 *     }
 * });
 *
 * virtualScroller.setData(arrayOfData);
 * ```
 *
 * @module core/performance/virtual-scroll
 */

(function() {
    'use strict';

    // ✅ SAFETY: Check if optimization should be disabled
    if (typeof window !== 'undefined' && window.DISABLE_OPTIMIZATIONS === true) {
        console.warn('[VirtualScroll] Optimizations disabled via DISABLE_OPTIMIZATIONS flag');
        return;
    }

    /**
     * Virtual Scroller Class
     * ✅ OPTIMIZATION: Renders only visible rows for large datasets
     */
    class VirtualScroller {
        constructor(options = {}) {
            // Required options
            this.container = options.container;
            this.tbody = options.tbody;
            this.onRenderRow = options.onRenderRow;

            // Configuration
            this.rowHeight = Number(options.rowHeight) || 50;
            this.bufferSize = Number(options.bufferSize) || 5;
            this.enabled = options.enabled !== false; // Default: enabled
            this.debounceDelay = Number(options.debounceDelay) || 0; // No debounce by default

            // State
            this.data = [];
            this.visibleStartIndex = 0;
            this.visibleEndIndex = 0;
            this.renderedRows = new Map(); // index -> DOM element
            this.topSpacer = null;
            this.bottomSpacer = null;
            this.isScrolling = false;
            this.scrollRAF = null;

            // Statistics
            this.stats = {
                totalRows: 0,
                renderedRows: 0,
                scrollEvents: 0,
                renderCalls: 0,
                avgRenderTime: 0
            };

            // Validate required options
            if (!this.container) {
                throw new Error('VirtualScroller: container element is required');
            }
            if (!this.tbody) {
                throw new Error('VirtualScroller: tbody element is required');
            }
            if (typeof this.onRenderRow !== 'function') {
                throw new Error('VirtualScroller: onRenderRow callback is required');
            }

            // Initialize
            this.init();
        }

        init() {
            // Create spacer elements for maintaining scroll height
            this.topSpacer = document.createElement('tr');
            this.topSpacer.className = 'virtual-scroll-spacer-top';
            this.topSpacer.style.height = '0px';

            this.bottomSpacer = document.createElement('tr');
            this.bottomSpacer.className = 'virtual-scroll-spacer-bottom';
            this.bottomSpacer.style.height = '0px';

            // Add spacers to tbody
            this.tbody.appendChild(this.topSpacer);
            this.tbody.appendChild(this.bottomSpacer);

            // Bind scroll handler
            if (this.enabled) {
                this.boundScrollHandler = this.handleScroll.bind(this);
                this.container.addEventListener('scroll', this.boundScrollHandler, { passive: true });
            }

            try {
                if (window.SCAN_LOG_ENABLED) {
                    console.log('[VirtualScroll] ✅ Initialized', {
                        enabled: this.enabled,
                        rowHeight: this.rowHeight,
                        bufferSize: this.bufferSize
                    });
                }
            } catch (_) {}
        }

        /**
         * Set data array and trigger initial render
         * @param {Array} data - Array of data items
         */
        setData(data) {
            if (!Array.isArray(data)) {
                console.warn('[VirtualScroll] setData expects an array');
                return;
            }

            this.data = data;
            this.stats.totalRows = data.length;

            // If disabled or small dataset, render all rows
            if (!this.enabled || data.length < 50) {
                this.renderAllRows();
                return;
            }

            // Virtual scroll mode: render visible rows only
            this.updateVisibleRange();
            this.render();
        }

        /**
         * Render all rows (used when virtual scroll is disabled or dataset is small)
         */
        renderAllRows() {
            try {
                if (window.SCAN_LOG_ENABLED) {
                    console.log('[VirtualScroll] Rendering all rows (virtual scroll disabled or small dataset)');
                }
            } catch (_) {}

            // Clear existing rows
            while (this.tbody.firstChild) {
                this.tbody.removeChild(this.tbody.firstChild);
            }
            this.renderedRows.clear();

            // Render all data
            this.data.forEach((item, index) => {
                try {
                    const rowElement = this.createRowElement(item, index);
                    if (rowElement) {
                        this.tbody.appendChild(rowElement);
                        this.renderedRows.set(index, rowElement);
                    }
                } catch (error) {
                    console.error(`[VirtualScroll] Error rendering row ${index}:`, error);
                }
            });

            this.stats.renderedRows = this.data.length;
        }

        /**
         * Handle scroll event (RAF throttled)
         */
        handleScroll() {
            this.stats.scrollEvents++;

            // Cancel pending RAF
            if (this.scrollRAF) {
                cancelAnimationFrame(this.scrollRAF);
            }

            // Schedule new RAF
            this.scrollRAF = requestAnimationFrame(() => {
                this.scrollRAF = null;
                this.updateVisibleRange();
                this.render();
            });
        }

        /**
         * Calculate which rows should be visible based on scroll position
         */
        updateVisibleRange() {
            if (!this.enabled || this.data.length === 0) return;

            const scrollTop = this.container.scrollTop;
            const viewportHeight = this.container.clientHeight;

            // Calculate visible row indices (with buffer)
            const startIndex = Math.max(0, Math.floor(scrollTop / this.rowHeight) - this.bufferSize);
            const endIndex = Math.min(
                this.data.length - 1,
                Math.ceil((scrollTop + viewportHeight) / this.rowHeight) + this.bufferSize
            );

            // Only update if range changed
            if (startIndex !== this.visibleStartIndex || endIndex !== this.visibleEndIndex) {
                this.visibleStartIndex = startIndex;
                this.visibleEndIndex = endIndex;
                return true;
            }

            return false;
        }

        /**
         * Render visible rows
         */
        render() {
            if (!this.enabled || this.data.length === 0) return;

            const startTime = performance.now();
            this.stats.renderCalls++;

            try {
                // Update spacer heights
                const topSpacerHeight = this.visibleStartIndex * this.rowHeight;
                const bottomSpacerHeight = (this.data.length - this.visibleEndIndex - 1) * this.rowHeight;

                this.topSpacer.style.height = `${Math.max(0, topSpacerHeight)}px`;
                this.bottomSpacer.style.height = `${Math.max(0, bottomSpacerHeight)}px`;

                // Remove rows that are no longer visible
                const toRemove = [];
                this.renderedRows.forEach((element, index) => {
                    if (index < this.visibleStartIndex || index > this.visibleEndIndex) {
                        toRemove.push(index);
                        element.remove();
                    }
                });
                toRemove.forEach(index => this.renderedRows.delete(index));

                // Render new visible rows
                const fragment = document.createDocumentFragment();
                const newRows = [];

                for (let i = this.visibleStartIndex; i <= this.visibleEndIndex; i++) {
                    if (!this.renderedRows.has(i)) {
                        const rowElement = this.createRowElement(this.data[i], i);
                        if (rowElement) {
                            newRows.push({ index: i, element: rowElement });
                            this.renderedRows.set(i, rowElement);
                        }
                    }
                }

                // Append new rows in correct order
                // Find insertion point (after top spacer and existing rows)
                let insertBefore = this.bottomSpacer;
                newRows.forEach(({ element }) => {
                    this.tbody.insertBefore(element, insertBefore);
                });

                this.stats.renderedRows = this.renderedRows.size;

                // Update average render time
                const renderTime = performance.now() - startTime;
                this.stats.avgRenderTime = (this.stats.avgRenderTime * 0.9) + (renderTime * 0.1);

            } catch (error) {
                console.error('[VirtualScroll] Render error:', error);
            }
        }

        /**
         * Create DOM element for a row
         * @param {*} rowData - Data for this row
         * @param {number} rowIndex - Index of this row
         * @returns {HTMLElement} Row element
         */
        createRowElement(rowData, rowIndex) {
            try {
                const result = this.onRenderRow(rowData, rowIndex);

                // If result is a string, create element
                if (typeof result === 'string') {
                    const temp = document.createElement('tbody');
                    temp.innerHTML = result;
                    return temp.firstElementChild;
                }

                // If result is already an element, return it
                if (result instanceof HTMLElement) {
                    return result;
                }

                return null;
            } catch (error) {
                console.error(`[VirtualScroll] Error creating row ${rowIndex}:`, error);
                return null;
            }
        }

        /**
         * Update a specific row
         * @param {number} index - Row index
         * @param {*} newData - New data for this row
         */
        updateRow(index, newData) {
            if (index < 0 || index >= this.data.length) return;

            // Update data
            this.data[index] = newData;

            // If row is currently rendered, update it
            if (this.renderedRows.has(index)) {
                const oldElement = this.renderedRows.get(index);
                const newElement = this.createRowElement(newData, index);

                if (newElement && oldElement.parentNode) {
                    oldElement.parentNode.replaceChild(newElement, oldElement);
                    this.renderedRows.set(index, newElement);
                }
            }
        }

        /**
         * Refresh all rendered rows
         */
        refresh() {
            if (!this.enabled) {
                this.renderAllRows();
            } else {
                this.render();
            }
        }

        /**
         * Enable virtual scrolling
         */
        enable() {
            if (this.enabled) return;

            this.enabled = true;
            this.boundScrollHandler = this.handleScroll.bind(this);
            this.container.addEventListener('scroll', this.boundScrollHandler, { passive: true });

            try {
                if (window.SCAN_LOG_ENABLED) {
                    console.log('[VirtualScroll] Enabled');
                }
            } catch (_) {}

            this.refresh();
        }

        /**
         * Disable virtual scrolling (render all rows)
         */
        disable() {
            if (!this.enabled) return;

            this.enabled = false;
            if (this.boundScrollHandler) {
                this.container.removeEventListener('scroll', this.boundScrollHandler);
            }

            try {
                if (window.SCAN_LOG_ENABLED) {
                    console.log('[VirtualScroll] Disabled');
                }
            } catch (_) {}

            this.renderAllRows();
        }

        /**
         * Destroy the virtual scroller
         */
        destroy() {
            // Remove event listener
            if (this.boundScrollHandler) {
                this.container.removeEventListener('scroll', this.boundScrollHandler);
            }

            // Cancel pending RAF
            if (this.scrollRAF) {
                cancelAnimationFrame(this.scrollRAF);
            }

            // Remove spacers
            if (this.topSpacer && this.topSpacer.parentNode) {
                this.topSpacer.parentNode.removeChild(this.topSpacer);
            }
            if (this.bottomSpacer && this.bottomSpacer.parentNode) {
                this.bottomSpacer.parentNode.removeChild(this.bottomSpacer);
            }

            // Clear rendered rows
            this.renderedRows.clear();

            try {
                if (window.SCAN_LOG_ENABLED) {
                    console.log('[VirtualScroll] Destroyed');
                }
            } catch (_) {}
        }

        /**
         * Get statistics
         * @returns {object} Statistics
         */
        getStats() {
            return {
                ...this.stats,
                enabled: this.enabled,
                visibleRange: `${this.visibleStartIndex}-${this.visibleEndIndex}`,
                dataLength: this.data.length
            };
        }
    }

    // =================================================================================
    // EXPORT TO GLOBAL SCOPE
    // =================================================================================
    if (typeof window !== 'undefined') {
        window.VirtualScroller = VirtualScroller;

        try {
            if (window.SCAN_LOG_ENABLED) {
                console.log('[VirtualScroll] ✅ Module loaded - Class available as window.VirtualScroller');
            }
        } catch (_) {}
    }

})(); // End IIFE
