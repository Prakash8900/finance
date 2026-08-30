/**
 * Fibbl – Backup Module
 * Export, Import, and Delete all local data.
 */
const BackupManager = (() => {

    // ── Export ────────────────────────────────────────────────

    async function exportBackup() {
        try {
            var data = await Repository.exportAll();

            var json = JSON.stringify(data, null, 2);
            var now = new Date();
            var dateStr = now.getFullYear() + '-' +
                String(now.getMonth() + 1).padStart(2, '0') + '-' +
                String(now.getDate()).padStart(2, '0');

            var filename = 'Fibbl_Backup_' + dateStr + '.json';
            var blob = new Blob([json], { type: 'application/json' });
            var url = URL.createObjectURL(blob);

            var a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            App.showToast('Backup exported: ' + filename);
        } catch (e) {
            console.error('Export error:', e);
            App.showToast('Error exporting backup');
        }
    }

    // ── Import ───────────────────────────────────────────────

    function triggerImport() {
        document.getElementById('import-file-input').click();
    }

    async function handleImportFile(file) {
        if (!file) return;

        try {
            var text = await file.text();
            var data = JSON.parse(text);

            // Validate structure
            if (!data.accounts || !data.transactions) {
                App.showToast('Invalid backup file format');
                return;
            }

            App.showConfirm(
                'Import will replace all existing data. Are you sure you want to continue?',
                async function() {
                    try {
                        await Repository.importAll(data);
                        App.showToast('Backup restored successfully');

                        // Reload app state
                        var defaultAccount = await Repository.accounts.getDefault();
                        if (defaultAccount) {
                            App.setCurrentAccountId(defaultAccount.id);
                            document.getElementById('header-account-name').textContent = defaultAccount.name;
                        }

                        // Reload dark mode setting
                        var darkMode = await Repository.settings.get('darkMode');
                        App.applyDarkMode(darkMode);

                        // Reload currency
                        var currency = await Repository.settings.get('currency');
                        if (currency) {
                            document.getElementById('settings-currency').value = currency;
                        }

                        TransactionList.render();
                    } catch (e) {
                        console.error('Import error:', e);
                        App.showToast('Error restoring backup');
                    }
                }
            );
        } catch (e) {
            console.error('Parse error:', e);
            App.showToast('Invalid JSON file');
        }
    }

    // ── Delete All ───────────────────────────────────────────

    function deleteAllData() {
        App.showConfirm(
            'This will permanently delete ALL your data including accounts, transactions, and settings. This action cannot be undone. Are you sure?',
            async function() {
                try {
                    await Repository.clearAll();
                    await Repository.seedDefaults();

                    // Reset app state
                    var defaultAccount = await Repository.accounts.getDefault();
                    if (defaultAccount) {
                        App.setCurrentAccountId(defaultAccount.id);
                        document.getElementById('header-account-name').textContent = defaultAccount.name;
                    }

                    // Reset dark mode
                    App.applyDarkMode(false);
                    document.getElementById('toggle-dark-mode').checked = false;

                    TransactionList.render();
                    App.showToast('All data deleted');
                } catch (e) {
                    console.error('Delete all error:', e);
                    App.showToast('Error deleting data');
                }
            }
        );
    }

    // ── Init ─────────────────────────────────────────────────

    function init() {
        document.getElementById('btn-export-backup').addEventListener('click', exportBackup);
        document.getElementById('btn-import-backup').addEventListener('click', triggerImport);
        document.getElementById('btn-delete-all').addEventListener('click', deleteAllData);

        document.getElementById('import-file-input').addEventListener('change', function(e) {
            if (e.target.files && e.target.files[0]) {
                handleImportFile(e.target.files[0]);
                e.target.value = ''; // Reset for re-import
            }
        });
    }

    return {
        exportBackup: exportBackup,
        triggerImport: triggerImport,
        deleteAllData: deleteAllData,
        init: init
    };
})();
