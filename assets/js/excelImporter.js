/**
 * Fibbl – Excel Importer Engine
 * Handles local browser-side parsing of XLSX, XLS, CSV files.
 * No data is uploaded anywhere — all processing is in-browser.
 */
const ExcelImporter = (() => {

    // ── Column Detection Candidates ────────────────────────────

    const DATE_CANDIDATES = [
        'date', 'transaction date', 'txn date', 'value date',
        'posting date', 'tran date', 'trans date', 'transaction dt',
        'value dt', 'trade date'
    ];

    const DESC_CANDIDATES = [
        'description', 'narration', 'particulars', 'details',
        'transaction details', 'remarks', 'reference', 'transaction description',
        'trans description', 'cheque details', 'chq no', 'transaction remarks',
        'beneficiary name', 'narrations', 'particular'
    ];

    const DEBIT_CANDIDATES = [
        'debit', 'debit amount', 'withdrawal', 'withdrawals',
        'withdrawal amount', 'dr', 'debit (₹)', 'paid out',
        'debit amt', 'dr amount', 'withdrawn', 'amount debited'
    ];

    const CREDIT_CANDIDATES = [
        'credit', 'credit amount', 'deposit', 'deposits',
        'deposit amount', 'cr', 'credit (₹)', 'paid in',
        'credit amt', 'cr amount', 'deposited', 'amount credited'
    ];

    const BALANCE_CANDIDATES = [
        'balance', 'closing balance', 'available balance',
        'running balance', 'bal', 'a/c balance', 'account balance',
        'net balance', 'book balance'
    ];

    // FORMAT D: single amount + type column
    const AMOUNT_CANDIDATES = [
        'amount', 'transaction amount', 'txn amount', 'trans amount'
    ];

    const TYPE_CANDIDATES = [
        'type', 'transaction type', 'txn type', 'dr/cr', 'debit/credit',
        'cr/dr', 'transaction indicator'
    ];

    // ── Normalise header for matching ──────────────────────────

    function normaliseHeader(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .toLowerCase()
            .replace(/[₹()\[\]{}]/g, '')
            .replace(/[^a-z0-9\s\/]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function matchHeader(header, candidates) {
        var norm = normaliseHeader(header);
        for (var i = 0; i < candidates.length; i++) {
            if (norm === candidates[i]) return true;
            // Partial match: candidate is contained in header or vice-versa
            if (norm.indexOf(candidates[i]) !== -1 || candidates[i].indexOf(norm) !== -1) {
                return true;
            }
        }
        return false;
    }

    // ── Column Auto-Detection ──────────────────────────────────

    function detectColumns(headers) {
        var mapping = {
            date: null,
            description: null,
            debit: null,
            credit: null,
            balance: null,
            amount: null,
            type: null
        };

        for (var i = 0; i < headers.length; i++) {
            var h = headers[i];
            if (h === null || h === undefined || String(h).trim() === '') continue;

            if (mapping.date === null && matchHeader(h, DATE_CANDIDATES)) {
                mapping.date = h;
            } else if (mapping.description === null && matchHeader(h, DESC_CANDIDATES)) {
                mapping.description = h;
            } else if (mapping.debit === null && matchHeader(h, DEBIT_CANDIDATES)) {
                mapping.debit = h;
            } else if (mapping.credit === null && matchHeader(h, CREDIT_CANDIDATES)) {
                mapping.credit = h;
            } else if (mapping.balance === null && matchHeader(h, BALANCE_CANDIDATES)) {
                mapping.balance = h;
            } else if (mapping.amount === null && matchHeader(h, AMOUNT_CANDIDATES)) {
                mapping.amount = h;
            } else if (mapping.type === null && matchHeader(h, TYPE_CANDIDATES)) {
                mapping.type = h;
            }
        }

        return mapping;
    }

    // ── Date Parsing ───────────────────────────────────────────

    /**
     * Try to parse a date from various formats.
     * Returns 'YYYY-MM-DD' string or null if unparseable.
     */
    function parseDate(value) {
        if (value === null || value === undefined || String(value).trim() === '') return null;

        var str = String(value).trim();

        // Excel serial date (a number)
        if (/^\d{4,5}(\.\d+)?$/.test(str)) {
            var serial = parseFloat(str);
            if (serial > 1 && serial < 100000) {
                var date = excelSerialToDate(serial);
                if (date) return toISODate(date);
            }
        }

        // ISO: YYYY-MM-DD
        var isoMatch = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
        if (isoMatch) {
            var d = new Date(parseInt(isoMatch[1]), parseInt(isoMatch[2]) - 1, parseInt(isoMatch[3]));
            if (isValidDate(d)) return toISODate(d);
        }

        // DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
        var dmyMatch = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/);
        if (dmyMatch) {
            var day = parseInt(dmyMatch[1]);
            var month = parseInt(dmyMatch[2]);
            var year = parseInt(dmyMatch[3]);

            // Try DD/MM/YYYY first (more common in India)
            if (month <= 12 && day <= 31) {
                var dDate = new Date(year, month - 1, day);
                if (isValidDate(dDate) && dDate.getDate() === day) {
                    return toISODate(dDate);
                }
            }

            // Fallback: MM/DD/YYYY
            if (day <= 12) {
                var mDate = new Date(year, day - 1, month);
                if (isValidDate(mDate)) return toISODate(mDate);
            }
        }

        // Try native Date parsing as last resort
        var native = new Date(str);
        if (!isNaN(native.getTime())) {
            return toISODate(native);
        }

        return null; // Cannot parse
    }

    function excelSerialToDate(serial) {
        // Excel epoch: January 1, 1900 (with Lotus 1-2-3 leap year bug: day 60 = Feb 29 1900 which didn't exist)
        var days = Math.floor(serial);
        if (days <= 60) days--; // correct the Lotus bug
        var msPerDay = 86400000;
        var epoch = new Date(1900, 0, 1).getTime();
        var ts = epoch + (days - 1) * msPerDay;
        return new Date(ts);
    }

    function isValidDate(d) {
        return d instanceof Date && !isNaN(d.getTime());
    }

    function toISODate(d) {
        return d.getFullYear() + '-' +
            String(d.getMonth() + 1).padStart(2, '0') + '-' +
            String(d.getDate()).padStart(2, '0');
    }

    // ── Amount Parsing ─────────────────────────────────────────

    /**
     * Parse amount strings like ₹1,54,437.68 → 154437.68
     * Returns a positive number or null if invalid.
     */
    function parseAmount(value) {
        if (value === null || value === undefined || String(value).trim() === '') return null;

        // If already a number
        if (typeof value === 'number') {
            return isNaN(value) ? null : Math.abs(value);
        }

        var str = String(value).trim();

        // Remove currency symbols and labels
        str = str.replace(/₹|Rs\.?|INR|,/gi, '').trim();

        // Handle parenthetical negatives like (1500)
        var negative = false;
        if (/^\(.*\)$/.test(str)) {
            str = str.replace(/[()]/g, '');
            negative = true;
        }

        // Handle explicit negative sign
        if (str.startsWith('-')) {
            str = str.substring(1);
            negative = true;
        }

        var num = parseFloat(str);
        if (isNaN(num)) return null;

        return Math.abs(num); // Always return positive; type (debit/credit) decides sign
    }

    // ── Category Detection ─────────────────────────────────────

    const CATEGORY_RULES = [
        { keywords: ['salary', 'sal credit', 'sal/', 'stipend', 'wages'], category: 'Salary' },
        { keywords: ['electricity', 'bescom', 'msedcl', 'tneb', 'discoms', 'power', 'electric bill'], category: 'Utilities' },
        { keywords: ['rent', 'house rent', 'rental'], category: 'Rent' },
        { keywords: ['atm', 'cash withdrawal', 'cash wtdl'], category: 'Cash Withdrawal' },
        { keywords: ['upi/', '/upi', 'upi-', 'upi '], category: 'UPI' },
        { keywords: ['emi', 'loan', 'home loan', 'car loan', 'personal loan'], category: 'Loan/EMI' },
        { keywords: ['grocery', 'grocer', 'supermart', 'bigbasket', 'blinkit', 'zepto', 'dmart'], category: 'Grocery' },
        { keywords: ['food', 'restaurant', 'swiggy', 'zomato', 'hotel', 'cafe', 'kitchen'], category: 'Food' },
        { keywords: ['fuel', 'petrol', 'diesel', 'gas station', 'hpcl', 'bpcl', 'iocl'], category: 'Transport' },
        { keywords: ['insurance', 'lic', 'premium', 'policy'], category: 'Insurance' },
        { keywords: ['interest', 'int credit', 'fd interest'], category: 'Interest' },
        { keywords: ['neft', 'rtgs', 'imps', 'transfer'], category: 'Transfer' },
        { keywords: ['dividend', 'div credit'], category: 'Investment' },
        { keywords: ['tax', 'tds', 'gst'], category: 'Tax' },
        { keywords: ['mobile', 'recharge', 'airtel', 'jio', 'vodafone', 'bsnl'], category: 'Utilities' },
        { keywords: ['ott', 'netflix', 'amazon prime', 'hotstar', 'spotify'], category: 'Entertainment' },
    ];

    function autoCategory(description) {
        if (!description) return 'Uncategorized';
        var lower = description.toLowerCase();
        for (var i = 0; i < CATEGORY_RULES.length; i++) {
            var rule = CATEGORY_RULES[i];
            for (var j = 0; j < rule.keywords.length; j++) {
                if (lower.indexOf(rule.keywords[j]) !== -1) {
                    return rule.category;
                }
            }
        }
        return 'Uncategorized';
    }

    // ── Duplicate Fingerprint ──────────────────────────────────

    function buildFingerprint(accountId, date, amount, type, description) {
        var normDesc = (description || '')
            .trim()
            .toLowerCase()
            .replace(/\s+/g, ' ');
        return [accountId, date, amount, type, normDesc].join('|');
    }

    function buildFingerprintFromRow(row) {
        return buildFingerprint(
            row.accountId,
            row.date,
            row.amount,
            row.type,
            row.description
        );
    }

    // ── File Parsing ───────────────────────────────────────────

    /**
     * Parse a File object using SheetJS.
     * Returns { sheets: [{name, data}], sheetNames: [] }
     */
    function parseFile(file) {
        return new Promise(function(resolve, reject) {
            if (!file) {
                reject(new Error('No file provided'));
                return;
            }

            var ext = file.name.split('.').pop().toLowerCase();
            var supported = ['xlsx', 'xls', 'csv'];
            if (supported.indexOf(ext) === -1) {
                reject(new Error('Unsupported file format. Please use XLSX, XLS, or CSV.'));
                return;
            }

            var reader = new FileReader();

            reader.onload = function(e) {
                try {
                    var data = e.target.result;
                    var workbook;

                    if (ext === 'csv') {
                        // For CSV, parse as text then use XLSX
                        workbook = XLSX.read(data, { type: 'string', raw: false });
                    } else {
                        workbook = XLSX.read(data, { type: 'array' });
                    }

                    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
                        reject(new Error('The file contains no worksheets.'));
                        return;
                    }

                    var sheets = workbook.SheetNames.map(function(name) {
                        var ws = workbook.Sheets[name];
                        // sheet_to_json: header:1 returns rows as arrays; first row = headers
                        var rows = XLSX.utils.sheet_to_json(ws, {
                            header: 1,
                            defval: '',
                            blankrows: false,
                            raw: false  // format numbers as strings where possible
                        });

                        // Also get raw data for numeric Excel dates
                        var rawRows = XLSX.utils.sheet_to_json(ws, {
                            header: 1,
                            defval: null,
                            blankrows: false,
                            raw: true
                        });

                        return { name: name, rows: rows, rawRows: rawRows };
                    });

                    resolve({
                        sheets: sheets,
                        sheetNames: workbook.SheetNames,
                        fileName: file.name,
                        fileSize: file.size
                    });
                } catch (err) {
                    reject(new Error('Failed to parse file: ' + err.message));
                }
            };

            reader.onerror = function() {
                reject(new Error('Failed to read file.'));
            };

            if (ext === 'csv') {
                reader.readAsText(file);
            } else {
                reader.readAsArrayBuffer(file);
            }
        });
    }

    /**
     * Extract headers and data rows from parsed sheet data.
     * Finds the first non-empty row as the header row.
     */
    function extractHeadersAndRows(sheetData) {
        var rows = sheetData.rows;
        var rawRows = sheetData.rawRows;

        if (!rows || rows.length === 0) {
            return { headers: [], dataRows: [], rawDataRows: [] };
        }

        // Find first row that has meaningful content (at least 3 non-empty cells)
        var headerRowIdx = 0;
        for (var i = 0; i < Math.min(rows.length, 10); i++) {
            var nonEmpty = rows[i].filter(function(c) {
                return c !== null && c !== undefined && String(c).trim() !== '';
            }).length;
            if (nonEmpty >= 3) {
                headerRowIdx = i;
                break;
            }
        }

        var headers = rows[headerRowIdx].map(function(h) {
            return String(h === null || h === undefined ? '' : h).trim();
        });

        var dataRows = rows.slice(headerRowIdx + 1).filter(function(row) {
            // Skip empty rows
            return row.some(function(cell) {
                return cell !== null && cell !== undefined && String(cell).trim() !== '';
            });
        });

        var rawDataRows = rawRows.slice(headerRowIdx + 1).filter(function(row) {
            return row && row.some(function(cell) {
                return cell !== null && cell !== undefined && String(cell) !== '';
            });
        });

        return { headers: headers, dataRows: dataRows, rawDataRows: rawDataRows };
    }

    /**
     * Convert sheet rows to structured transaction objects using the mapping.
     * mapping: { date, description, debit, credit, balance, amount, type, accountId }
     * Returns array of row objects with status info.
     */
    function processRows(headers, dataRows, rawDataRows, mapping, accountId) {
        var headerIndex = {};
        for (var i = 0; i < headers.length; i++) {
            headerIndex[headers[i]] = i;
        }

        // Also build a lowercase index for robustness
        var headerIndexLower = {};
        for (var h in headerIndex) {
            headerIndexLower[normaliseHeader(h)] = headerIndex[h];
        }

        function getCell(row, colName) {
            if (!colName) return '';
            // Exact match
            if (headerIndex[colName] !== undefined) return row[headerIndex[colName]];
            // Normalised match
            var norm = normaliseHeader(colName);
            if (headerIndexLower[norm] !== undefined) return row[headerIndexLower[norm]];
            return '';
        }

        function getRawCell(rawRow, colName) {
            if (!colName || !rawRow) return null;
            if (headerIndex[colName] !== undefined) return rawRow[headerIndex[colName]];
            var norm = normaliseHeader(colName);
            if (headerIndexLower[norm] !== undefined) return rawRow[headerIndexLower[norm]];
            return null;
        }

        var results = [];

        for (var r = 0; r < dataRows.length; r++) {
            var row = dataRows[r];
            var rawRow = rawDataRows[r] || [];

            // --- Date ---
            var dateRaw = getRawCell(rawRow, mapping.date) || getCell(row, mapping.date);
            var parsedDate = parseDate(dateRaw);
            var dateError = !parsedDate;

            // --- Description ---
            var description = String(getCell(row, mapping.description) || '').trim();

            // --- Amount logic ---
            var debitVal = null;
            var creditVal = null;
            var txType = null;
            var amount = null;

            if (mapping.debit && mapping.credit) {
                // FORMAT A/B: separate debit/credit columns
                debitVal = parseAmount(getCell(row, mapping.debit));
                creditVal = parseAmount(getCell(row, mapping.credit));

                if (debitVal && debitVal > 0) {
                    txType = 'cashOut';
                    amount = debitVal;
                } else if (creditVal && creditVal > 0) {
                    txType = 'cashIn';
                    amount = creditVal;
                }
                // If both are 0/empty — skip (likely header row or empty row)

            } else if (mapping.amount && mapping.type) {
                // FORMAT D: single amount + type column
                var rawAmount = parseAmount(getCell(row, mapping.amount));
                var typeVal = String(getCell(row, mapping.type) || '').trim().toLowerCase();

                if (rawAmount && rawAmount > 0) {
                    // Detect credit/debit from type column
                    if (/^cr|credit|deposit|paid.?in/i.test(typeVal)) {
                        txType = 'cashIn';
                        amount = rawAmount;
                    } else if (/^dr|debit|withdrawal|paid.?out/i.test(typeVal)) {
                        txType = 'cashOut';
                        amount = rawAmount;
                    } else {
                        txType = null;
                        amount = null;
                    }
                }

            } else if (mapping.debit && !mapping.credit) {
                // Only debit column mapped
                debitVal = parseAmount(getCell(row, mapping.debit));
                if (debitVal && debitVal > 0) {
                    txType = 'cashOut';
                    amount = debitVal;
                }

            } else if (mapping.credit && !mapping.debit) {
                // Only credit column mapped
                creditVal = parseAmount(getCell(row, mapping.credit));
                if (creditVal && creditVal > 0) {
                    txType = 'cashIn';
                    amount = creditVal;
                }
            }

            // Skip rows with no usable data
            if (!description && !amount && !parsedDate) continue;

            // --- Status ---
            var errors = [];
            if (dateError) errors.push('INVALID DATE');
            if (!amount || amount <= 0) errors.push('INVALID AMOUNT');
            if (!description) errors.push('MISSING DESCRIPTION');

            var status = errors.length > 0 ? 'invalid' : 'ready';
            var statusMsg = errors.join(', ');

            var category = autoCategory(description);
            var balance = parseAmount(getCell(row, mapping.balance));

            results.push({
                _rowIndex: r,
                date: parsedDate || '',
                dateRaw: String(dateRaw || ''),
                description: description,
                amount: amount || 0,
                type: txType,
                category: category,
                balance: balance,
                accountId: accountId,
                status: status,
                statusMsg: statusMsg,
                isDuplicate: false,
                selected: status === 'ready'
            });
        }

        return results;
    }

    /**
     * Compare import rows against existing transactions to find duplicates.
     * Marks rows with isDuplicate = true if a match is found.
     */
    function detectDuplicates(importRows, existingTransactions) {
        // Build fingerprint set from existing transactions
        var existingPrints = new Set();
        for (var i = 0; i < existingTransactions.length; i++) {
            var t = existingTransactions[i];
            var fp = buildFingerprint(t.accountId, t.date, t.amount, t.type, t.description);
            existingPrints.add(fp);
        }

        // Also track fingerprints within the import batch to find intra-batch dupes
        var batchPrints = new Set();

        for (var r = 0; r < importRows.length; r++) {
            var row = importRows[r];
            if (row.status !== 'ready') continue;

            var rowFp = buildFingerprintFromRow(row);

            if (existingPrints.has(rowFp)) {
                row.isDuplicate = true;
                row.status = 'duplicate';
                row.statusMsg = 'Possible Duplicate';
                row.selected = false; // Deselect duplicates by default
            } else if (batchPrints.has(rowFp)) {
                row.isDuplicate = true;
                row.status = 'duplicate';
                row.statusMsg = 'Duplicate in Import';
                row.selected = false;
            } else {
                batchPrints.add(rowFp);
            }
        }

        return importRows;
    }

    // ── Public API ─────────────────────────────────────────────

    return {
        parseFile: parseFile,
        extractHeadersAndRows: extractHeadersAndRows,
        detectColumns: detectColumns,
        processRows: processRows,
        detectDuplicates: detectDuplicates,
        parseDate: parseDate,
        parseAmount: parseAmount,
        autoCategory: autoCategory,
        normaliseHeader: normaliseHeader,
        DATE_CANDIDATES: DATE_CANDIDATES,
        DESC_CANDIDATES: DESC_CANDIDATES,
        DEBIT_CANDIDATES: DEBIT_CANDIDATES,
        CREDIT_CANDIDATES: CREDIT_CANDIDATES,
        BALANCE_CANDIDATES: BALANCE_CANDIDATES,
        AMOUNT_CANDIDATES: AMOUNT_CANDIDATES,
        TYPE_CANDIDATES: TYPE_CANDIDATES
    };
})();
