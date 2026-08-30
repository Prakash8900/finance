/**
 * Fibbl – Accounts Module
 * Handles account management: list, create, edit, delete, switch.
 */
const AccountManager = (() => {

    let editMode = false;

    // ── Show Account Selector ────────────────────────────────

    function showSelector() {
        editMode = false;
        renderAccountList();
        document.getElementById('dialog-accounts').classList.remove('hidden');
        document.getElementById('btn-edit-accounts').textContent = 'Edit';
    }

    function hideSelector() {
        document.getElementById('dialog-accounts').classList.add('hidden');
        editMode = false;
    }

    // ── Render Account List ──────────────────────────────────

    async function renderAccountList() {
        var accounts = await Repository.accounts.getActive();
        var currentId = App.getCurrentAccountId();
        var list = document.getElementById('account-list');

        var html = '';
        for (var i = 0; i < accounts.length; i++) {
            var a = accounts[i];
            var isActive = a.id === currentId;

            html += '<div class="account-item' + (isActive ? ' active' : '') + '" data-id="' + a.id + '">';
            html += '<span class="account-item-name">' + escapeHtml(a.name) + '</span>';

            if (editMode) {
                html += '<div class="account-item-actions">';
                html += '<button class="account-edit-btn" data-id="' + a.id + '" title="Edit" type="button">✏️</button>';
                if (!a.isDefault) {
                    html += '<button class="account-delete-btn" data-id="' + a.id + '" title="Delete" type="button">🗑️</button>';
                }
                html += '</div>';
            }

            html += '</div>';
        }

        list.innerHTML = html;

        // Bind click events
        var items = list.querySelectorAll('.account-item');
        items.forEach(function(item) {
            item.addEventListener('click', function(e) {
                // Don't switch if clicking edit/delete buttons
                if (e.target.closest('.account-item-actions')) return;

                var id = parseInt(item.dataset.id);
                switchAccount(id);
            });
        });

        // Edit buttons
        var editBtns = list.querySelectorAll('.account-edit-btn');
        editBtns.forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                var id = parseInt(btn.dataset.id);
                showEditForm(id);
            });
        });

        // Delete buttons
        var deleteBtns = list.querySelectorAll('.account-delete-btn');
        deleteBtns.forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                var id = parseInt(btn.dataset.id);
                confirmDeleteAccount(id);
            });
        });
    }

    function escapeHtml(str) {
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // ── Switch Account ───────────────────────────────────────

    async function switchAccount(id) {
        await Repository.accounts.setDefault(id);
        var account = await Repository.accounts.getById(id);

        App.setCurrentAccountId(id);
        document.getElementById('header-account-name').textContent = account ? account.name : 'Cash Book';

        hideSelector();
        TransactionList.render();
    }

    // ── Toggle Edit Mode ─────────────────────────────────────

    function toggleEditMode() {
        editMode = !editMode;
        document.getElementById('btn-edit-accounts').textContent = editMode ? 'Done' : 'Edit';
        renderAccountList();
    }

    // ── Add Account Form ─────────────────────────────────────

    function showAddForm() {
        document.getElementById('account-form-title').textContent = 'Add Account';
        document.getElementById('account-name-input').value = '';
        document.getElementById('account-balance-input').value = '';
        document.getElementById('btn-account-save').dataset.editId = '';
        document.getElementById('dialog-account-form').classList.remove('hidden');

        setTimeout(function() {
            document.getElementById('account-name-input').focus();
        }, 200);
    }

    async function showEditForm(id) {
        var account = await Repository.accounts.getById(id);
        if (!account) return;

        document.getElementById('account-form-title').textContent = 'Edit Account';
        document.getElementById('account-name-input').value = account.name;
        document.getElementById('account-balance-input').value = account.openingBalance || 0;
        document.getElementById('btn-account-save').dataset.editId = id;
        document.getElementById('dialog-account-form').classList.remove('hidden');

        setTimeout(function() {
            document.getElementById('account-name-input').focus();
        }, 200);
    }

    function hideAccountForm() {
        document.getElementById('dialog-account-form').classList.add('hidden');
    }

    // ── Save Account ─────────────────────────────────────────

    async function saveAccount() {
        var name = document.getElementById('account-name-input').value.trim();
        var balance = parseFloat(document.getElementById('account-balance-input').value) || 0;
        var editId = document.getElementById('btn-account-save').dataset.editId;

        if (!name) {
            App.showToast('Please enter account name');
            return;
        }

        try {
            if (editId) {
                var account = await Repository.accounts.getById(parseInt(editId));
                if (account) {
                    account.name = name;
                    account.openingBalance = balance;
                    await Repository.accounts.update(account);
                    App.showToast('Account updated');

                    // Update header if this is the current account
                    if (account.id === App.getCurrentAccountId()) {
                        document.getElementById('header-account-name').textContent = name;
                    }
                }
            } else {
                await Repository.accounts.create({
                    name: name,
                    openingBalance: balance
                });
                App.showToast('Account created');
            }

            hideAccountForm();
            renderAccountList();
            TransactionList.render();
        } catch (e) {
            console.error('Save account error:', e);
            App.showToast('Error saving account');
        }
    }

    // ── Delete Account ───────────────────────────────────────

    function confirmDeleteAccount(id) {
        App.showConfirm(
            'Delete this account? All transactions in this account will also be deleted.',
            async function() {
                try {
                    await Repository.accounts.remove(id);
                    App.showToast('Account deleted');

                    // If deleted current account, switch to default
                    if (id === App.getCurrentAccountId()) {
                        var defaultAccount = await Repository.accounts.getDefault();
                        if (defaultAccount) {
                            await switchAccount(defaultAccount.id);
                        }
                    }

                    renderAccountList();
                } catch (e) {
                    console.error('Delete account error:', e);
                    App.showToast('Error deleting account');
                }
            }
        );
    }

    // ── Init ─────────────────────────────────────────────────

    function init() {
        // Account selector toggle
        document.getElementById('header-title').addEventListener('click', showSelector);

        // Close account selector
        document.getElementById('dialog-accounts').addEventListener('click', function(e) {
            if (e.target === this) hideSelector();
        });

        // Edit button
        document.getElementById('btn-edit-accounts').addEventListener('click', toggleEditMode);

        // Add account button
        document.getElementById('btn-add-account').addEventListener('click', function() {
            hideSelector();
            showAddForm();
        });

        // Account form buttons
        document.getElementById('btn-account-save').addEventListener('click', saveAccount);
        document.getElementById('btn-account-cancel').addEventListener('click', hideAccountForm);

        // Close account form on overlay click
        document.getElementById('dialog-account-form').addEventListener('click', function(e) {
            if (e.target === this) hideAccountForm();
        });
    }

    return {
        init: init,
        showSelector: showSelector,
        hideSelector: hideSelector,
        renderAccountList: renderAccountList
    };
})();
