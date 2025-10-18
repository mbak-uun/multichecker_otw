// =================================================================================
// DATABASE VIEWER MODULE
// =================================================================================
/**
 * Module untuk menampilkan semua data tabel dari IndexedDB
 * - Accordion cards per tabel
 * - Pencarian global dan per-tabel
 * - Summary statistik per tabel
 * - Export data ke JSON
 *
 * Tabel yang ditampilkan:
 * - SETTING_SCANNER
 * - KOIN_<CHAIN> (BSC, ETH, SOLANA, dll)
 * - SNAPSHOT_DATA_KOIN (unified snapshot)
 * - FILTER_<CHAIN>
 */

(function(global) {
    'use strict';

    const root = global || (typeof window !== 'undefined' ? window : {});
    const App = root.App || (root.App = {});

    // Configuration
    const DB_CONFIG = {
        name: '',
        store: '',
        snapshotStore: '',
        initialized: false
    };

    // State management
    let allTablesData = {};
    let filteredData = {};
    let searchQuery = '';
    let expandedTables = new Set();

    /**
     * Initialize DB configuration from global config
     */
    function initializeDBConfig() {
        try {
            const appCfg = root.CONFIG_APP?.APP || {};
            const dbCfg = root.CONFIG_DB || {};

            // Database name (hardcoded dari screenshot: MULTIPLUS-DEV)
            DB_CONFIG.name = 'MULTIPLUS-DEV'; // Dari screenshot IndexedDB

            // Store names (dari screenshot: APP_KV_STORE, SNAPSHOT_STORE)
            DB_CONFIG.store = 'APP_KV_STORE';
            DB_CONFIG.snapshotStore = 'SNAPSHOT_STORE';
            DB_CONFIG.initialized = true;

            console.log('[Database Viewer] Initialized with config:', DB_CONFIG);
            console.log('[Database Viewer] Expected stores: APP_KV_STORE, SNAPSHOT_STORE');
        } catch(err) {
            console.error('[Database Viewer] Error initializing config:', err);
        }
    }

    /**
     * Get all chain keys from CONFIG_CHAINS with fallback
     */
    function getAllChainKeys() {
        try {
            const chains = root.CONFIG_CHAINS || {};
            const chainKeys = Object.keys(chains).filter(key => key !== 'multichain');

            if (chainKeys.length > 0) {
                console.log('[Database Viewer] Chains from CONFIG_CHAINS:', chainKeys);
                return chainKeys;
            }

            // Fallback: Detect from IndexedDB keys
            console.warn('[Database Viewer] CONFIG_CHAINS not found, using fallback chain list');
            // Hardcoded common chains sebagai fallback
            return ['bsc', 'ethereum', 'solana', 'polygon', 'arbitrum', 'optimism', 'avalanche', 'fantom', 'base', 'ton'];
        } catch(err) {
            console.error('[Database Viewer] Error getting chain keys:', err);
            // Ultimate fallback
            return ['bsc', 'ethereum', 'solana'];
        }
    }

    /**
     * Load all data from IndexedDB
     */
    async function loadAllTableData() {
        if (!DB_CONFIG.initialized) {
            initializeDBConfig();
        }

        console.log('[Database Viewer] Loading tables with config:', DB_CONFIG);

        try {
            const db = await openDatabase();
            const tables = {};

            // Get all available keys from APP_KV_STORE for auto-detection
            const allKeys = await getAllKeysFromStore(db, DB_CONFIG.store);
            console.log('[Database Viewer] All keys in APP_KV_STORE:', allKeys);

            // 1. Load SETTING_SCANNER
            console.log('[Database Viewer] Loading SETTING_SCANNER...');
            const settings = await getFromDB(db, DB_CONFIG.store, 'SETTING_SCANNER');
            console.log('[Database Viewer] SETTING_SCANNER result:', settings);
            if (settings) {
                tables['SETTING_SCANNER'] = {
                    name: 'SETTING_SCANNER',
                    displayName: 'Setting Scanner',
                    type: 'settings',
                    data: settings,
                    count: Object.keys(settings).length
                };
            }

            // 2. Load KOIN_<CHAIN> for all chains
            const chains = getAllChainKeys();
            console.log('[Database Viewer] Chains found:', chains);

            for (const chain of chains) {
                // Try both formats: BSC and ETHEREUM (not ETH)
                const chainUpper = chain.toUpperCase();

                // Get chain display name (ETHEREUM instead of ETH)
                const chainConfig = root.CONFIG_CHAINS?.[chain.toLowerCase()] || {};
                const chainDisplayName = chainConfig.Nama_Chain || chainUpper;

                const key = `TOKEN_${chainUpper}`;
                console.log(`[Database Viewer] Loading ${key}...`);
                const koinData = await getFromDB(db, DB_CONFIG.store, key);
                console.log(`[Database Viewer] ${key} result:`, koinData ? `${koinData.length} items` : 'null');

                if (koinData && Array.isArray(koinData) && koinData.length > 0) {
                    tables[key] = {
                        name: key,
                        displayName: `Koin ${chainDisplayName}`,
                        type: 'koin',
                        chain: chain,
                        data: koinData,
                        count: koinData.length
                    };
                }
            }

            // 3. Load SNAPSHOT_DATA_KOIN (unified snapshot from SNAPSHOT_STORE)
            const snapshotData = await getFromDB(db, DB_CONFIG.snapshotStore, 'SNAPSHOT_DATA_KOIN');
            if (snapshotData && typeof snapshotData === 'object') {
                // Snapshot data adalah object dengan key per chain
                Object.keys(snapshotData).forEach(chainKey => {
                    const chainData = snapshotData[chainKey];
                    if (Array.isArray(chainData) && chainData.length > 0) {
                        const tableKey = `SNAPSHOT_${chainKey.toUpperCase()}`;
                        tables[tableKey] = {
                            name: tableKey,
                            displayName: `Snapshot ${chainKey.toUpperCase()}`,
                            type: 'snapshot',
                            chain: chainKey,
                            data: chainData,
                            count: chainData.length
                        };
                    }
                });
            }

            // 4. Load FILTER_<CHAIN> for all chains
            for (const chain of chains) {
                const chainUpper = chain.toUpperCase();

                // Get chain display name
                const chainConfig = root.CONFIG_CHAINS?.[chain.toLowerCase()] || {};
                const chainDisplayName = chainConfig.Nama_Chain || chainUpper;

                const key = `FILTER_${chainUpper}`;
                console.log(`[Database Viewer] Loading ${key}...`);
                const filterData = await getFromDB(db, DB_CONFIG.store, key);
                console.log(`[Database Viewer] ${key} result:`, filterData ? 'Found' : 'null');

                if (filterData) {
                    tables[key] = {
                        name: key,
                        displayName: `Filter ${chainDisplayName}`,
                        type: 'filter',
                        chain: chain,
                        data: filterData,
                        count: typeof filterData === 'object' ? Object.keys(filterData).length : 1
                    };
                }
            }

            // 5. Load FILTER_MULTICHAIN
            console.log('[Database Viewer] Loading FILTER_MULTICHAIN...');
            const filterMulti = await getFromDB(db, DB_CONFIG.store, 'FILTER_MULTICHAIN');
            console.log('[Database Viewer] FILTER_MULTICHAIN result:', filterMulti);
            if (filterMulti) {
                tables['FILTER_MULTICHAIN'] = {
                    name: 'FILTER_MULTICHAIN',
                    displayName: 'Filter Multichain',
                    type: 'filter',
                    chain: 'multichain',
                    data: filterMulti,
                    count: typeof filterMulti === 'object' ? Object.keys(filterMulti).length : 1
                };
            }

            allTablesData = tables;
            filteredData = { ...tables };

            console.log('[Database Viewer] ✅ Total tables loaded:', Object.keys(tables).length);
            console.log('[Database Viewer] Table list:', Object.keys(tables));
            return tables;

        } catch(err) {
            console.error('[Database Viewer] Error loading data:', err);
            return {};
        }
    }

    /**
     * Open IndexedDB database
     */
    function openDatabase() {
        return new Promise((resolve, reject) => {
            try {
                const request = indexedDB.open(DB_CONFIG.name);

                request.onsuccess = (event) => {
                    resolve(event.target.result);
                };

                request.onerror = (event) => {
                    reject(new Error('Failed to open database'));
                };
            } catch(err) {
                reject(err);
            }
        });
    }

    /**
     * Get all keys from a store (for auto-detection)
     */
    function getAllKeysFromStore(db, storeName) {
        return new Promise((resolve) => {
            try {
                const tx = db.transaction([storeName], 'readonly');
                const store = tx.objectStore(storeName);
                const request = store.getAllKeys();

                request.onsuccess = () => {
                    resolve(request.result || []);
                };

                request.onerror = () => {
                    resolve([]);
                };
            } catch(err) {
                console.error(`[Database Viewer] Error getting keys from ${storeName}:`, err);
                resolve([]);
            }
        });
    }

    /**
     * Get data from IndexedDB store
     * Support multiple data formats based on screenshot analysis:
     * - {key: 'xxx', val: data} (standard MULTIPLUS-DEV format)
     * - direct data (fallback)
     */
    function getFromDB(db, storeName, key) {
        return new Promise((resolve) => {
            try {
                const tx = db.transaction([storeName], 'readonly');
                const store = tx.objectStore(storeName);
                const request = store.get(key);

                request.onsuccess = () => {
                    const result = request.result;

                    if (!result) {
                        console.log(`[Database Viewer] ${storeName}/${key}: No data found`);
                        resolve(null);
                        return;
                    }

                    // Dari screenshot: format adalah {key: 'TOKEN_BSC', val: Array(600)}
                    if (result.val !== undefined) {
                        const dataType = Array.isArray(result.val) ? `Array(${result.val.length})` : typeof result.val;
                        console.log(`[Database Viewer] ${storeName}/${key}: ✅ Found - Type: ${dataType}`);
                        resolve(result.val);
                    } else if (result.value !== undefined) {
                        console.log(`[Database Viewer] ${storeName}/${key}: Found with .value format`);
                        resolve(result.value);
                    } else {
                        console.log(`[Database Viewer] ${storeName}/${key}: Found with direct format`);
                        resolve(result);
                    }
                };

                request.onerror = (err) => {
                    console.error(`[Database Viewer] ❌ Error reading ${key} from ${storeName}:`, err);
                    resolve(null);
                };
            } catch(err) {
                console.error(`[Database Viewer] ❌ Exception reading ${key} from ${storeName}:`, err);
                resolve(null);
            }
        });
    }

    /**
     * Apply search filter to tables
     */
    function applySearch(query) {
        searchQuery = query.toLowerCase();

        if (!query) {
            filteredData = { ...allTablesData };
            return;
        }

        filteredData = {};

        Object.keys(allTablesData).forEach(tableKey => {
            const table = allTablesData[tableKey];

            // Filter by table name
            if (table.displayName.toLowerCase().includes(searchQuery)) {
                filteredData[tableKey] = table;
                return;
            }

            // Filter by table data content
            if (table.type === 'koin' || table.type === 'snapshot') {
                const filtered = table.data.filter(item => {
                    const searchStr = JSON.stringify(item).toLowerCase();
                    return searchStr.includes(searchQuery);
                });

                if (filtered.length > 0) {
                    filteredData[tableKey] = {
                        ...table,
                        data: filtered,
                        count: filtered.length
                    };
                }
            } else if (table.type === 'settings' || table.type === 'filter') {
                const searchStr = JSON.stringify(table.data).toLowerCase();
                if (searchStr.includes(searchQuery)) {
                    filteredData[tableKey] = table;
                }
            }
        });
    }

    /**
     * Render summary statistics for a table
     */
    function renderTableSummary(table) {
        if (table.type === 'koin' || table.type === 'snapshot') {
            const data = table.data;
            const cexSet = new Set();
            const dexSet = new Set();
            let withSC = 0;
            let withoutSC = 0;

            data.forEach(item => {
                // Count CEX
                if (item.selectedCexs && Array.isArray(item.selectedCexs)) {
                    item.selectedCexs.forEach(cex => cexSet.add(cex));
                } else if (item.cex) {
                    cexSet.add(item.cex);
                }

                // Count DEX
                if (item.selectedDexs && Array.isArray(item.selectedDexs)) {
                    item.selectedDexs.forEach(dex => dexSet.add(dex));
                }

                // Count SC
                const sc = item.sc_in || item.contract_in || '';
                if (sc && sc !== '0x' && sc !== '-') {
                    withSC++;
                } else {
                    withoutSC++;
                }
            });

            return `
                <div class="db-table-summary">
                    <span class="summary-item">
                        <strong>${table.count}</strong> koin
                    </span>
                    <span class="summary-item">
                        <strong>${cexSet.size}</strong> CEX
                    </span>
                    <span class="summary-item">
                        <strong>${dexSet.size}</strong> DEX
                    </span>
                    <span class="summary-item">
                        SC: <strong>${withSC}</strong> ada / <strong>${withoutSC}</strong> kosong
                    </span>
                </div>
            `;
        } else if (table.type === 'filter') {
            const data = table.data;
            const cexCount = data.cex ? data.cex.length : 0;
            const dexCount = data.dex ? data.dex.length : 0;

            return `
                <div class="db-table-summary">
                    <span class="summary-item">
                        CEX aktif: <strong>${cexCount}</strong>
                    </span>
                    <span class="summary-item">
                        DEX aktif: <strong>${dexCount}</strong>
                    </span>
                </div>
            `;
        } else if (table.type === 'settings') {
            return `
                <div class="db-table-summary">
                    <span class="summary-item">
                        <strong>${table.count}</strong> pengaturan
                    </span>
                </div>
            `;
        }

        return '';
    }

    /**
     * Render table data as HTML table
     */
    function renderTableData(table) {
        if (table.type === 'koin' || table.type === 'snapshot') {
            return renderKoinTable(table.data);
        } else if (table.type === 'filter') {
            return renderFilterData(table.data);
        } else if (table.type === 'settings') {
            return renderSettingsData(table.data);
        }
        return '<p class="uk-text-muted">No data renderer available</p>';
    }

    /**
     * Render koin data as table
     */
    function renderKoinTable(data) {
        if (!data || data.length === 0) {
            return '<p class="uk-text-muted uk-text-center">Tidak ada data</p>';
        }

        let html = `
            <div class="uk-overflow-auto">
                <table class="uk-table uk-table-divider uk-table-hover uk-table-small db-data-table">
                    <thead>
                        <tr>
                            <th style="width:40px">No</th>
                            <th>Symbol In</th>
                            <th>Symbol Out</th>
                            <th>SC In</th>
                            <th style="width:60px">DES</th>
                            <th>CEX</th>
                            <th>DEX</th>
                            <th style="width:80px">Status</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        data.forEach((item, idx) => {
            const symbolIn = item.symbol_in || '-';
            const symbolOut = item.symbol_out || '-';
            const scIn = item.sc_in || item.contract_in || '-';
            const des = item.des_in || item.decimals || '-';
            const status = item.status ? 'Aktif' : 'Nonaktif';
            const statusClass = item.status ? 'uk-label-success' : 'uk-label-warning';

            // CEX list
            let cexList = '';
            if (item.selectedCexs && Array.isArray(item.selectedCexs)) {
                cexList = item.selectedCexs.join(', ');
            } else if (item.cex) {
                cexList = item.cex;
            }

            // DEX list
            let dexList = '';
            if (item.selectedDexs && Array.isArray(item.selectedDexs)) {
                dexList = item.selectedDexs.join(', ');
            }

            // Shorten SC
            const shortenSc = (sc) => {
                if (!sc || sc === '-' || sc.length < 12) return sc;
                return `${sc.substring(0, 6)}...${sc.substring(sc.length - 4)}`;
            };

            html += `
                <tr>
                    <td>${idx + 1}</td>
                    <td><strong>${symbolIn}</strong></td>
                    <td>${symbolOut}</td>
                    <td class="uk-text-truncate" title="${scIn}">
                        <code class="uk-text-small">${shortenSc(scIn)}</code>
                    </td>
                    <td class="uk-text-center">${des}</td>
                    <td class="uk-text-small">${cexList}</td>
                    <td class="uk-text-small">${dexList}</td>
                    <td>
                        <span class="uk-label ${statusClass}" style="font-size:10px">${status}</span>
                    </td>
                </tr>
            `;
        });

        html += `
                    </tbody>
                </table>
            </div>
        `;

        return html;
    }

    /**
     * Render filter data
     */
    function renderFilterData(data) {
        let html = '<div class="db-filter-data">';

        if (data.cex && Array.isArray(data.cex)) {
            html += `
                <div class="uk-margin-small">
                    <strong>CEX Aktif (${data.cex.length}):</strong>
                    <div class="uk-margin-small-top">
                        ${data.cex.map(cex => `<span class="uk-label uk-label-primary uk-margin-small-right">${cex}</span>`).join('')}
                    </div>
                </div>
            `;
        }

        if (data.dex && Array.isArray(data.dex)) {
            html += `
                <div class="uk-margin-small">
                    <strong>DEX Aktif (${data.dex.length}):</strong>
                    <div class="uk-margin-small-top">
                        ${data.dex.map(dex => `<span class="uk-label uk-label-success uk-margin-small-right">${dex}</span>`).join('')}
                    </div>
                </div>
            `;
        }

        // Show raw JSON for other properties
        const otherData = { ...data };
        delete otherData.cex;
        delete otherData.dex;

        if (Object.keys(otherData).length > 0) {
            html += `
                <div class="uk-margin-small">
                    <strong>Data Lainnya:</strong>
                    <pre class="uk-margin-small-top uk-padding-small uk-background-muted" style="font-size:11px; max-height:200px; overflow:auto;">${JSON.stringify(otherData, null, 2)}</pre>
                </div>
            `;
        }

        html += '</div>';
        return html;
    }

    /**
     * Render settings data
     */
    function renderSettingsData(data) {
        let html = '<div class="uk-overflow-auto"><table class="uk-table uk-table-divider uk-table-hover uk-table-small"><thead><tr><th>Key</th><th>Value</th></tr></thead><tbody>';

        Object.keys(data).forEach(key => {
            const value = typeof data[key] === 'object'
                ? JSON.stringify(data[key])
                : String(data[key]);

            html += `
                <tr>
                    <td><strong>${key}</strong></td>
                    <td class="uk-text-small">${value}</td>
                </tr>
            `;
        });

        html += '</tbody></table></div>';
        return html;
    }

    /**
     * Render all tables as accordion cards
     */
    function renderDatabaseView() {
        const $container = $('#database-viewer-container');
        if (!$container.length) return;

        const tables = Object.values(filteredData);

        if (tables.length === 0) {
            $container.html(`
                <div class="uk-alert uk-alert-warning">
                    <p>Tidak ada data yang ditemukan${searchQuery ? ` untuk pencarian: "${searchQuery}"` : ''}.</p>
                </div>
            `);
            return;
        }

        // Group tables by type
        const grouped = {
            settings: [],
            koin: [],
            snapshot: [],
            filter: []
        };

        tables.forEach(table => {
            grouped[table.type].push(table);
        });

        let html = '';

        // Render Settings
        if (grouped.settings.length > 0) {
            html += renderTableGroup('Pengaturan Scanner', grouped.settings);
        }

        // Render Koin Tables
        if (grouped.koin.length > 0) {
            html += renderTableGroup('Data Koin per Chain', grouped.koin);
        }

        // Render Snapshot Tables
        if (grouped.snapshot.length > 0) {
            html += renderTableGroup('Snapshot Data', grouped.snapshot);
        }

        // Render Filter Tables
        if (grouped.filter.length > 0) {
            html += renderTableGroup('Filter per Chain', grouped.filter);
        }

        $container.html(html);

        // Bind accordion events
        bindAccordionEvents();
    }

    /**
     * Render table group
     */
    function renderTableGroup(groupTitle, tables) {
        let html = `
            <div class="uk-margin-medium">
                <h4 class="uk-heading-line uk-text-bold">
                    <span>${groupTitle} (${tables.length})</span>
                </h4>
        `;

        tables.forEach(table => {
            const isExpanded = expandedTables.has(table.name);
            const contentDisplay = isExpanded ? 'block' : 'none';
            const iconClass = isExpanded ? 'uk-icon-chevron-down' : 'uk-icon-chevron-right';

            html += `
                <div class="db-table-card uk-card uk-card-default uk-margin-small ${isExpanded ? 'expanded' : ''}" data-table="${table.name}">
                    <div class="db-table-header" data-table="${table.name}">
                        <div class="db-table-title">
                            <span uk-icon="icon: ${iconClass}; ratio: 0.8" class="accordion-icon"></span>
                            <strong>${table.displayName}</strong>
                            <span class="uk-badge uk-margin-small-left">${table.count}</span>
                        </div>
                        <div class="db-table-actions">
                            <button class="uk-button uk-button-small uk-button-default export-table-btn" data-table="${table.name}" title="Export to JSON">
                                <span uk-icon="icon: download; ratio: 0.7"></span>
                                Export
                            </button>
                        </div>
                    </div>
                    <div class="db-table-content" style="display: ${contentDisplay}">
                        ${renderTableSummary(table)}
                        <div class="uk-margin-small-top">
                            ${renderTableData(table)}
                        </div>
                    </div>
                </div>
            `;
        });

        html += '</div>';
        return html;
    }

    /**
     * Bind accordion click events
     */
    function bindAccordionEvents() {
        $('.db-table-header').off('click').on('click', function(e) {
            // Jangan toggle jika klik di button export
            if ($(e.target).closest('.export-table-btn').length > 0) {
                return;
            }

            const tableName = $(this).data('table');
            const $card = $(`.db-table-card[data-table="${tableName}"]`);
            const $content = $card.find('.db-table-content');
            const $icon = $card.find('.accordion-icon');

            if (expandedTables.has(tableName)) {
                // Collapse
                expandedTables.delete(tableName);
                $content.slideUp(300);
                $card.removeClass('expanded');
                $icon.attr('uk-icon', 'icon: chevron-right; ratio: 0.8');
            } else {
                // Expand
                expandedTables.add(tableName);
                $content.slideDown(300);
                $card.addClass('expanded');
                $icon.attr('uk-icon', 'icon: chevron-down; ratio: 0.8');
            }
        });

        // Bind export buttons
        $('.export-table-btn').off('click').on('click', function(e) {
            e.stopPropagation();
            const tableName = $(this).data('table');
            exportTableToJSON(tableName);
        });
    }

    /**
     * Export table data to JSON file
     */
    function exportTableToJSON(tableName) {
        const table = allTablesData[tableName];
        if (!table) {
            if (typeof toast !== 'undefined' && toast.error) {
                toast.error('Tabel tidak ditemukan');
            }
            return;
        }

        try {
            const dataStr = JSON.stringify(table.data, null, 2);
            const blob = new Blob([dataStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = url;
            a.download = `${tableName}_${new Date().getTime()}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            if (typeof toast !== 'undefined' && toast.success) {
                toast.success(`Export ${table.displayName} berhasil`);
            }
        } catch(err) {
            console.error('[Database Viewer] Export error:', err);
            if (typeof toast !== 'undefined' && toast.error) {
                toast.error('Gagal export data');
            }
        }
    }

    /**
     * Show database viewer section
     */
    async function show() {
        // Hide other sections
        try {
            $('#tabel-monitoring, #scanner-config, #filter-card, #sinyal-container').hide();
            $('#token-management, #form-setting-app, #iframe-container, #update-wallet-section').hide();
            if (window.SnapshotModule && typeof window.SnapshotModule.hide === 'function') {
                window.SnapshotModule.hide();
            }
        } catch(_) {}

        // Show database viewer section
        $('#database-viewer-section').fadeIn(300);

        // Show loading overlay
        if (window.AppOverlay) {
            window.AppOverlay.show({
                id: 'db-viewer-loading',
                title: 'Memuat Database...',
                message: 'Mengambil data dari IndexedDB'
            });
        }

        try {
            // Load data
            await loadAllTableData();

            // Render view
            renderDatabaseView();

            // Update stats
            updateGlobalStats();

        } catch(err) {
            console.error('[Database Viewer] Error showing viewer:', err);
            if (typeof toast !== 'undefined' && toast.error) {
                toast.error('Gagal memuat database: ' + err.message);
            }
        } finally {
            // Hide loading overlay
            if (window.AppOverlay) {
                window.AppOverlay.hide('db-viewer-loading');
            }
        }
    }

    /**
     * Hide database viewer section
     */
    function hide() {
        $('#database-viewer-section').fadeOut(300);

        // Show scanner elements
        try {
            $('#tabel-monitoring, #scanner-config, #filter-card, #sinyal-container').fadeIn(300);
        } catch(_) {}
    }

    /**
     * Update global statistics
     */
    function updateGlobalStats() {
        const totalTables = Object.keys(allTablesData).length;
        const totalRecords = Object.values(allTablesData).reduce((sum, table) => sum + table.count, 0);

        $('#db-total-tables').text(totalTables);
        $('#db-total-records').text(totalRecords);
    }

    /**
     * Handle search input
     */
    function handleSearch(query) {
        applySearch(query);
        renderDatabaseView();
        updateGlobalStats();
    }

    /**
     * Refresh database view
     */
    async function refresh() {
        if (window.AppOverlay) {
            window.AppOverlay.show({
                id: 'db-viewer-refresh',
                title: 'Refresh Database...',
                message: 'Memuat ulang data'
            });
        }

        try {
            await loadAllTableData();
            applySearch(searchQuery);
            renderDatabaseView();
            updateGlobalStats();

            if (typeof toast !== 'undefined' && toast.success) {
                toast.success('Database berhasil di-refresh');
            }
        } catch(err) {
            console.error('[Database Viewer] Refresh error:', err);
            if (typeof toast !== 'undefined' && toast.error) {
                toast.error('Gagal refresh database');
            }
        } finally {
            if (window.AppOverlay) {
                window.AppOverlay.hide('db-viewer-refresh');
            }
        }
    }

    /**
     * Initialize module
     */
    function init() {
        // Bind search input
        $('#db-search-input').off('input').on('input', function() {
            const query = $(this).val();
            handleSearch(query);
        });

        // Bind refresh button
        $('#db-refresh-btn').off('click').on('click', refresh);

        // Bind close button
        $('#db-close-btn').off('click').on('click', hide);

        // Bind expand all button
        $('#db-expand-all-btn').off('click').on('click', function() {
            Object.keys(filteredData).forEach(tableName => {
                expandedTables.add(tableName);
            });
            renderDatabaseView();
        });

        // Bind collapse all button
        $('#db-collapse-all-btn').off('click').on('click', function() {
            expandedTables.clear();
            renderDatabaseView();
        });

        console.log('[Database Viewer] Module initialized');
    }

    // Register to App namespace
    if (typeof App.register === 'function') {
        App.register('DatabaseViewer', {
            show,
            hide,
            refresh,
            init
        });
    } else {
        App.DatabaseViewer = { show, hide, refresh, init };
    }

    // Auto-init on DOM ready
    $(document).ready(function() {
        init();
    });

})(typeof window !== 'undefined' ? window : this);
