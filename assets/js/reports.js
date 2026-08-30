/**
 * Fibbl – Reports Module
 * Generates PDF and Excel reports from transaction data.
 * Uses client-side generation — no backend needed.
 */
const ReportGenerator = (() => {

    let useAllData = true;

    // ── Show Report Dialog ───────────────────────────────────

    function show() {
        // Set defaults
        useAllData = true;
        document.getElementById('report-all-btn').classList.add('active');
        document.getElementById('report-range-btn').classList.remove('active');
        document.getElementById('report-dates').classList.add('hidden');

        // Set default dates
        var now = new Date();
        var firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        document.getElementById('report-start-date').value = toISODate(firstOfMonth);
        document.getElementById('report-end-date').value = toISODate(now);

        // Default to PDF
        var radios = document.querySelectorAll('input[name="report-format"]');
        radios[0].checked = true;

        document.getElementById('dialog-report').classList.remove('hidden');
    }

    function hide() {
        document.getElementById('dialog-report').classList.add('hidden');
    }

    function toISODate(d) {
        return d.getFullYear() + '-' +
            String(d.getMonth() + 1).padStart(2, '0') + '-' +
            String(d.getDate()).padStart(2, '0');
    }

    // ── Get Transactions for Report ──────────────────────────

    async function getReportData() {
        var accountId = App.getCurrentAccountId();
        if (!accountId) return { transactions: [], account: null };

        var account = await Repository.accounts.getById(accountId);
        var transactions;

        if (useAllData) {
            transactions = await TransactionList.getFilteredTransactions();
        } else {
            var start = document.getElementById('report-start-date').value;
            var end = document.getElementById('report-end-date').value;

            if (!start || !end) {
                App.showToast('Please select start and end dates');
                return null;
            }

            transactions = await TransactionList.getTransactionsByRange(start, end);
        }

        return { transactions: transactions, account: account };
    }

    // ── Generate PDF ─────────────────────────────────────────

    async function generatePDF() {
        var data = await getReportData();
        if (!data) return;

        var transactions = data.transactions;
        var account = data.account;
        var currency = App.getCurrency();

        // Build HTML for print
        var totalIn = 0, totalOut = 0;
        var rows = '';

        for (var i = 0; i < transactions.length; i++) {
            var t = transactions[i];
            var isIn = t.type === 'cashIn';
            if (isIn) totalIn += t.amount;
            else totalOut += t.amount;

            rows += '<tr>' +
                '<td>' + (i + 1) + '</td>' +
                '<td>' + formatReportDate(t.date) + '</td>' +
                '<td>' + escapeHtml(t.description || t.category || '') + '</td>' +
                '<td style="color:green;text-align:right">' + (isIn ? currency + ' ' + formatNum(t.amount) : '') + '</td>' +
                '<td style="color:red;text-align:right">' + (!isIn ? currency + ' ' + formatNum(t.amount) : '') + '</td>' +
                '</tr>';
        }

        var balance = totalIn - totalOut;
        var openingBalance = account ? (account.openingBalance || 0) : 0;
        var totalBalance = openingBalance + balance;

        var html = '<!DOCTYPE html><html><head><meta charset="utf-8">' +
            '<title>Fibbl Report - ' + (account ? account.name : 'Cash Book') + '</title>' +
            '<style>' +
            'body { font-family: Arial, sans-serif; font-size: 12px; margin: 20px; }' +
            'h1 { font-size: 18px; color: #2196F3; margin-bottom: 4px; }' +
            'h2 { font-size: 14px; color: #666; margin-bottom: 16px; font-weight: normal; }' +
            'table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }' +
            'th { background: #2196F3; color: white; padding: 8px; text-align: left; font-size: 12px; }' +
            'td { padding: 6px 8px; border-bottom: 1px solid #eee; font-size: 11px; }' +
            'tr:nth-child(even) { background: #f9f9f9; }' +
            '.summary { margin-top: 12px; }' +
            '.summary td { font-weight: bold; border-top: 2px solid #333; }' +
            '.footer { margin-top: 20px; font-size: 10px; color: #999; }' +
            '</style></head><body>' +
            '<h1>Fibbl Cash Book Report</h1>' +
            '<h2>Account: ' + escapeHtml(account ? account.name : 'Cash Book') + '</h2>' +
            '<table>' +
            '<thead><tr>' +
            '<th>#</th><th>Date</th><th>Description</th>' +
            '<th style="text-align:right">Cash In</th>' +
            '<th style="text-align:right">Cash Out</th>' +
            '</tr></thead>' +
            '<tbody>' + rows + '</tbody>' +
            '<tfoot class="summary">' +
            '<tr>' +
            '<td colspan="3">Total</td>' +
            '<td style="color:green;text-align:right">' + currency + ' ' + formatNum(totalIn) + '</td>' +
            '<td style="color:red;text-align:right">' + currency + ' ' + formatNum(totalOut) + '</td>' +
            '</tr>' +
            '<tr><td colspan="3">Balance</td><td colspan="2" style="text-align:right">' + currency + ' ' + formatNum(balance) + '</td></tr>' +
            '<tr><td colspan="3">Opening Balance</td><td colspan="2" style="text-align:right">' + currency + ' ' + formatNum(openingBalance) + '</td></tr>' +
            '<tr><td colspan="3"><strong>Total Balance</strong></td><td colspan="2" style="text-align:right"><strong>' + currency + ' ' + formatNum(totalBalance) + '</strong></td></tr>' +
            '</tfoot></table>' +
            '<div class="footer">Generated by Fibbl Cash Book on ' + new Date().toLocaleDateString() + '</div>' +
            '</body></html>';

        // Open in new window for printing (Save as PDF)
        var win = window.open('', '_blank');
        if (win) {
            win.document.write(html);
            win.document.close();
            setTimeout(function() { win.print(); }, 500);
        } else {
            // Fallback: download as HTML
            downloadFile(html, 'Fibbl_Report_' + toISODate(new Date()) + '.html', 'text/html');
        }

        App.showToast('Report generated');
    }

    // ── Generate Excel ───────────────────────────────────────

    async function generateExcel() {
        var data = await getReportData();
        if (!data) return;

        var transactions = data.transactions;
        var account = data.account;
        var currency = App.getCurrency();

        var totalIn = 0, totalOut = 0;
        var rows = '';

        for (var i = 0; i < transactions.length; i++) {
            var t = transactions[i];
            var isIn = t.type === 'cashIn';
            if (isIn) totalIn += t.amount;
            else totalOut += t.amount;

            rows += '<tr>' +
                '<td>' + (i + 1) + '</td>' +
                '<td>' + formatReportDate(t.date) + '</td>' +
                '<td>' + escapeHtml(t.description || t.category || '') + '</td>' +
                '<td>' + escapeHtml(t.category || '') + '</td>' +
                '<td>' + (isIn ? t.amount : '') + '</td>' +
                '<td>' + (!isIn ? t.amount : '') + '</td>' +
                '</tr>';
        }

        var balance = totalIn - totalOut;
        var openingBalance = account ? (account.openingBalance || 0) : 0;

        // Generate Excel-compatible HTML table
        var html = '<html xmlns:o="urn:schemas-microsoft-com:office:office" ' +
            'xmlns:x="urn:schemas-microsoft-com:office:spreadsheet" ' +
            'xmlns="http://www.w3.org/TR/REC-html40">' +
            '<head><meta charset="utf-8">' +
            '<style>' +
            'table { border-collapse: collapse; }' +
            'th { background: #2196F3; color: white; padding: 8px; font-weight: bold; }' +
            'td { padding: 6px; border: 1px solid #ddd; }' +
            '.number { mso-number-format:"\\#\\,\\#\\#0\\.00"; }' +
            '</style></head><body>' +
            '<table>' +
            '<tr><th colspan="6">' + escapeHtml(account ? account.name : 'Cash Book') + ' - Report</th></tr>' +
            '<tr><th>#</th><th>Date</th><th>Description</th><th>Category</th><th>Cash In (' + currency + ')</th><th>Cash Out (' + currency + ')</th></tr>' +
            rows +
            '<tr><td colspan="4"><strong>Total</strong></td><td class="number"><strong>' + totalIn + '</strong></td><td class="number"><strong>' + totalOut + '</strong></td></tr>' +
            '<tr><td colspan="4"><strong>Balance</strong></td><td colspan="2" class="number"><strong>' + balance + '</strong></td></tr>' +
            '<tr><td colspan="4"><strong>Opening Balance</strong></td><td colspan="2" class="number"><strong>' + openingBalance + '</strong></td></tr>' +
            '<tr><td colspan="4"><strong>Total Balance</strong></td><td colspan="2" class="number"><strong>' + (openingBalance + balance) + '</strong></td></tr>' +
            '</table></body></html>';

        var filename = 'Fibbl_Report_' + toISODate(new Date()) + '.xls';
        downloadFile(html, filename, 'application/vnd.ms-excel');
        App.showToast('Excel report downloaded');
    }

    // ── Helpers ──────────────────────────────────────────────

    function formatReportDate(dateStr) {
        if (!dateStr) return '';
        var d = new Date(dateStr);
        var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear();
    }

    function formatNum(n) {
        return Number(n).toLocaleString('en-IN');
    }

    function escapeHtml(str) {
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function downloadFile(content, filename, mimeType) {
        var blob = new Blob([content], { type: mimeType + ';charset=utf-8' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // ── Generate ─────────────────────────────────────────────

    async function generate() {
        var format = document.querySelector('input[name="report-format"]:checked').value;

        hide();

        if (format === 'pdf') {
            await generatePDF();
        } else {
            await generateExcel();
        }
    }

    // ── Init ─────────────────────────────────────────────────

    function init() {
        // Report toggle tabs
        document.getElementById('report-all-btn').addEventListener('click', function() {
            useAllData = true;
            this.classList.add('active');
            document.getElementById('report-range-btn').classList.remove('active');
            document.getElementById('report-dates').classList.add('hidden');
        });

        document.getElementById('report-range-btn').addEventListener('click', function() {
            useAllData = false;
            this.classList.add('active');
            document.getElementById('report-all-btn').classList.remove('active');
            document.getElementById('report-dates').classList.remove('hidden');
        });

        // OK button
        document.getElementById('btn-report-ok').addEventListener('click', generate);

        // Close on overlay click
        document.getElementById('dialog-report').addEventListener('click', function(e) {
            if (e.target === this) hide();
        });
    }

    return {
        show: show,
        hide: hide,
        init: init
    };
})();
