/**
 * Fibbl – Main Application Controller
 * Initializes the app, handles navigation, global events, and app state.
 */
const App = (() => {

    let currentAccountId = null;
    let confirmCallback = null;

    // ── Initialization ───────────────────────────────────────

    async function init() {
        try {
            // Initialize database
            await DB.init();

            // Seed defaults
            await Repository.seedDefaults();

            // Load default account
            var defaultAccount = await Repository.accounts.getDefault();
            if (defaultAccount) {
                currentAccountId = defaultAccount.id;
                document.getElementById('header-account-name').textContent = defaultAccount.name;
            }

            // Load settings
            var darkMode = await Repository.settings.get('darkMode');
            applyDarkMode(darkMode);

            var currency = await Repository.settings.get('currency');
            if (currency) {
                document.getElementById('settings-currency').value = currency;
            }

            // Initialize sort order
            await TransactionList.initSortOrder();

            // Initialize modules
            TransactionForm.init();
            AccountManager.init();
            ReportGenerator.init();
            BackupManager.init();
            SettingsManager.init();
            GoogleDriveService.init();
            ImportManager.init();

            // Bind global events
            bindEvents();

            // Render transaction list
            TransactionList.render();

            // Register service worker
            registerServiceWorker();

            // Initialize PWA install prompt
            initPWA();

        } catch (e) {
            console.error('App initialization error:', e);
        }
    }

    // ── Event Bindings ───────────────────────────────────────

    function bindEvents() {
        // Hamburger menu
        document.getElementById('btn-hamburger').addEventListener('click', openSidebar);
        document.getElementById('sidebar-overlay').addEventListener('click', closeSidebar);

        // Sidebar items
        var sidebarItems = document.querySelectorAll('.sidebar-item');
        sidebarItems.forEach(function(item) {
            item.addEventListener('click', function() {
                var view = item.dataset.view;
                handleSidebarNavigation(view);
            });
        });

        // Filter pills
        var pills = document.querySelectorAll('.pill');
        pills.forEach(function(pill) {
            pill.addEventListener('click', function() {
                TransactionList.setFilter(pill.dataset.filter);
            });
        });

        // Date navigation
        document.getElementById('btn-date-prev').addEventListener('click', function() {
            TransactionList.navigatePrev();
        });

        document.getElementById('btn-date-next').addEventListener('click', function() {
            TransactionList.navigateNext();
        });

        // Cash In / Cash Out buttons
        document.getElementById('btn-add-cash-in').addEventListener('click', function() {
            TransactionForm.show('cashIn');
        });

        document.getElementById('btn-add-cash-out').addEventListener('click', function() {
            TransactionForm.show('cashOut');
        });

        // Transaction row click (edit)
        document.getElementById('transaction-list').addEventListener('click', function(e) {
            var row = e.target.closest('.tx-row');
            if (row) {
                var id = parseInt(row.dataset.id);
                TransactionForm.show(null, id);
            }
        });

        // Search button
        document.getElementById('btn-search').addEventListener('click', showSearch);

        // Three-dot menu
        document.getElementById('btn-menu').addEventListener('click', showFilterMenu);

        // Search dialog
        document.getElementById('search-input').addEventListener('input', function() {
            TransactionList.setSearch(this.value);
        });

        document.getElementById('btn-search-clear').addEventListener('click', function() {
            document.getElementById('search-input').value = '';
            TransactionList.clearSearch();
            hideSearch();
        });

        document.getElementById('dialog-search').addEventListener('click', function(e) {
            if (e.target === this) hideSearch();
        });

        // Filter menu
        document.getElementById('dialog-filter').addEventListener('click', function(e) {
            if (e.target === this) hideFilterMenu();

            var item = e.target.closest('.filter-menu-item');
            if (item) {
                handleFilterAction(item.dataset.action);
                hideFilterMenu();
            }
        });

        // Date picker dialog
        document.getElementById('btn-date-ok').addEventListener('click', function() {
            var dateVal = document.getElementById('filter-date-input').value;
            if (dateVal) {
                TransactionList.setDateFilter(dateVal);
            }
            document.getElementById('dialog-date-picker').classList.add('hidden');
        });

        document.getElementById('btn-date-cancel').addEventListener('click', function() {
            document.getElementById('dialog-date-picker').classList.add('hidden');
        });

        document.getElementById('dialog-date-picker').addEventListener('click', function(e) {
            if (e.target === this) this.classList.add('hidden');
        });

        // Date range dialog
        document.getElementById('btn-range-ok').addEventListener('click', function() {
            var start = document.getElementById('range-start-date').value;
            var end = document.getElementById('range-end-date').value;
            if (start && end) {
                TransactionList.setDateRange(start, end);
            }
            document.getElementById('dialog-date-range').classList.add('hidden');
        });

        document.getElementById('btn-range-cancel').addEventListener('click', function() {
            document.getElementById('dialog-date-range').classList.add('hidden');
        });

        document.getElementById('dialog-date-range').addEventListener('click', function(e) {
            if (e.target === this) this.classList.add('hidden');
        });

        // Confirm dialog
        document.getElementById('btn-confirm-ok').addEventListener('click', function() {
            document.getElementById('dialog-confirm').classList.add('hidden');
            if (confirmCallback) {
                confirmCallback();
                confirmCallback = null;
            }
        });

        document.getElementById('btn-confirm-cancel').addEventListener('click', function() {
            document.getElementById('dialog-confirm').classList.add('hidden');
            confirmCallback = null;
        });

        document.getElementById('dialog-confirm').addEventListener('click', function(e) {
            if (e.target === this) {
                this.classList.add('hidden');
                confirmCallback = null;
            }
        });

        // Keyboard: Escape to close dialogs
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                closeAllDialogs();
            }
        });
    }

    // ── Sidebar ──────────────────────────────────────────────

    function openSidebar() {
        document.getElementById('sidebar').classList.add('open');
        document.getElementById('sidebar-overlay').classList.add('open');
    }

    function closeSidebar() {
        document.getElementById('sidebar').classList.remove('open');
        document.getElementById('sidebar-overlay').classList.remove('open');
    }

    function handleSidebarNavigation(view) {
        closeSidebar();

        // Update active state
        var items = document.querySelectorAll('.sidebar-item');
        items.forEach(function(item) {
            item.classList.toggle('active', item.dataset.view === view);
        });

        switch (view) {
            case 'transactions':
                showTransactionView();
                break;
            case 'accounts':
                showTransactionView();
                AccountManager.showSelector();
                break;
            case 'import':
                showImportView();
                break;
            case 'settings':
                SettingsManager.show();
                break;
            case 'about':
                SettingsManager.show();
                break;
        }
    }

    function showTransactionView() {
        // Hide other views and headers
        document.getElementById('settings-header').classList.add('hidden');
        document.getElementById('form-header').classList.add('hidden');
        document.getElementById('import-header').classList.add('hidden');
        document.getElementById('main-header').classList.remove('hidden');

        document.getElementById('view-settings').classList.add('hidden');
        document.getElementById('view-transaction-form').classList.add('hidden');
        document.getElementById('view-import').classList.add('hidden');
        document.getElementById('view-transactions').classList.remove('hidden');

        TransactionList.render();
    }

    function showImportView() {
        document.getElementById('main-header').classList.add('hidden');
        document.getElementById('settings-header').classList.add('hidden');
        document.getElementById('form-header').classList.add('hidden');
        document.getElementById('import-header').classList.remove('hidden');

        document.getElementById('view-transactions').classList.add('hidden');
        document.getElementById('view-transaction-form').classList.add('hidden');
        document.getElementById('view-settings').classList.add('hidden');
        document.getElementById('view-import').classList.remove('hidden');
    }

    // ── Search ───────────────────────────────────────────────

    function showSearch() {
        document.getElementById('dialog-search').classList.remove('hidden');
        document.getElementById('search-input').value = '';
        setTimeout(function() {
            document.getElementById('search-input').focus();
        }, 100);
    }

    function hideSearch() {
        document.getElementById('dialog-search').classList.add('hidden');
    }

    // ── Filter Menu ──────────────────────────────────────────

    function showFilterMenu() {
        document.getElementById('dialog-filter').classList.remove('hidden');
    }

    function hideFilterMenu() {
        document.getElementById('dialog-filter').classList.add('hidden');
    }

    function handleFilterAction(action) {
        switch (action) {
            case 'keyword-search':
                showSearch();
                break;
            case 'filter-all':
                TransactionList.setFilter('all');
                break;
            case 'filter-daily':
                TransactionList.setFilter('daily');
                break;
            case 'filter-weekly':
                TransactionList.setFilter('weekly');
                break;
            case 'filter-monthly':
                TransactionList.setFilter('monthly');
                break;
            case 'filter-yearly':
                TransactionList.setFilter('yearly');
                break;
            case 'filter-date':
                showDatePicker();
                break;
            case 'filter-date-range':
                showDateRange();
                break;
            case 'report':
                ReportGenerator.show();
                break;
            case 'sort-asc':
                TransactionList.setSortOrder('asc');
                showToast('Sort: Date Ascending');
                break;
            case 'sort-desc':
                TransactionList.setSortOrder('desc');
                showToast('Sort: Date Descending');
                break;
            case 'share-app':
                shareApp();
                break;
            case 'install-app':
                triggerInstall();
                break;
        }
    }

    // ── Date Picker ──────────────────────────────────────────

    function showDatePicker() {
        document.getElementById('filter-date-input').value = toISODate(new Date());
        document.getElementById('dialog-date-picker').classList.remove('hidden');
    }

    function showDateRange() {
        var now = new Date();
        var firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        document.getElementById('range-start-date').value = toISODate(firstOfMonth);
        document.getElementById('range-end-date').value = toISODate(now);
        document.getElementById('dialog-date-range').classList.remove('hidden');
    }

    function toISODate(d) {
        return d.getFullYear() + '-' +
            String(d.getMonth() + 1).padStart(2, '0') + '-' +
            String(d.getDate()).padStart(2, '0');
    }

    // ── Close All Dialogs ────────────────────────────────────

    function closeAllDialogs() {
        var dialogs = document.querySelectorAll('.dialog-overlay');
        dialogs.forEach(function(d) {
            d.classList.add('hidden');
        });

        // If form is visible, go back
        if (!document.getElementById('view-transaction-form').classList.contains('hidden')) {
            TransactionForm.hide();
        }

        // If settings is visible, go back
        if (!document.getElementById('view-settings').classList.contains('hidden')) {
            SettingsManager.hide();
        }

        closeSidebar();
    }

    // ── Dark Mode ────────────────────────────────────────────

    function applyDarkMode(enabled) {
        document.documentElement.setAttribute('data-theme', enabled ? 'dark' : 'light');
    }

    // ── Toast ────────────────────────────────────────────────

    var toastTimer = null;

    function showToast(message) {
        var toast = document.getElementById('toast');
        toast.textContent = message;
        toast.classList.remove('hidden');

        if (toastTimer) clearTimeout(toastTimer);
        toastTimer = setTimeout(function() {
            toast.classList.add('hidden');
        }, 2500);
    }

    // ── Confirm Dialog ───────────────────────────────────────

    function showConfirm(message, callback) {
        document.getElementById('confirm-message').textContent = message;
        confirmCallback = callback;
        document.getElementById('dialog-confirm').classList.remove('hidden');
    }

    // ── Account State ────────────────────────────────────────

    function getCurrentAccountId() {
        return currentAccountId;
    }

    function setCurrentAccountId(id) {
        currentAccountId = id;
    }

    function getCurrency() {
        var el = document.getElementById('settings-currency');
        return el ? el.value || APP_CONFIG.CURRENCY_SYMBOL : APP_CONFIG.CURRENCY_SYMBOL;
    }

    // ── Service Worker ───────────────────────────────────────

    function registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('./sw.js')
                .then(function(registration) {
                    console.log('Service Worker registered:', registration.scope);
                })
                .catch(function(error) {
                    console.warn('Service Worker registration failed:', error);
                });
        }
    }

    // ── PWA Install Prompt ───────────────────────────────────────

    var deferredInstallPrompt = null;
    var PWA_DISMISSED_KEY = 'fibbl_pwa_dismissed';

    function initPWA() {
        // Intercept Chrome/Edge install prompt
        window.addEventListener('beforeinstallprompt', function(e) {
            e.preventDefault();
            deferredInstallPrompt = e;

            // Show banner after 3 seconds if not dismissed recently
            var dismissedAt = parseInt(localStorage.getItem(PWA_DISMISSED_KEY) || '0');
            var daysSince = (Date.now() - dismissedAt) / (1000 * 60 * 60 * 24);

            if (daysSince > 7) {
                setTimeout(showInstallBanner, 3000);
            }
        });

        // Hide banner once installed
        window.addEventListener('appinstalled', function() {
            hideInstallBanner();
            deferredInstallPrompt = null;
            showToast('Fibbl installed successfully!');
        });

        // Wire banner buttons
        var installBtn = document.getElementById('pwa-install-btn');
        if (installBtn) installBtn.addEventListener('click', triggerInstall);

        var dismissBtn = document.getElementById('pwa-dismiss-btn');
        if (dismissBtn) dismissBtn.addEventListener('click', function() {
            hideInstallBanner();
            localStorage.setItem(PWA_DISMISSED_KEY, Date.now().toString());
        });

        // iOS tip
        var iosTipClose = document.getElementById('ios-tip-close');
        var iosTipDone = document.getElementById('ios-tip-done');
        if (iosTipClose) iosTipClose.addEventListener('click', hideIOSTip);
        if (iosTipDone) iosTipDone.addEventListener('click', function() {
            hideIOSTip();
            localStorage.setItem(PWA_DISMISSED_KEY, Date.now().toString());
        });

        // Show iOS tip if on iOS Safari and not installed
        if (isIOS() && !isStandalone()) {
            var dismissedAt = parseInt(localStorage.getItem(PWA_DISMISSED_KEY) || '0');
            var daysSince = (Date.now() - dismissedAt) / (1000 * 60 * 60 * 24);
            if (daysSince > 7) {
                setTimeout(showIOSTip, 4000);
            }
        }
    }

    function showInstallBanner() {
        var banner = document.getElementById('pwa-install-banner');
        if (banner) banner.classList.remove('hidden');
    }

    function hideInstallBanner() {
        var banner = document.getElementById('pwa-install-banner');
        if (banner) banner.classList.add('hidden');
    }

    function showIOSTip() {
        var tip = document.getElementById('ios-install-tip');
        if (tip) tip.classList.remove('hidden');
    }

    function hideIOSTip() {
        var tip = document.getElementById('ios-install-tip');
        if (tip) tip.classList.add('hidden');
    }

    function triggerInstall() {
        if (deferredInstallPrompt) {
            deferredInstallPrompt.prompt();
            deferredInstallPrompt.userChoice.then(function(result) {
                if (result.outcome === 'accepted') {
                    showToast('Installing Fibbl...');
                } else {
                    showToast('Installation cancelled.');
                    localStorage.setItem(PWA_DISMISSED_KEY, Date.now().toString());
                }
                deferredInstallPrompt = null;
                hideInstallBanner();
            });
        } else if (isIOS()) {
            showIOSTip();
        } else {
            showToast('App is already installed or use Chrome/Edge to install.');
        }
    }

    function isIOS() {
        return /iphone|ipad|ipod/i.test(navigator.userAgent) ||
               (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    }

    function isStandalone() {
        return window.matchMedia('(display-mode: standalone)').matches ||
               window.navigator.standalone === true;
    }

    // ── Web Share ────────────────────────────────────────────────

    function shareApp() {
        var shareData = {
            title: 'Fibbl — Smart Cash Book',
            text: 'Manage daily income & expenses offline. Free, no ads, no login needed!',
            url: window.location.href
        };

        if (navigator.share) {
            navigator.share(shareData)
                .then(function() { showToast('Thanks for sharing!'); })
                .catch(function(err) {
                    if (err.name !== 'AbortError') {
                        copyToClipboard(window.location.href);
                    }
                });
        } else {
            copyToClipboard(window.location.href);
        }
    }

    function copyToClipboard(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text)
                .then(function() { showToast('Link copied to clipboard!'); })
                .catch(function() { fallbackCopy(text); });
        } else {
            fallbackCopy(text);
        }
    }

    function fallbackCopy(text) {
        var el = document.createElement('textarea');
        el.value = text;
        el.style.position = 'fixed';
        el.style.opacity = '0';
        document.body.appendChild(el);
        el.select();
        try { document.execCommand('copy'); showToast('Link copied!'); }
        catch(e) { showToast('Copy failed. Share manually.'); }
        document.body.removeChild(el);
    }

    return {
        init: init,
        getCurrentAccountId: getCurrentAccountId,
        setCurrentAccountId: setCurrentAccountId,
        getCurrency: getCurrency,
        applyDarkMode: applyDarkMode,
        showToast: showToast,
        showConfirm: showConfirm,
        openSidebar: openSidebar,
        closeSidebar: closeSidebar,
        showTransactionView: showTransactionView,
        showImportView: showImportView
    };
})();

// ── Bootstrap ────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function() {
    App.init();
});
