/**
 * Fibbl – Settings Module
 * Handles dark mode, currency, and settings view interactions.
 */
const SettingsManager = (() => {

    // ── Show Settings ────────────────────────────────────────

    function show() {
        document.getElementById('main-header').classList.add('hidden');
        document.getElementById('settings-header').classList.remove('hidden');

        document.getElementById('view-transactions').classList.add('hidden');
        document.getElementById('view-settings').classList.remove('hidden');

        loadSettings();
    }

    function hide() {
        document.getElementById('settings-header').classList.add('hidden');
        document.getElementById('main-header').classList.remove('hidden');

        document.getElementById('view-settings').classList.add('hidden');
        document.getElementById('view-transactions').classList.remove('hidden');
    }

    // ── Load Settings ────────────────────────────────────────

    async function loadSettings() {
        var darkMode = await Repository.settings.get('darkMode');
        document.getElementById('toggle-dark-mode').checked = darkMode === true;

        var currency = await Repository.settings.get('currency');
        document.getElementById('settings-currency').value = currency || APP_CONFIG.CURRENCY_SYMBOL;

        // Google Drive status
        updateGDriveStatus();
    }

    function updateGDriveStatus() {
        var configured = APP_CONFIG.GOOGLE_CLIENT_ID && APP_CONFIG.GOOGLE_CLIENT_ID.length > 0;
        var statusEl = document.getElementById('gdrive-status');

        if (configured) {
            statusEl.querySelector('.settings-item-label').textContent = 'Google Drive connected';
            statusEl.querySelector('.settings-item-label').classList.remove('gdrive-not-configured');
        } else {
            statusEl.querySelector('.settings-item-label').textContent = 'Google Drive is not configured.';
            statusEl.querySelector('.settings-item-label').classList.add('gdrive-not-configured');
        }
    }

    // ── Dark Mode ────────────────────────────────────────────

    async function toggleDarkMode(enabled) {
        await Repository.settings.set('darkMode', enabled);
        App.applyDarkMode(enabled);
    }

    // ── Currency ─────────────────────────────────────────────

    async function updateCurrency(symbol) {
        if (symbol) {
            await Repository.settings.set('currency', symbol);
        }
    }

    // ── Init ─────────────────────────────────────────────────

    function init() {
        // Back button
        document.getElementById('btn-settings-back').addEventListener('click', hide);

        // Dark mode toggle
        document.getElementById('toggle-dark-mode').addEventListener('change', function() {
            toggleDarkMode(this.checked);
        });

        // Currency input
        document.getElementById('settings-currency').addEventListener('change', function() {
            updateCurrency(this.value.trim());
        });

        // Google Drive buttons
        document.getElementById('btn-gdrive-backup').addEventListener('click', function() {
            if (!APP_CONFIG.GOOGLE_CLIENT_ID) {
                App.showToast('Google Drive is not configured');
                return;
            }
            GoogleDriveService.backup();
        });

        document.getElementById('btn-gdrive-restore').addEventListener('click', function() {
            if (!APP_CONFIG.GOOGLE_CLIENT_ID) {
                App.showToast('Google Drive is not configured');
                return;
            }
            GoogleDriveService.restore();
        });
    }

    return {
        show: show,
        hide: hide,
        init: init,
        loadSettings: loadSettings
    };
})();
