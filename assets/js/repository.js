/**
 * Fibbl - Repository Module
 * Data access layer for all IndexedDB operations.
 * UI code should use these methods instead of touching IndexedDB directly.
 */
const Repository = (() => {

    // ── Helpers ──────────────────────────────────────────────

    function getStore(storeName, mode) {
        mode = mode || 'readonly';
        const tx = DB.getDB().transaction(storeName, mode);
        return tx.objectStore(storeName);
    }

    function promisify(request) {
        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // ── Accounts ─────────────────────────────────────────────

    const accounts = {
        getAll: function() {
            return promisify(getStore('accounts').getAll());
        },

        getActive: async function() {
            const all = await this.getAll();
            return all.filter(function(a) { return !a.isArchived; });
        },

        getById: function(id) {
            return promisify(getStore('accounts').get(id));
        },

        getDefault: async function() {
            const all = await this.getAll();
            return all.find(function(a) { return a.isDefault && !a.isArchived; })
                || all.find(function(a) { return !a.isArchived; })
                || null;
        },

        create: function(data) {
            var account = {
                name: data.name,
                openingBalance: parseFloat(data.openingBalance) || 0,
                isDefault: data.isDefault || false,
                isArchived: false,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            return promisify(getStore('accounts', 'readwrite').add(account));
        },

        update: function(account) {
            account.updatedAt = new Date().toISOString();
            return promisify(getStore('accounts', 'readwrite').put(account));
        },

        remove: async function(id) {
            // Delete all transactions for this account first
            var txns = await transactions.getByAccount(id);
            for (var i = 0; i < txns.length; i++) {
                await transactions.remove(txns[i].id);
            }
            return promisify(getStore('accounts', 'readwrite').delete(id));
        },

        setDefault: async function(id) {
            var all = await this.getAll();
            for (var i = 0; i < all.length; i++) {
                all[i].isDefault = (all[i].id === id);
                await this.update(all[i]);
            }
        }
    };

    // ── Transactions ─────────────────────────────────────────

    const transactions = {
        getAll: function() {
            return promisify(getStore('transactions').getAll());
        },

        getByAccount: function(accountId) {
            var index = getStore('transactions').index('accountId');
            return promisify(index.getAll(accountId));
        },

        getById: function(id) {
            return promisify(getStore('transactions').get(id));
        },

        create: function(data) {
            var transaction = {
                accountId: data.accountId,
                type: data.type,
                amount: parseFloat(data.amount),
                description: data.description || '',
                category: data.category || '',
                date: data.date,
                time: data.time || '',
                attachment: data.attachment || null,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            return promisify(getStore('transactions', 'readwrite').add(transaction));
        },

        update: function(transaction) {
            transaction.updatedAt = new Date().toISOString();
            return promisify(getStore('transactions', 'readwrite').put(transaction));
        },

        remove: function(id) {
            return promisify(getStore('transactions', 'readwrite').delete(id));
        },

        /**
         * Bulk insert transactions in a single IndexedDB transaction.
         * Returns { inserted, errors } counts.
         * On critical error, the entire batch is rolled back.
         */
        bulkCreate: function(items) {
            return new Promise(function(resolve, reject) {
                if (!items || items.length === 0) {
                    resolve({ inserted: 0, errors: 0 });
                    return;
                }

                var db = DB.getDB();
                var tx = db.transaction('transactions', 'readwrite');
                var store = tx.objectStore('transactions');
                var inserted = 0;
                var errors = 0;

                tx.oncomplete = function() {
                    resolve({ inserted: inserted, errors: errors });
                };

                tx.onerror = function() {
                    reject(tx.error);
                };

                tx.onabort = function() {
                    reject(new Error('Bulk import transaction aborted'));
                };

                var now = new Date().toISOString();

                for (var i = 0; i < items.length; i++) {
                    (function(item) {
                        var record = {
                            accountId: item.accountId,
                            type: item.type,
                            amount: parseFloat(item.amount),
                            description: item.description || '',
                            category: item.category || '',
                            date: item.date,
                            time: item.time || '12:00',
                            attachment: item.attachment || null,
                            createdAt: now,
                            updatedAt: now
                        };
                        var req = store.add(record);
                        req.onsuccess = function() { inserted++; };
                        req.onerror = function() { errors++; req.preventDefault(); };
                    })(items[i]);
                }
            });
        },

        search: async function(accountId, keyword) {
            var all = await this.getByAccount(accountId);
            var lower = keyword.toLowerCase();
            return all.filter(function(t) {
                return (t.description && t.description.toLowerCase().indexOf(lower) !== -1)
                    || (t.category && t.category.toLowerCase().indexOf(lower) !== -1);
            });
        },

        getByDateRange: async function(accountId, startDate, endDate) {
            var all = await this.getByAccount(accountId);
            return all.filter(function(t) {
                return t.date >= startDate && t.date <= endDate;
            });
        }
    };

    // ── Categories ───────────────────────────────────────────

    const categories = {
        getAll: function() {
            return promisify(getStore('categories').getAll());
        },

        getByType: function(type) {
            var index = getStore('categories').index('type');
            return promisify(index.getAll(type));
        },

        create: async function(data) {
            var category = {
                name: data.name,
                type: data.type,
                createdAt: new Date().toISOString()
            };
            try {
                return await promisify(getStore('categories', 'readwrite').add(category));
            } catch (e) {
                // Ignore duplicate name errors
                return null;
            }
        },

        remove: function(id) {
            return promisify(getStore('categories', 'readwrite').delete(id));
        }
    };

    // ── Settings ─────────────────────────────────────────────

    const settings = {
        get: async function(key) {
            try {
                var result = await promisify(getStore('settings').get(key));
                return result ? result.value : null;
            } catch (e) {
                return null;
            }
        },

        set: function(key, value) {
            return promisify(getStore('settings', 'readwrite').put({ key: key, value: value }));
        },

        getAll: function() {
            return promisify(getStore('settings').getAll());
        },

        clear: function() {
            return promisify(getStore('settings', 'readwrite').clear());
        }
    };

    // ── Seed Defaults ────────────────────────────────────────

    async function seedDefaults() {
        // Default account
        var existingAccounts = await accounts.getAll();
        if (existingAccounts.length === 0) {
            await accounts.create({
                name: 'Cash Book',
                openingBalance: 0,
                isDefault: true
            });
        }

        // Default categories
        var existingCategories = await categories.getAll();
        if (existingCategories.length === 0) {
            var defaults = [
                // Cash In categories
                { name: 'Salary', type: 'cashIn' },
                { name: 'Business', type: 'cashIn' },
                { name: 'Investment', type: 'cashIn' },
                { name: 'Interest', type: 'cashIn' },
                { name: 'Gift Received', type: 'cashIn' },
                { name: 'Other Income', type: 'cashIn' },
                // Cash Out categories
                { name: 'Food', type: 'cashOut' },
                { name: 'Tea', type: 'cashOut' },
                { name: 'Milk', type: 'cashOut' },
                { name: 'Grocery', type: 'cashOut' },
                { name: 'Vegetables', type: 'cashOut' },
                { name: 'Snacks', type: 'cashOut' },
                { name: 'Breakfast', type: 'cashOut' },
                { name: 'Transport', type: 'cashOut' },
                { name: 'Taxi', type: 'cashOut' },
                { name: 'Utilities', type: 'cashOut' },
                { name: 'Electricity', type: 'cashOut' },
                { name: 'Rent', type: 'cashOut' },
                { name: 'Shopping', type: 'cashOut' },
                { name: 'Stationery', type: 'cashOut' },
                { name: 'Entertainment', type: 'cashOut' },
                { name: 'Movie', type: 'cashOut' },
                { name: 'Health', type: 'cashOut' },
                { name: 'Education', type: 'cashOut' },
                { name: 'School fees', type: 'cashOut' },
                { name: 'Cold drinks', type: 'cashOut' },
                { name: 'Other Expense', type: 'cashOut' }
            ];

            for (var i = 0; i < defaults.length; i++) {
                await categories.create(defaults[i]);
            }
        }

        // Default settings
        if (await settings.get('darkMode') === null) {
            await settings.set('darkMode', false);
        }
        if (await settings.get('sortOrder') === null) {
            await settings.set('sortOrder', 'desc');
        }
        if (await settings.get('currency') === null) {
            await settings.set('currency', APP_CONFIG.CURRENCY_SYMBOL);
        }
    }

    // ── Bulk operations (for backup/restore) ─────────────────

    async function exportAll() {
        return {
            accounts: await accounts.getAll(),
            transactions: await transactions.getAll(),
            categories: await categories.getAll(),
            settings: await settings.getAll(),
            exportDate: new Date().toISOString(),
            appVersion: '1.0.0'
        };
    }

    async function importAll(data) {
        // Clear all stores
        var storeNames = ['accounts', 'transactions', 'categories', 'settings'];
        for (var s = 0; s < storeNames.length; s++) {
            await promisify(getStore(storeNames[s], 'readwrite').clear());
        }

        // Import accounts
        if (data.accounts) {
            for (var i = 0; i < data.accounts.length; i++) {
                await promisify(getStore('accounts', 'readwrite').add(data.accounts[i]));
            }
        }

        // Import transactions
        if (data.transactions) {
            for (var j = 0; j < data.transactions.length; j++) {
                await promisify(getStore('transactions', 'readwrite').add(data.transactions[j]));
            }
        }

        // Import categories
        if (data.categories) {
            for (var k = 0; k < data.categories.length; k++) {
                try {
                    await promisify(getStore('categories', 'readwrite').add(data.categories[k]));
                } catch (e) {
                    // Skip duplicates
                }
            }
        }

        // Import settings
        if (data.settings) {
            for (var m = 0; m < data.settings.length; m++) {
                await promisify(getStore('settings', 'readwrite').put(data.settings[m]));
            }
        }
    }

    async function clearAll() {
        var storeNames = ['accounts', 'transactions', 'categories', 'settings'];
        for (var i = 0; i < storeNames.length; i++) {
            await promisify(getStore(storeNames[i], 'readwrite').clear());
        }
    }

    return {
        accounts: accounts,
        transactions: transactions,
        categories: categories,
        settings: settings,
        seedDefaults: seedDefaults,
        exportAll: exportAll,
        importAll: importAll,
        clearAll: clearAll
    };
})();
