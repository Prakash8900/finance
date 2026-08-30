/**
 * Fibbl – Import Manager
 * UI controller for the 4-step Excel/CSV bank statement import flow.
 * Step 1: File Selection  →  Step 2: Column Mapping  →  Step 3: Preview  →  Step 4: Result
 */
const ImportManager = (() => {

    // ── State ──────────────────────────────────────────────────
    let parsedFile = null;       // result from ExcelImporter.parseFile()
    let selectedSheet = 0;       // index into parsedFile.sheets
    let sheetHeaders = [];       // string[]
    let sheetDataRows = [];      // raw string rows
    let sheetRawDataRows = [];   // raw (typed) rows for date detection
    let columnMapping = {};      // { date, description, debit, credit, balance, amount, type }
    let importRows = [];         // processed row objects
    let selectedAccountId = null;
    let currentStep = 1;

    // ── Helpers ────────────────────────────────────────────────

    function escHtml(str) {
        if (str === null || str === undefined) return '';
        var d = document.createElement('div');
        d.textContent = String(str);
        return d.innerHTML;
    }

    function formatFileSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    function formatCurrency(amount) {
        var currency = App.getCurrency();
        if (!amount || isNaN(amount)) return '';
        return currency + Number(amount).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    }

    function showStep(n) {
        currentStep = n;
        document.querySelectorAll('.import-step').forEach(function(el) {
            el.classList.add('hidden');
        });
        var el = document.getElementById('import-step-' + n);
        if (el) el.classList.remove('hidden');

        // Update progress step indicators
        var steps = document.querySelectorAll('.import-progress-step');
        steps.forEach(function(s, i) {
            s.classList.toggle('active', i + 1 === n);
            s.classList.toggle('done', i + 1 < n);
        });
    }

    function setProgress(show, pct, text) {
        var bar = document.getElementById('import-progress-bar');
        var wrap = document.getElementById('import-progress-wrap');
        if (!wrap) return;
        if (!show) { wrap.classList.add('hidden'); return; }
        wrap.classList.remove('hidden');
        bar.style.width = pct + '%';
        var label = document.getElementById('import-progress-label');
        if (label) label.textContent = text || '';
    }

    // ── Step 1: File Selection ─────────────────────────────────

    function setupDropZone() {
        var dropZone = document.getElementById('import-drop-zone');
        var fileInput = document.getElementById('excel-file-input');

        if (!dropZone || !fileInput) return;

        dropZone.addEventListener('click', function() { fileInput.click(); });

        dropZone.addEventListener('dragover', function(e) {
            e.preventDefault();
            dropZone.classList.add('dragging');
        });

        dropZone.addEventListener('dragleave', function() {
            dropZone.classList.remove('dragging');
        });

        dropZone.addEventListener('drop', function(e) {
            e.preventDefault();
            dropZone.classList.remove('dragging');
            var files = e.dataTransfer.files;
            if (files && files[0]) handleFileSelected(files[0]);
        });

        fileInput.addEventListener('change', function(e) {
            if (e.target.files && e.target.files[0]) {
                handleFileSelected(e.target.files[0]);
                e.target.value = '';
            }
        });
    }

    async function handleFileSelected(file) {
        var info = document.getElementById('import-file-info');
        var errEl = document.getElementById('import-step1-error');
        errEl.classList.add('hidden');
        info.classList.add('hidden');

        setProgress(true, 20, 'Reading file…');

        try {
            parsedFile = await ExcelImporter.parseFile(file);
            setProgress(true, 60, 'Parsing sheets…');

            // Show file info
            document.getElementById('import-file-name').textContent = escHtml(parsedFile.fileName);
            document.getElementById('import-file-size').textContent = formatFileSize(parsedFile.fileSize);
            document.getElementById('import-sheet-count').textContent = parsedFile.sheetNames.length;
            info.classList.remove('hidden');

            // Populate sheet selector
            var sheetSel = document.getElementById('import-sheet-select');
            sheetSel.innerHTML = '';
            parsedFile.sheetNames.forEach(function(name, i) {
                var opt = document.createElement('option');
                opt.value = i;
                opt.textContent = name;
                sheetSel.appendChild(opt);
            });

            var sheetRow = document.getElementById('import-sheet-row');
            sheetRow.classList.toggle('hidden', parsedFile.sheetNames.length <= 1);

            selectedSheet = 0;
            setProgress(true, 100, 'Done');
            setTimeout(function() { setProgress(false); }, 500);

            document.getElementById('import-step1-next').disabled = false;

        } catch (err) {
            setProgress(false);
            errEl.textContent = err.message || 'Failed to read file.';
            errEl.classList.remove('hidden');
            parsedFile = null;
            document.getElementById('import-step1-next').disabled = true;
        }
    }

    function proceedToMapping() {
        if (!parsedFile) return;

        selectedSheet = parseInt(document.getElementById('import-sheet-select').value) || 0;
        var sheet = parsedFile.sheets[selectedSheet];
        var extracted = ExcelImporter.extractHeadersAndRows(sheet);

        sheetHeaders = extracted.headers;
        sheetDataRows = extracted.dataRows;
        sheetRawDataRows = extracted.rawDataRows;

        if (sheetHeaders.length === 0) {
            App.showToast('The selected sheet appears to be empty.');
            return;
        }

        columnMapping = ExcelImporter.detectColumns(sheetHeaders);
        buildMappingUI();
        showStep(2);
    }

    // ── Step 2: Column Mapping ─────────────────────────────────

    function buildMappingUI() {
        buildHeaderDropdown('map-date', columnMapping.date);
        buildHeaderDropdown('map-description', columnMapping.description);
        buildHeaderDropdown('map-debit', columnMapping.debit);
        buildHeaderDropdown('map-credit', columnMapping.credit);
        buildHeaderDropdown('map-balance', columnMapping.balance);
        buildHeaderDropdown('map-amount', columnMapping.amount);
        buildHeaderDropdown('map-type', columnMapping.type);
        buildAccountDropdown();

        // Show/hide FORMAT D fields based on whether amount/type detected
        updateFormatDVisibility();
        document.getElementById('map-amount').addEventListener('change', updateFormatDVisibility);
        document.getElementById('map-type').addEventListener('change', updateFormatDVisibility);
        document.getElementById('map-debit').addEventListener('change', updateFormatDVisibility);
        document.getElementById('map-credit').addEventListener('change', updateFormatDVisibility);
    }

    function buildHeaderDropdown(selectId, selectedValue) {
        var sel = document.getElementById(selectId);
        if (!sel) return;

        // Save current selection if user already changed it
        var currentVal = sel.value !== '' ? sel.value : (selectedValue || '');

        sel.innerHTML = '<option value="">— Not mapped —</option>';
        sheetHeaders.forEach(function(h) {
            if (!h || String(h).trim() === '') return;
            var opt = document.createElement('option');
            opt.value = h;
            opt.textContent = h;
            if (h === currentVal) opt.selected = true;
            sel.appendChild(opt);
        });

        if (currentVal && sel.value === '') {
            // Try to re-select
            sel.value = currentVal;
        }
    }

    async function buildAccountDropdown() {
        var sel = document.getElementById('map-account');
        if (!sel) return;

        try {
            var accounts = await Repository.accounts.getActive();
            sel.innerHTML = '<option value="">— Select Account —</option>';
            accounts.forEach(function(acc) {
                var opt = document.createElement('option');
                opt.value = acc.id;
                opt.textContent = acc.name;
                if (acc.id === App.getCurrentAccountId()) opt.selected = true;
                sel.appendChild(opt);
            });
            selectedAccountId = App.getCurrentAccountId();
        } catch (e) {
            sel.innerHTML = '<option value="">Error loading accounts</option>';
        }
    }

    function updateFormatDVisibility() {
        var debitVal = document.getElementById('map-debit').value;
        var creditVal = document.getElementById('map-credit').value;
        var amountVal = document.getElementById('map-amount').value;
        var typeVal = document.getElementById('map-type').value;

        // Show FORMAT D rows only if neither debit nor credit is mapped, or if amount/type are detected
        var showFormatD = (!debitVal && !creditVal) || amountVal || typeVal;
        var rowAmount = document.getElementById('map-format-d-amount-row');
        var rowType = document.getElementById('map-format-d-type-row');
        if (rowAmount) rowAmount.classList.toggle('hidden', !showFormatD);
        if (rowType) rowType.classList.toggle('hidden', !showFormatD);
    }

    function readMappingFromUI() {
        return {
            date: document.getElementById('map-date').value || null,
            description: document.getElementById('map-description').value || null,
            debit: document.getElementById('map-debit').value || null,
            credit: document.getElementById('map-credit').value || null,
            balance: document.getElementById('map-balance').value || null,
            amount: document.getElementById('map-amount').value || null,
            type: document.getElementById('map-type').value || null
        };
    }

    function validateMapping(mapping, accountId) {
        if (!accountId) return 'Please select an account.';
        if (!mapping.date) return 'Please map the Date column.';
        if (!mapping.description) return 'Please map the Description column.';
        var hasAmount = mapping.debit || mapping.credit || (mapping.amount && mapping.type);
        if (!hasAmount) {
            return 'Please map at least one amount column (Debit, Credit, or Amount + Type).';
        }
        return null;
    }

    async function proceedToPreview() {
        columnMapping = readMappingFromUI();
        selectedAccountId = parseInt(document.getElementById('map-account').value) || null;

        var err = validateMapping(columnMapping, selectedAccountId);
        var errEl = document.getElementById('import-step2-error');
        if (err) {
            errEl.textContent = err;
            errEl.classList.remove('hidden');
            return;
        }
        errEl.classList.add('hidden');

        setProgress(true, 10, 'Processing rows…');

        try {
            // Process rows in chunks to avoid UI freeze on large files
            importRows = await processRowsAsync(sheetHeaders, sheetDataRows, sheetRawDataRows, columnMapping, selectedAccountId);

            setProgress(true, 60, 'Checking duplicates…');

            // Fetch existing transactions for duplicate detection
            var existing = await Repository.transactions.getByAccount(selectedAccountId);
            importRows = ExcelImporter.detectDuplicates(importRows, existing);

            setProgress(true, 90, 'Building preview…');

            renderPreviewTable();
            updatePreviewStats();

            setProgress(true, 100, 'Ready');
            setTimeout(function() { setProgress(false); }, 400);

            showStep(3);
        } catch (e) {
            setProgress(false);
            console.error('Preview error:', e);
            App.showToast('Error processing rows: ' + e.message);
        }
    }

    async function processRowsAsync(headers, dataRows, rawDataRows, mapping, accountId) {
        return new Promise(function(resolve) {
            // Use setTimeout to yield to browser for large files
            setTimeout(function() {
                var rows = ExcelImporter.processRows(headers, dataRows, rawDataRows, mapping, accountId);
                resolve(rows);
            }, 0);
        });
    }

    // ── Step 3: Preview ────────────────────────────────────────

    function renderPreviewTable() {
        var tbody = document.getElementById('import-preview-tbody');
        if (!tbody) return;

        if (importRows.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="import-no-rows">No data rows found in the selected sheet.</td></tr>';
            return;
        }

        var currency = App.getCurrency();
        var html = '';

        for (var i = 0; i < importRows.length; i++) {
            var row = importRows[i];
            var statusClass = row.status === 'ready' ? 'status-ready' :
                              row.status === 'duplicate' ? 'status-duplicate' :
                              'status-invalid';
            var statusLabel = row.status === 'ready' ? 'Ready' :
                              row.status === 'duplicate' ? 'Duplicate' :
                              'Invalid';

            var cashIn = (row.type === 'cashIn' && row.amount > 0) ? currency + Number(row.amount).toLocaleString('en-IN') : '';
            var cashOut = (row.type === 'cashOut' && row.amount > 0) ? currency + Number(row.amount).toLocaleString('en-IN') : '';

            var checked = row.selected ? 'checked' : '';
            var disabled = row.status === 'invalid' ? 'disabled' : '';
            var rowClass = row.status === 'invalid' ? 'import-row-invalid' : (row.status === 'duplicate' ? 'import-row-duplicate' : '');

            html += '<tr class="' + rowClass + '" data-idx="' + i + '">' +
                '<td class="import-col-check"><input type="checkbox" class="import-row-checkbox" data-idx="' + i + '" ' + checked + ' ' + disabled + '></td>' +
                '<td class="import-col-date">' + escHtml(row.date || row.dateRaw || '') + '</td>' +
                '<td class="import-col-desc">' + escHtml(row.description) + '</td>' +
                '<td class="import-col-in">' + escHtml(cashIn) + '</td>' +
                '<td class="import-col-out">' + escHtml(cashOut) + '</td>' +
                '<td class="import-col-cat">' +
                    '<select class="import-cat-select" data-idx="' + i + '">' +
                    buildCategoryOptions(row.category, row.type) +
                    '</select>' +
                '</td>' +
                '<td class="import-col-status"><span class="import-status-badge ' + statusClass + '">' + statusLabel + '</span>' +
                (row.statusMsg && row.status !== 'ready' ? '<span class="import-status-msg">' + escHtml(row.statusMsg) + '</span>' : '') +
                '</td>' +
            '</tr>';
        }

        tbody.innerHTML = html;

        // Bind checkbox events
        tbody.querySelectorAll('.import-row-checkbox').forEach(function(cb) {
            cb.addEventListener('change', function() {
                var idx = parseInt(this.dataset.idx);
                importRows[idx].selected = this.checked;
                updatePreviewStats();
            });
        });

        // Bind category change events
        tbody.querySelectorAll('.import-cat-select').forEach(function(sel) {
            sel.addEventListener('change', function() {
                var idx = parseInt(this.dataset.idx);
                importRows[idx].category = this.value;
            });
        });
    }

    var PRESET_CATEGORIES = [
        'Salary', 'Business', 'Investment', 'Interest', 'Gift Received',
        'Other Income', 'Food', 'Grocery', 'Transport', 'Utilities',
        'Electricity', 'Rent', 'Shopping', 'Entertainment', 'Health',
        'Education', 'Loan/EMI', 'Insurance', 'Tax', 'Cash Withdrawal',
        'UPI', 'Transfer', 'Uncategorized', 'Other Expense'
    ];

    function buildCategoryOptions(selected, type) {
        // Filter categories roughly by type
        var cats = PRESET_CATEGORIES;
        var html = '';
        cats.forEach(function(c) {
            var sel = (c === selected || (!selected && c === 'Uncategorized')) ? 'selected' : '';
            html += '<option value="' + escHtml(c) + '" ' + sel + '>' + escHtml(c) + '</option>';
        });
        // Add the auto-detected one if not in list
        if (selected && PRESET_CATEGORIES.indexOf(selected) === -1) {
            html = '<option value="' + escHtml(selected) + '" selected>' + escHtml(selected) + '</option>' + html;
        }
        return html;
    }

    function updatePreviewStats() {
        var total = importRows.length;
        var valid = importRows.filter(function(r) { return r.status === 'ready'; }).length;
        var invalid = importRows.filter(function(r) { return r.status === 'invalid'; }).length;
        var dupes = importRows.filter(function(r) { return r.status === 'duplicate'; }).length;
        var selected = importRows.filter(function(r) { return r.selected; }).length;

        document.getElementById('preview-stat-total').textContent = total;
        document.getElementById('preview-stat-valid').textContent = valid;
        document.getElementById('preview-stat-invalid').textContent = invalid;
        document.getElementById('preview-stat-dupes').textContent = dupes;
        document.getElementById('preview-stat-selected').textContent = selected;

        document.getElementById('import-btn-import').disabled = selected === 0;
    }

    function selectAllRows() {
        importRows.forEach(function(row) {
            if (row.status !== 'invalid') row.selected = true;
        });
        document.querySelectorAll('.import-row-checkbox:not(:disabled)').forEach(function(cb) {
            cb.checked = true;
        });
        updatePreviewStats();
    }

    function deselectAllRows() {
        importRows.forEach(function(row) { row.selected = false; });
        document.querySelectorAll('.import-row-checkbox').forEach(function(cb) {
            cb.checked = false;
        });
        updatePreviewStats();
    }

    // ── Step 4: Import ─────────────────────────────────────────

    async function doImport() {
        var selectedRows = importRows.filter(function(row) { return row.selected && row.status !== 'invalid'; });

        if (selectedRows.length === 0) {
            App.showToast('No valid rows selected for import.');
            return;
        }

        var btn = document.getElementById('import-btn-import');
        btn.disabled = true;
        btn.textContent = 'Importing…';

        setProgress(true, 20, 'Preparing ' + selectedRows.length + ' transactions…');

        try {
            // Yield to browser so progress bar renders
            await new Promise(function(resolve) { setTimeout(resolve, 50); });

            setProgress(true, 50, 'Writing to database…');

            // Bulk insert in a single IndexedDB transaction
            var result = await Repository.transactions.bulkCreate(selectedRows);

            setProgress(true, 100, 'Complete');
            setTimeout(function() { setProgress(false); }, 400);

            var imported = result.inserted;
            var errors = result.errors;
            var notSelected = importRows.filter(function(r) { return !r.selected; }).length;
            var skipped = notSelected;
            var dupeCount = importRows.filter(function(r) { return r.status === 'duplicate'; }).length;

            showResult(imported, skipped, errors, dupeCount);

            // Refresh the transaction list immediately
            if (typeof App !== 'undefined' && App.getCurrentAccountId) {
                // Switch to the imported account if different
                if (selectedAccountId !== App.getCurrentAccountId()) {
                    App.setCurrentAccountId(selectedAccountId);
                    try {
                        var acc = await Repository.accounts.getById(selectedAccountId);
                        if (acc) document.getElementById('header-account-name').textContent = acc.name;
                    } catch(e) { /* ignore */ }
                }
                if (typeof TransactionList !== 'undefined') {
                    TransactionList.render();
                }
            }

        } catch (e) {
            console.error('Import batch error:', e);
            setProgress(false);
            btn.disabled = false;
            btn.textContent = 'IMPORT SELECTED';
            App.showToast('Import failed: ' + (e.message || 'Unknown error'));
        }
    }

    function showResult(imported, skipped, errors, duplicates) {
        document.getElementById('result-imported').textContent = imported;
        document.getElementById('result-skipped').textContent = skipped;
        document.getElementById('result-invalid').textContent = errors;
        document.getElementById('result-dupes').textContent = duplicates;

        var msg = imported + ' transaction' + (imported === 1 ? '' : 's') + ' successfully imported.';
        if (errors > 0) msg += ' ' + errors + ' row' + (errors === 1 ? '' : 's') + ' had errors.';
        document.getElementById('result-message').textContent = msg;

        showStep(4);
    }

    // ── Reset / Go to Cash Book ────────────────────────────────

    function resetImport() {
        parsedFile = null;
        selectedSheet = 0;
        sheetHeaders = [];
        sheetDataRows = [];
        sheetRawDataRows = [];
        columnMapping = {};
        importRows = [];
        selectedAccountId = null;

        var fileInfo = document.getElementById('import-file-info');
        if (fileInfo) fileInfo.classList.add('hidden');

        var errEl = document.getElementById('import-step1-error');
        if (errEl) { errEl.classList.add('hidden'); errEl.textContent = ''; }

        var nextBtn = document.getElementById('import-step1-next');
        if (nextBtn) nextBtn.disabled = true;

        var tbody = document.getElementById('import-preview-tbody');
        if (tbody) tbody.innerHTML = '';

        setProgress(false);
        showStep(1);
    }

    function goToCashBook() {
        // Update sidebar active state
        var sidebarItems = document.querySelectorAll('.sidebar-item');
        sidebarItems.forEach(function(item) {
            item.classList.toggle('active', item.dataset.view === 'transactions');
        });
        resetImport();
        if (typeof App !== 'undefined' && App.showTransactionView) {
            App.showTransactionView();
        }
    }

    function showImportView(show) {
        var v = document.getElementById('view-import');
        if (!v) return;
        if (show) {
            v.classList.remove('hidden');
        } else {
            v.classList.add('hidden');
        }
    }



    // ── Init ───────────────────────────────────────────────────

    function init() {
        setupDropZone();

        // Step 1 → 2
        var nextBtn = document.getElementById('import-step1-next');
        if (nextBtn) {
            nextBtn.disabled = true;
            nextBtn.addEventListener('click', proceedToMapping);
        }

        // Sheet selector
        var sheetSel = document.getElementById('import-sheet-select');
        if (sheetSel) {
            sheetSel.addEventListener('change', function() {
                selectedSheet = parseInt(this.value) || 0;
            });
        }

        // Step 2 → 3 (preview)
        var previewBtn = document.getElementById('import-step2-next');
        if (previewBtn) {
            previewBtn.addEventListener('click', proceedToPreview);
        }

        // Step 2 ← back
        var backBtn2 = document.getElementById('import-step2-back');
        if (backBtn2) {
            backBtn2.addEventListener('click', function() { showStep(1); });
        }

        // Step 3: select/deselect all
        var selAll = document.getElementById('import-select-all');
        if (selAll) selAll.addEventListener('click', selectAllRows);

        var deselAll = document.getElementById('import-deselect-all');
        if (deselAll) deselAll.addEventListener('click', deselectAllRows);

        // Step 3: Import button
        var importBtn = document.getElementById('import-btn-import');
        if (importBtn) importBtn.addEventListener('click', doImport);

        // Step 3: back to mapping
        var backBtn3 = document.getElementById('import-step3-back');
        if (backBtn3) backBtn3.addEventListener('click', function() { showStep(2); });

        // Step 4: go to cash book
        var cashBookBtn = document.getElementById('import-goto-cashbook');
        if (cashBookBtn) cashBookBtn.addEventListener('click', goToCashBook);

        // Step 4: import another
        var anotherBtn = document.getElementById('import-another');
        if (anotherBtn) anotherBtn.addEventListener('click', function() {
            resetImport();
        });

        // Import header back button
        var headerBack = document.getElementById('btn-import-back');
        if (headerBack) {
            headerBack.addEventListener('click', function() {
                goToCashBook();
            });
        }

        // Account selector change in mapping
        var accSel = document.getElementById('map-account');
        if (accSel) {
            accSel.addEventListener('change', function() {
                selectedAccountId = parseInt(this.value) || null;
            });
        }
    }

    return {
        init: init,
        resetImport: resetImport,
        showImportView: showImportView,
        goToCashBook: goToCashBook
    };
})();
