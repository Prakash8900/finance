/**
 * Fibbl – Transaction Form Module
 * Handles Add and Edit transaction screens.
 */
const TransactionForm = (() => {

    let editingId = null;
    let currentType = 'cashOut';
    let attachmentData = null;

    // ── Show Form ────────────────────────────────────────────

    function show(type, txId) {
        currentType = type || 'cashOut';
        editingId = txId || null;
        attachmentData = null;

        // Switch headers
        document.getElementById('main-header').classList.add('hidden');
        document.getElementById('form-header').classList.remove('hidden');

        // Switch views
        document.getElementById('view-transactions').classList.add('hidden');
        document.getElementById('view-transaction-form').classList.remove('hidden');

        // Set title
        document.getElementById('form-title').textContent = editingId ? 'Edit Transaction' : 'Add Transaction';

        // Show/hide delete button
        document.getElementById('btn-delete-tx').classList.toggle('hidden', !editingId);

        // Reset form
        resetForm();

        // Set type toggle
        updateTypeToggle();

        // Load categories for the type
        loadCategories();

        // Set default date/time
        var now = new Date();
        document.getElementById('form-date').value = toISODate(now);
        document.getElementById('form-time').value = now.getHours().toString().padStart(2, '0') + ':' +
            now.getMinutes().toString().padStart(2, '0');

        // Set account name
        var accountName = document.getElementById('header-account-name').textContent;
        document.getElementById('form-account-name').textContent = accountName;

        // Load existing data if editing
        if (editingId) {
            loadTransaction(editingId);
        }

        // Focus amount
        setTimeout(function() {
            document.getElementById('form-amount').focus();
        }, 300);
    }

    function hide() {
        document.getElementById('form-header').classList.add('hidden');
        document.getElementById('main-header').classList.remove('hidden');

        document.getElementById('view-transaction-form').classList.add('hidden');
        document.getElementById('view-transactions').classList.remove('hidden');

        editingId = null;
        attachmentData = null;
    }

    // ── Helpers ──────────────────────────────────────────────

    function toISODate(d) {
        return d.getFullYear() + '-' +
            String(d.getMonth() + 1).padStart(2, '0') + '-' +
            String(d.getDate()).padStart(2, '0');
    }

    function resetForm() {
        document.getElementById('form-amount').value = '';
        document.getElementById('form-description').value = '';
        document.getElementById('form-category').value = '';
        document.getElementById('attachment-preview').classList.add('hidden');
        document.getElementById('attachment-img').src = '';
        attachmentData = null;
    }

    function updateTypeToggle() {
        var btnIn = document.getElementById('type-cash-in');
        var btnOut = document.getElementById('type-cash-out');
        var label = document.getElementById('amount-label');

        btnIn.classList.toggle('active', currentType === 'cashIn');
        btnOut.classList.toggle('active', currentType === 'cashOut');

        if (currentType === 'cashIn') {
            label.textContent = 'Cash In';
            label.className = 'amount-type-label cash-in-color';
        } else {
            label.textContent = 'Cash Out';
            label.className = 'amount-type-label cash-out-color';
        }
    }

    async function loadCategories() {
        var select = document.getElementById('form-category');
        var cats = await Repository.categories.getByType(currentType);

        // Keep the first option
        select.innerHTML = '<option value="">Select Category</option>';

        for (var i = 0; i < cats.length; i++) {
            var opt = document.createElement('option');
            opt.value = cats[i].name;
            opt.textContent = cats[i].name;
            select.appendChild(opt);
        }
    }

    async function loadTransaction(id) {
        var tx = await Repository.transactions.getById(id);
        if (!tx) return;

        currentType = tx.type;
        updateTypeToggle();
        loadCategories().then(function() {
            document.getElementById('form-category').value = tx.category || '';
        });

        document.getElementById('form-amount').value = tx.amount;
        document.getElementById('form-description').value = tx.description || '';
        document.getElementById('form-date').value = tx.date || '';
        document.getElementById('form-time').value = tx.time || '';

        if (tx.attachment) {
            attachmentData = tx.attachment;
            document.getElementById('attachment-img').src = tx.attachment;
            document.getElementById('attachment-preview').classList.remove('hidden');
        }
    }

    // ── Save ─────────────────────────────────────────────────

    async function save() {
        var amount = parseFloat(document.getElementById('form-amount').value);
        var description = document.getElementById('form-description').value.trim();
        var category = document.getElementById('form-category').value;
        var date = document.getElementById('form-date').value;
        var time = document.getElementById('form-time').value;

        // Validate
        if (!amount || amount <= 0) {
            App.showToast('Please enter a valid amount');
            return;
        }

        if (!date) {
            App.showToast('Please select a date');
            return;
        }

        var accountId = App.getCurrentAccountId();

        var data = {
            accountId: accountId,
            type: currentType,
            amount: amount,
            description: description,
            category: category,
            date: date,
            time: time,
            attachment: attachmentData
        };

        try {
            if (editingId) {
                // ── EDIT MODE: save then go back (existing behaviour) ──
                data.id = editingId;
                // Preserve createdAt
                var existing = await Repository.transactions.getById(editingId);
                if (existing) {
                    data.createdAt = existing.createdAt;
                }
                await Repository.transactions.update(data);
                App.showToast('Transaction updated');

                hide();
                TransactionList.render();

            } else {
                // ── ADD MODE: save, reset form, stay on Add Transaction ──
                await Repository.transactions.create(data);

                // Reset form fields
                document.getElementById('form-amount').value = '';
                document.getElementById('form-description').value = '';
                document.getElementById('form-category').value = '';
                // Clear attachment
                document.getElementById('attachment-preview').classList.add('hidden');
                document.getElementById('attachment-img').src = '';
                attachmentData = null;

                // Refresh date/time to current moment for the next entry
                var now = new Date();
                document.getElementById('form-date').value = toISODate(now);
                document.getElementById('form-time').value =
                    now.getHours().toString().padStart(2, '0') + ':' +
                    now.getMinutes().toString().padStart(2, '0');

                // Keep currentType selected (do NOT reset type toggle)
                // Reload categories in case they changed
                loadCategories();

                // Show success toast
                App.showToast('Transaction saved');

                // Focus amount field for next entry
                setTimeout(function() {
                    document.getElementById('form-amount').focus();
                }, 100);

                // Update the transaction list in the background so totals are fresh
                // when the user returns via Back
                TransactionList.render();
            }

        } catch (e) {
            console.error('Save error:', e);
            App.showToast('Error saving transaction');
        }
    }

    // ── Delete ───────────────────────────────────────────────

    function confirmDelete() {
        if (!editingId) return;

        App.showConfirm('Are you sure you want to delete this transaction?', async function() {
            try {
                await Repository.transactions.remove(editingId);
                App.showToast('Transaction deleted');
                hide();
                TransactionList.render();
            } catch (e) {
                console.error('Delete error:', e);
                App.showToast('Error deleting transaction');
            }
        });
    }

    // ── Attachment ────────────────────────────────────────────

    function handleAttachment(file) {
        if (!file) return;

        var reader = new FileReader();
        reader.onload = function(e) {
            attachmentData = e.target.result;
            document.getElementById('attachment-img').src = attachmentData;
            document.getElementById('attachment-preview').classList.remove('hidden');
        };
        reader.readAsDataURL(file);
    }

    function removeAttachment() {
        attachmentData = null;
        document.getElementById('attachment-img').src = '';
        document.getElementById('attachment-preview').classList.add('hidden');
        document.getElementById('file-attachment').value = '';
    }

    // ── Type Toggle ──────────────────────────────────────────

    function setType(type) {
        currentType = type;
        updateTypeToggle();
        loadCategories();
    }

    // ── Init Events ──────────────────────────────────────────

    function init() {
        // Type toggle buttons
        document.getElementById('type-cash-in').addEventListener('click', function() {
            setType('cashIn');
        });

        document.getElementById('type-cash-out').addEventListener('click', function() {
            setType('cashOut');
        });

        // Save button
        document.getElementById('btn-save-tx').addEventListener('click', save);

        // Back button
        document.getElementById('btn-back').addEventListener('click', hide);

        // Delete button
        document.getElementById('btn-delete-tx').addEventListener('click', confirmDelete);

        // Camera button
        document.getElementById('btn-camera').addEventListener('click', function() {
            document.getElementById('file-attachment').click();
        });

        // File input
        document.getElementById('file-attachment').addEventListener('change', function(e) {
            if (e.target.files && e.target.files[0]) {
                handleAttachment(e.target.files[0]);
            }
        });

        // Remove attachment
        document.getElementById('btn-remove-attachment').addEventListener('click', removeAttachment);
    }

    return {
        show: show,
        hide: hide,
        init: init,
        confirmDelete: confirmDelete
    };
})();
