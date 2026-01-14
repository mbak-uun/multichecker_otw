/* IndexedDB-backed localStorage shim
 * - Transparently persists localStorage reads/writes to IndexedDB
 * - Uses an in-memory cache for synchronous reads
 * - One-way migration from native localStorage at init (no mirroring after)
 */
(function () {
  if (typeof window === 'undefined' || !('indexedDB' in window) || !window.localStorage) {
    return; // Environment not supported; do nothing.
  }

  const storage = window.localStorage;
  const native = {
    getItem: storage.getItem.bind(storage),
    // We will NOT call set/remove/clear on native after migration (one-way)
    key: storage.key ? storage.key.bind(storage) : undefined,
    length: () => storage.length
  };
  // Accessors to call original native removal/clear for cleanup only
  const StorageProto = Object.getPrototypeOf(storage) || window.Storage && window.Storage.prototype;
  const nativeRemove = StorageProto && StorageProto.removeItem ? StorageProto.removeItem.bind(storage) : null;
  const nativeClear = StorageProto && StorageProto.clear ? StorageProto.clear.bind(storage) : null;

  const root = window;
  const appCfg = (root.CONFIG_APP && root.CONFIG_APP.APP) ? root.CONFIG_APP.APP : {};
  const dbCfg = root.CONFIG_DB || {};
  const DB_NAME = dbCfg.NAME || appCfg.NAME || 'MULTIALL-PLUS';
  const STORE_NAME = (dbCfg.STORES && dbCfg.STORES.LOCALSTORAGE) ? dbCfg.STORES.LOCALSTORAGE : 'LOCALSTORAGE_STORE';
  let db = null;
  const cache = new Map();
  let readyResolve;
  const ready = new Promise((res) => (readyResolve = res));
  const nativeKeysAtInit = [];
  const pendingWrites = new Set(); // Track pending write operations
  const pendingPromises = new Map(); // Track pending write promises

  function openDB() {
    return new Promise((resolve, reject) => {
      try{
        // Open without explicit version to avoid VersionError when DB already upgraded
        const req = indexedDB.open(DB_NAME);
        req.onupgradeneeded = () => {
          const d = req.result;
          if (!d.objectStoreNames.contains(STORE_NAME)) {
            d.createObjectStore(STORE_NAME, { keyPath: 'key' });
          }
        };
        req.onsuccess = () => {
          const d = req.result;
          if (!d.objectStoreNames.contains(STORE_NAME)){
            const next = (d.version || 1) + 1;
            d.close();
            const up = indexedDB.open(DB_NAME, next);
            up.onupgradeneeded = () => {
              const udb = up.result;
              if (!udb.objectStoreNames.contains(STORE_NAME)) udb.createObjectStore(STORE_NAME, { keyPath: 'key' });
            };
            up.onsuccess = () => resolve(up.result);
            up.onerror = () => reject(up.error);
          } else {
            resolve(d);
          }
        };
        req.onerror = () => reject(req.error);
      }catch(e){ reject(e); }
    });
  }

  function tx(storeName, mode) {
    const t = db.transaction(storeName, mode);
    return t.objectStore(storeName);
  }

  function idbSet(key, value) {
    if (!db) return Promise.resolve();

    const promise = new Promise((resolve, reject) => {
      try {
        pendingWrites.add(key);
        const req = tx(STORE_NAME, 'readwrite').put({ key, value });
        req.onsuccess = function() {
          pendingWrites.delete(key);
          pendingPromises.delete(key);
          // console.log('[IDB] ✅ Saved:', key);
          resolve();
        };
        req.onerror = function(e) {
          pendingWrites.delete(key);
          pendingPromises.delete(key);
          console.error('[IDB] ❌ Failed to save key:', key, e.target.error);
          // Fallback: keep in cache even if IDB write fails
          if (!cache.has(key)) {
            cache.set(key, String(value));
          }
          reject(e.target.error);
        };
      } catch (e) {
        pendingWrites.delete(key);
        pendingPromises.delete(key);
        console.error('[IDB] Exception during idbSet:', key, e);
        // Fallback: keep in cache
        if (!cache.has(key)) {
          cache.set(key, String(value));
        }
        reject(e);
      }
    });

    pendingPromises.set(key, promise);
    return promise;
  }

  function idbRemove(key) {
    if (!db) return;
    try {
      tx(STORE_NAME, 'readwrite').delete(key);
    } catch (_) {}
  }

  function idbClear() {
    if (!db) return;
    try {
      tx(STORE_NAME, 'readwrite').clear();
    } catch (_) {}
  }

  function idbLoadAll() {
    return new Promise((resolve) => {
      try {
        const store = tx(STORE_NAME, 'readonly');
        const req = store.openCursor();
        let loadedCount = 0;
        req.onsuccess = (e) => {
          const cursor = e.target.result;
          if (cursor) {
            const { key, value } = cursor.value || {};
            if (typeof key === 'string') {
              cache.set(key, String(value));
              loadedCount++;
            }
            cursor.continue();
          } else {
            try { if (window.SCAN_LOG_ENABLED) console.log('[IDB] Loaded', loadedCount, 'items from IndexedDB'); } catch(_) {}
            resolve();
          }
        };
        req.onerror = (e) => {
          console.error('[IDB] Failed to load from IndexedDB:', e.target.error);
          resolve();
        };
      } catch (e) {
        console.error('[IDB] Exception during idbLoadAll:', e);
        resolve();
      }
    });
  }

  function migrateFromNative() {
    // Copy any existing native localStorage keys into IDB if not present in cache
    try {
      const len = native.length();
      for (let i = 0; i < len; i++) {
        const key = storage.key(i);
        if (key && !cache.has(key)) {
          const v = native.getItem(key);
          if (v !== null) {
            const sv = String(v);
            cache.set(key, sv);
            idbSet(key, sv);
          }
        }
        if (key) nativeKeysAtInit.push(key);
      }
    } catch (_) {}
  }

  function clearNativeMigratedKeys() {
    // Safely remove only keys that were present at init and are now in cache (migrated)
    if (!nativeRemove) return;
    try {
      for (const k of nativeKeysAtInit) {
        if (cache.has(k)) {
          try { nativeRemove(k); } catch (_) {}
        }
      }
    } catch (_) {}
  }

  // Request persistent storage permission to prevent browser from clearing data
  async function requestPersistentStorage() {
    if (navigator.storage && navigator.storage.persist) {
      try {
        const isPersisted = await navigator.storage.persisted();
        try { if (window.SCAN_LOG_ENABLED) console.log('[IDB] 📦 Storage persisted:', isPersisted); } catch(_) {}

        if (!isPersisted) {
          const result = await navigator.storage.persist();
          try { if (window.SCAN_LOG_ENABLED) console.log('[IDB] 📦 Persistent storage request result:', result); } catch(_) {}
          if (result) {
            try { if (window.SCAN_LOG_ENABLED) console.log('[IDB] ✅ Persistent storage granted - data will survive browser restarts'); } catch(_) {}
          } else {
            try { if (window.SCAN_LOG_ENABLED) console.warn('[IDB] ⚠️ Persistent storage denied - data may be cleared by browser'); } catch(_) {}
          }
        } else {
          try { if (window.SCAN_LOG_ENABLED) console.log('[IDB] ✅ Storage already persistent'); } catch(_) {}
        }

        // Log storage quota
        if (navigator.storage && navigator.storage.estimate) {
          const estimate = await navigator.storage.estimate();
          const usedMB = (estimate.usage / 1024 / 1024).toFixed(2);
          const quotaMB = (estimate.quota / 1024 / 1024).toFixed(2);
          try { if (window.SCAN_LOG_ENABLED) console.log(`[IDB] 💾 Storage usage: ${usedMB} MB / ${quotaMB} MB`); } catch(_) {}
        }
      } catch (e) {
        try { if (window.SCAN_LOG_ENABLED) console.warn('[IDB] ⚠️ Failed to request persistent storage:', e); } catch(_) {}
      }
    } else {
      try { if (window.SCAN_LOG_ENABLED) console.warn('[IDB] ⚠️ Persistent storage API not available'); } catch(_) {}
    }
  }

  (async function init() {
    try {
      db = await openDB();
      await idbLoadAll();
      // One-time migrate from native localStorage to IDB (one-way)
      migrateFromNative();
      // After successful migration, clean up native keys to enforce single source of truth
      clearNativeMigratedKeys();
      // Request persistent storage to prevent data loss
      await requestPersistentStorage();
    } catch (_) {
      // If IDB fails, we keep native behavior only.
    } finally {
      readyResolve();
    }
  })();

  // Override methods to use cache + IDB only (no mirroring back to native)
  storage.setItem = function (key, value) {
    const sv = String(value);
    cache.set(key, sv);
    idbSet(key, sv);
  };

  storage.getItem = function (key) {
    if (cache.has(key)) return cache.get(key);
    // After init+migration completes, we only trust IDB cache; return null if not present
    return null;
  };

  storage.removeItem = function (key) {
    cache.delete(key);
    idbRemove(key);
  };

  storage.clear = function () {
    cache.clear();
    idbClear();
  };

  // Flush all pending writes to IndexedDB
  async function flushPendingWrites() {
    if (pendingPromises.size === 0) {
      try { if (window.SCAN_LOG_ENABLED) console.log('[IDB] ✅ No pending writes to flush'); } catch(_) {}
      return Promise.resolve();
    }

    try { if (window.SCAN_LOG_ENABLED) console.log(`[IDB] 🔄 Flushing ${pendingPromises.size} pending writes...`); } catch(_) {}
    const promises = Array.from(pendingPromises.values());

    try {
      await Promise.all(promises);
      try { if (window.SCAN_LOG_ENABLED) console.log('[IDB] ✅ All pending writes flushed successfully'); } catch(_) {}
    } catch (e) {
      console.error('[IDB] ❌ Some writes failed during flush:', e);
      throw e;
    }
  }

  // Auto-flush pending writes before page unload
  window.addEventListener('beforeunload', function(e) {
    if (pendingWrites.size > 0) {
      try { if (window.SCAN_LOG_ENABLED) console.warn('[IDB] ⚠️ Attempting to flush pending writes before unload...'); } catch(_) {}
      try { if (window.SCAN_LOG_ENABLED) console.warn('[IDB] Pending writes:', Array.from(pendingWrites)); } catch(_) {}

      // Try synchronous flush (browsers may block async operations in beforeunload)
      // This is best-effort - modern browsers may still kill the process
      try {
        // Use sendBeacon or synchronous XHR as fallback if needed
        // For IndexedDB, we rely on browser's commit-on-close behavior
        try { if (window.SCAN_LOG_ENABLED) console.warn('[IDB] ⚠️ Warning: Some writes may not persist if browser closes immediately'); } catch(_) {}
      } catch (err) {
        console.error('[IDB] ❌ Failed to flush before unload:', err);
      }
    }
  });

  // Periodic auto-flush every 5 seconds to reduce data loss risk
  setInterval(function() {
    if (pendingWrites.size > 0) {
      try { if (window.SCAN_LOG_ENABLED) console.log('[IDB] 🔄 Auto-flushing', pendingWrites.size, 'pending writes...'); } catch(_) {}
      flushPendingWrites().catch(function(e) {
        console.error('[IDB] ❌ Auto-flush failed:', e);
      });
    }
  }, 5000);

  // Diagnostic function to check storage status
  async function checkStorageStatus() {
    try { if (window.SCAN_LOG_ENABLED) console.log('=== IndexedDB Storage Status ==='); } catch(_) {}
    try { if (window.SCAN_LOG_ENABLED) console.log('DB Name:', DB_NAME); } catch(_) {}
    try { if (window.SCAN_LOG_ENABLED) console.log('Store Name:', STORE_NAME); } catch(_) {}
    try { if (window.SCAN_LOG_ENABLED) console.log('DB Instance:', db ? 'Connected' : 'Not connected'); } catch(_) {}
    try { if (window.SCAN_LOG_ENABLED) console.log('Cache size:', cache.size, 'items'); } catch(_) {}
    try { if (window.SCAN_LOG_ENABLED) console.log('Pending writes:', pendingWrites.size); } catch(_) {}

    if (navigator.storage && navigator.storage.persisted) {
      try {
        const isPersisted = await navigator.storage.persisted();
        try { if (window.SCAN_LOG_ENABLED) console.log('Storage persisted:', isPersisted ? '✅ YES' : '❌ NO - Data may be cleared!'); } catch(_) {}

        if (navigator.storage.estimate) {
          const estimate = await navigator.storage.estimate();
          const usedMB = (estimate.usage / 1024 / 1024).toFixed(2);
          const quotaMB = (estimate.quota / 1024 / 1024).toFixed(2);
          const percentUsed = ((estimate.usage / estimate.quota) * 100).toFixed(2);
          try { if (window.SCAN_LOG_ENABLED) console.log(`Storage usage: ${usedMB} MB / ${quotaMB} MB (${percentUsed}%)`); } catch(_) {}
        }
      } catch (e) {
        console.error('Failed to check storage status:', e);
      }
    }

    // List some keys in cache
    try { if (window.SCAN_LOG_ENABLED) console.log('Sample keys in cache:', Array.from(cache.keys()).slice(0, 10)); } catch(_) {}
    try { if (window.SCAN_LOG_ENABLED) console.log('================================'); } catch(_) {}
  }

  // Expose a readiness promise in case app code wants to await it
  window.__IDB_LOCALSTORAGE_READY__ = ready;
  // Expose pending writes for debugging
  window.__IDB_PENDING_WRITES__ = pendingWrites;
  // Expose flush function for explicit save operations
  window.__IDB_FLUSH_PENDING__ = flushPendingWrites;
  // Expose diagnostic function
  window.__IDB_CHECK_STATUS__ = checkStorageStatus;
})();
