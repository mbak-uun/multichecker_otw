/**
 * =================================================================================
 * CALCULATION WORKER - Background Thread for Heavy Calculations
 * =================================================================================
 *
 * Web Worker for performing heavy price calculations without blocking UI.
 * Handles profit calculations, spreads, fees, and other numeric operations.
 *
 * Message format:
 * {
 *     taskId: number,
 *     task: {
 *         type: 'calculate' | 'batch' | 'sort' | 'filter',
 *         data: { ... }
 *     }
 * }
 *
 * Response format:
 * {
 *     taskId: number,
 *     type: 'result' | 'error',
 *     result: any,
 *     error: string
 * }
 *
 * @module core/performance/calc-worker
 */

(function() {
    'use strict';

    /**
     * Calculate profit from CEX and DEX prices
     * @param {object} data - Calculation data
     * @returns {object} Calculation result
     */
    function calculateProfit(data) {
        const {
            priceBuyCEX,
            priceSellDEX,
            modal,
            feeCEX,
            feeDEX,
            gasFeeDEX
        } = data;

        // Input validation
        if (!Number.isFinite(priceBuyCEX) || priceBuyCEX <= 0) {
            throw new Error('Invalid priceBuyCEX');
        }
        if (!Number.isFinite(priceSellDEX) || priceSellDEX <= 0) {
            throw new Error('Invalid priceSellDEX');
        }
        if (!Number.isFinite(modal) || modal <= 0) {
            throw new Error('Invalid modal');
        }

        // Calculate amounts
        const amountToken = modal / priceBuyCEX;
        const revenueFromDEX = amountToken * priceSellDEX;

        // Calculate fees
        const totalFeeCEX = Number.isFinite(feeCEX) ? feeCEX : 0;
        const totalFeeDEX = Number.isFinite(feeDEX) ? feeDEX : 0;
        const totalGasFee = Number.isFinite(gasFeeDEX) ? gasFeeDEX : 0;
        const totalFees = totalFeeCEX + totalFeeDEX + totalGasFee;

        // Calculate profit
        const grossProfit = revenueFromDEX - modal;
        const netProfit = grossProfit - totalFees;
        const profitPercentage = (netProfit / modal) * 100;

        // Calculate spread
        const spread = ((priceSellDEX - priceBuyCEX) / priceBuyCEX) * 100;

        return {
            amountToken,
            revenueFromDEX,
            totalFees,
            grossProfit,
            netProfit,
            profitPercentage,
            spread,
            isProfitable: netProfit > 0
        };
    }

    /**
     * Batch calculate profits for multiple tokens
     * @param {Array} tokens - Array of token data
     * @returns {Array} Array of results
     */
    function batchCalculate(tokens) {
        if (!Array.isArray(tokens)) {
            throw new Error('Expected array of tokens');
        }

        return tokens.map((token, index) => {
            try {
                return calculateProfit(token);
            } catch (error) {
                return {
                    error: error.message,
                    index
                };
            }
        });
    }

    /**
     * Sort array by numeric field
     * @param {Array} items - Items to sort
     * @param {string} field - Field name to sort by
     * @param {string} order - 'asc' or 'desc'
     * @returns {Array} Sorted array
     */
    function sortByField(items, field, order = 'desc') {
        if (!Array.isArray(items)) {
            throw new Error('Expected array');
        }

        const sorted = [...items];
        const direction = order === 'asc' ? 1 : -1;

        sorted.sort((a, b) => {
            const aVal = Number(a[field]);
            const bVal = Number(b[field]);

            if (!Number.isFinite(aVal)) return 1;
            if (!Number.isFinite(bVal)) return -1;

            return (aVal - bVal) * direction;
        });

        return sorted;
    }

    /**
     * Filter array by numeric conditions
     * @param {Array} items - Items to filter
     * @param {object} conditions - Filter conditions
     * @returns {Array} Filtered array
     */
    function filterByConditions(items, conditions) {
        if (!Array.isArray(items)) {
            throw new Error('Expected array');
        }

        return items.filter(item => {
            for (const [field, condition] of Object.entries(conditions)) {
                const value = Number(item[field]);

                if (!Number.isFinite(value)) {
                    return false;
                }

                // Check condition
                if (condition.min !== undefined && value < condition.min) {
                    return false;
                }
                if (condition.max !== undefined && value > condition.max) {
                    return false;
                }
                if (condition.equals !== undefined && value !== condition.equals) {
                    return false;
                }
            }

            return true;
        });
    }

    /**
     * Calculate statistics for array of numbers
     * @param {Array} numbers - Array of numbers
     * @returns {object} Statistics
     */
    function calculateStats(numbers) {
        if (!Array.isArray(numbers) || numbers.length === 0) {
            throw new Error('Expected non-empty array');
        }

        const validNumbers = numbers.filter(n => Number.isFinite(n));

        if (validNumbers.length === 0) {
            throw new Error('No valid numbers');
        }

        // Calculate basic stats
        const sum = validNumbers.reduce((acc, n) => acc + n, 0);
        const avg = sum / validNumbers.length;
        const min = Math.min(...validNumbers);
        const max = Math.max(...validNumbers);

        // Calculate median
        const sorted = [...validNumbers].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        const median = sorted.length % 2 === 0
            ? (sorted[mid - 1] + sorted[mid]) / 2
            : sorted[mid];

        // Calculate standard deviation
        const variance = validNumbers.reduce((acc, n) => {
            return acc + Math.pow(n - avg, 2);
        }, 0) / validNumbers.length;
        const stdDev = Math.sqrt(variance);

        return {
            count: validNumbers.length,
            sum,
            avg,
            min,
            max,
            median,
            stdDev,
            variance
        };
    }

    // =================================================================================
    // MESSAGE HANDLER
    // =================================================================================

    self.onmessage = function(event) {
        const { taskId, task } = event.data;

        try {
            let result;

            switch (task.type) {
                case 'calculate':
                    result = calculateProfit(task.data);
                    break;

                case 'batch':
                    result = batchCalculate(task.data);
                    break;

                case 'sort':
                    result = sortByField(task.data.items, task.data.field, task.data.order);
                    break;

                case 'filter':
                    result = filterByConditions(task.data.items, task.data.conditions);
                    break;

                case 'stats':
                    result = calculateStats(task.data);
                    break;

                default:
                    throw new Error(`Unknown task type: ${task.type}`);
            }

            // Send success response
            self.postMessage({
                taskId,
                type: 'result',
                result
            });

        } catch (error) {
            // Send error response
            self.postMessage({
                taskId,
                type: 'error',
                error: error.message
            });
        }
    };

})();
