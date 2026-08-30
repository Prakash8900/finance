/**
 * Fibbl – Transactions Module
 * Handles the main transaction list view: rendering, filtering, sorting, date navigation.
 */
const TransactionList = (() => {

    // ── State ────────────────────────────────────────────────
    let currentFilter = 'all';     // all | daily | weekly | monthly | yearly | date | dateRange
    let currentDate = new Date();  // Reference date for navigation
    let sortOrder = 'desc';        // desc | asc
    let searchKeyword = '';
    let dateRangeStart = '';
    let dateRangeEnd = '';

    // ── Helpers ──────────────────────────────────────────────

    function formatAmount(n) {
        if (n === undefined || n === null) return '0';
        return Number(n).toLocaleString('en-IN');
    }

    function formatDate(dateStr, timeStr) {
        if (!dateStr) return '';
        var d = new Date(dateStr + 'T' + (timeStr || '12:00'));
        var days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

        var day = days[d.getDay()];
        var dd = String(d.getDate()).padStart(2, '0');
        var mon = months[d.getMonth()];
        var yyyy = d.getFullYear();

        var hh = d.getHours();
        var mm = String(d.getMinutes()).padStart(2, '0');
        var ampm = hh >= 12 ? 'PM' : 'AM';
        hh = hh % 12 || 12;
        hh = String(hh).padStart(2, '0');

        return day + ', ' + dd + ' ' + mon + ' ' + yyyy + ' ' + hh + ':' + mm + ' ' + ampm;
    }

    function toISODate(d) {
        return d.getFullYear() + '-' +
            String(d.getMonth() + 1).padStart(2, '0') + '-' +
            String(d.getDate()).padStart(2, '0');
    }

    function startOfWeek(d) {
        var day = d.getDay();
        var diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday start
        return new Date(d.getFullYear(), d.getMonth(), diff);
    }

    function endOfWeek(d) {
        var s = startOfWeek(d);
        return new Date(s.getFullYear(), s.getMonth(), s.getDate() + 6);
    }

    // ── Date Label ───────────────────────────────────────────

    function getDateLabel() {
        var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        var d = currentDate;

        switch (currentFilter) {
            case 'all':
                return 'All';
            case 'daily':
                var today = new Date();
                if (toISODate(d) === toISODate(today)) return 'Today';
                return d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear();
            case 'weekly':
                var ws = startOfWeek(d);
                var we = endOfWeek(d);
                return ws.getDate() + ' ' + months[ws.getMonth()] + ' - ' +
                       we.getDate() + ' ' + months[we.getMonth()] + ' ' + we.getFullYear();
            case 'monthly':
                return months[d.getMonth()] + ' ' + d.getFullYear();
            case 'yearly':
                return String(d.getFullYear());
            case 'date':
                return d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear();
            case 'dateRange':
                if (dateRangeStart && dateRangeEnd) {
                    var s = new Date(dateRangeStart);
                    var e = new Date(dateRangeEnd);
                    return s.getDate() + ' ' + months[s.getMonth()] + ' - ' +
                           e.getDate() + ' ' + months[e.getMonth()] + ' ' + e.getFullYear();
                }
                return 'Custom Range';
            default:
                return 'All';
        }
    }

    // ── Filter Transactions ──────────────────────────────────

    function filterTransactions(transactions) {
        var d = currentDate;
        var filtered;

        switch (currentFilter) {
            case 'daily':
                var target = toISODate(d);
                filtered = transactions.filter(function(t) { return t.date === target; });
                break;

            case 'weekly':
                var ws = toISODate(startOfWeek(d));
                var we = toISODate(endOfWeek(d));
                filtered = transactions.filter(function(t) {
                    return t.date >= ws && t.date <= we;
                });
                break;

            case 'monthly':
                var monthPrefix = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
                filtered = transactions.filter(function(t) {
                    return t.date && t.date.startsWith(monthPrefix);
                });
                break;

            case 'yearly':
                var yearPrefix = String(d.getFullYear());
                filtered = transactions.filter(function(t) {
                    return t.date && t.date.startsWith(yearPrefix);
                });
                break;

            case 'date':
                var specificDate = toISODate(d);
                filtered = transactions.filter(function(t) { return t.date === specificDate; });
                break;

            case 'dateRange':
                filtered = transactions.filter(function(t) {
                    return t.date >= dateRangeStart && t.date <= dateRangeEnd;
                });
                break;

            default: // 'all'
                filtered = transactions.slice();
        }

        // Apply keyword search
        if (searchKeyword) {
            var kw = searchKeyword.toLowerCase();
            filtered = filtered.filter(function(t) {
                return (t.description && t.description.toLowerCase().indexOf(kw) !== -1) ||
                       (t.category && t.category.toLowerCase().indexOf(kw) !== -1);
            });
        }

        return filtered;
    }

    // ── Sort ─────────────────────────────────────────────────

    function sortTransactions(transactions) {
        return transactions.sort(function(a, b) {
            var dateA = a.date + (a.time || '00:00');
            var dateB = b.date + (b.time || '00:00');
            return sortOrder === 'desc' ? dateB.localeCompare(dateA) : dateA.localeCompare(dateB);
        });
    }

    // ── Render ───────────────────────────────────────────────

    async function render() {
        var accountId = App.getCurrentAccountId();
        if (!accountId) return;

        var allTxns = await Repository.transactions.getByAccount(accountId);
        var filtered = filterTransactions(allTxns);
        var sorted = sortTransactions(filtered);

        var list = document.getElementById('transaction-list');
        var currency = App.getCurrency();

        if (sorted.length === 0) {
            list.innerHTML = '<div class="tx-empty">' +
                '<div class="tx-empty-icon">📒</div>' +
                '<div>No transactions found</div></div>';
        } else {
            var html = '';
            for (var i = 0; i < sorted.length; i++) {
                var t = sorted[i];
                var isIn = t.type === 'cashIn';
                var displayName = t.description || t.category || 'Transaction';
                var dtStr = formatDate(t.date, t.time);

                html += '<div class="tx-row" data-id="' + t.id + '" role="listitem">' +
                    '<div class="tx-info">' +
                        '<div class="tx-description">' + escapeHtml(displayName) + '</div>' +
                        '<div class="tx-datetime">' + dtStr + '</div>' +
                    '</div>' +
                    '<div class="tx-amount-in">' + (isIn ? formatAmount(t.amount) : '') + '</div>' +
                    '<div class="tx-amount-out">' + (!isIn ? formatAmount(t.amount) : '') + '</div>' +
                '</div>';
            }
            list.innerHTML = html;
        }

        // Update date label
        document.getElementById('date-label').textContent = getDateLabel();

        // Update summary
        updateSummary(filtered, accountId);
    }

    function escapeHtml(str) {
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // ── Summary ──────────────────────────────────────────────

    async function updateSummary(transactions, accountId) {
        var totalIn = 0;
        var totalOut = 0;

        for (var i = 0; i < transactions.length; i++) {
            if (transactions[i].type === 'cashIn') {
                totalIn += transactions[i].amount;
            } else {
                totalOut += transactions[i].amount;
            }
        }

        var balance = totalIn - totalOut;

        document.getElementById('summary-total-in').textContent = formatAmount(totalIn);
        document.getElementById('summary-total-out').textContent = formatAmount(totalOut);
        document.getElementById('summary-balance').textContent = formatAmount(balance);

        // Get opening balance for the account
        var account = await Repository.accounts.getById(accountId);
        var openingBalance = account ? (account.openingBalance || 0) : 0;
        var totalBalance = openingBalance + balance;

        document.getElementById('summary-opening-balance').textContent = formatAmount(openingBalance);
        document.getElementById('summary-total-balance').textContent = formatAmount(totalBalance);
    }

    // ── Navigation ───────────────────────────────────────────

    function navigatePrev() {
        switch (currentFilter) {
            case 'daily':
            case 'date':
                currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate() - 1);
                break;
            case 'weekly':
                currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate() - 7);
                break;
            case 'monthly':
                currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
                break;
            case 'yearly':
                currentDate = new Date(currentDate.getFullYear() - 1, 0, 1);
                break;
        }
        render();
    }

    function navigateNext() {
        switch (currentFilter) {
            case 'daily':
            case 'date':
                currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate() + 1);
                break;
            case 'weekly':
                currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate() + 7);
                break;
            case 'monthly':
                currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
                break;
            case 'yearly':
                currentDate = new Date(currentDate.getFullYear() + 1, 0, 1);
                break;
        }
        render();
    }

    // ── Public API ───────────────────────────────────────────

    function setFilter(filter) {
        currentFilter = filter;
        currentDate = new Date();
        searchKeyword = '';
        dateRangeStart = '';
        dateRangeEnd = '';

        // Update pill active state
        var pills = document.querySelectorAll('.pill');
        pills.forEach(function(p) {
            p.classList.toggle('active', p.dataset.filter === filter);
        });

        render();
    }

    function setDateFilter(date) {
        currentFilter = 'date';
        currentDate = new Date(date);

        var pills = document.querySelectorAll('.pill');
        pills.forEach(function(p) { p.classList.remove('active'); });

        render();
    }

    function setDateRange(start, end) {
        currentFilter = 'dateRange';
        dateRangeStart = start;
        dateRangeEnd = end;

        var pills = document.querySelectorAll('.pill');
        pills.forEach(function(p) { p.classList.remove('active'); });

        render();
    }

    function setSearch(keyword) {
        searchKeyword = keyword;
        render();
    }

    function clearSearch() {
        searchKeyword = '';
        render();
    }

    function setSortOrder(order) {
        sortOrder = order;
        Repository.settings.set('sortOrder', order);
        render();
    }

    function getSortOrder() {
        return sortOrder;
    }

    function getCurrentFilter() {
        return currentFilter;
    }

    async function initSortOrder() {
        var saved = await Repository.settings.get('sortOrder');
        if (saved) sortOrder = saved;
    }

    // For reports
    async function getFilteredTransactions() {
        var accountId = App.getCurrentAccountId();
        if (!accountId) return [];
        var allTxns = await Repository.transactions.getByAccount(accountId);
        var filtered = filterTransactions(allTxns);
        return sortTransactions(filtered);
    }

    async function getTransactionsByRange(start, end) {
        var accountId = App.getCurrentAccountId();
        if (!accountId) return [];
        var txns = await Repository.transactions.getByDateRange(accountId, start, end);
        return sortTransactions(txns);
    }

    return {
        render: render,
        setFilter: setFilter,
        setDateFilter: setDateFilter,
        setDateRange: setDateRange,
        setSearch: setSearch,
        clearSearch: clearSearch,
        setSortOrder: setSortOrder,
        getSortOrder: getSortOrder,
        getCurrentFilter: getCurrentFilter,
        navigatePrev: navigatePrev,
        navigateNext: navigateNext,
        initSortOrder: initSortOrder,
        getFilteredTransactions: getFilteredTransactions,
        getTransactionsByRange: getTransactionsByRange,
        formatAmount: formatAmount,
        formatDate: formatDate
    };
})();
