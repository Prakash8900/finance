/**
 * Fibbl - Database Module
 * Manages IndexedDB connection, schema creation, and lifecycle.
 */
const DB = (() => {
    let db = null;

    /**
     * Initialize the database connection and create/upgrade schema.
     */
    function init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(APP_CONFIG.DB_NAME, APP_CONFIG.DB_VERSION);

            request.onupgradeneeded = (event) => {
                const database = event.target.result;

                // Accounts store
                if (!database.objectStoreNames.contains('accounts')) {
                    const store = database.createObjectStore('accounts', {
                        keyPath: 'id',
                        autoIncrement: true
                    });
                    store.createIndex('name', 'name', { unique: false });
                    store.createIndex('isDefault', 'isDefault', { unique: false });
                }

                // Transactions store
                if (!database.objectStoreNames.contains('transactions')) {
                    const store = database.createObjectStore('transactions', {
                        keyPath: 'id',
                        autoIncrement: true
                    });
                    store.createIndex('accountId', 'accountId', { unique: false });
                    store.createIndex('date', 'date', { unique: false });
                    store.createIndex('type', 'type', { unique: false });
                    store.createIndex('category', 'category', { unique: false });
                    store.createIndex('account_date', ['accountId', 'date'], { unique: false });
                }

                // Categories store
                if (!database.objectStoreNames.contains('categories')) {
                    const store = database.createObjectStore('categories', {
                        keyPath: 'id',
                        autoIncrement: true
                    });
                    store.createIndex('name', 'name', { unique: true });
                    store.createIndex('type', 'type', { unique: false });
                }

                // Settings store (key-value pairs)
                if (!database.objectStoreNames.contains('settings')) {
                    database.createObjectStore('settings', { keyPath: 'key' });
                }
            };

            request.onsuccess = (event) => {
                db = event.target.result;

                // Handle connection close/version change
                db.onversionchange = () => {
                    db.close();
                    db = null;
                };

                resolve(db);
            };

            request.onerror = (event) => {
                console.error('IndexedDB error:', event.target.error);
                reject(event.target.error);
            };
        });
    }

    /**
     * Get the active database connection.
     */
    function getDB() {
        return db;
    }

    /**
     * Close the database connection.
     */
    function close() {
        if (db) {
            db.close();
            db = null;
        }
    }

    /**
     * Delete the entire database (used for full data reset).
     */
    function deleteDatabase() {
        return new Promise((resolve, reject) => {
            close();
            const request = indexedDB.deleteDatabase(APP_CONFIG.DB_NAME);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    return { init, getDB, close, deleteDatabase };
})();
