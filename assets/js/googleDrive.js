/**
 * Fibbl – Google Drive Service (Optional)
 * Browser-side Google Drive backup/restore using OAuth2.
 * Requires GOOGLE_CLIENT_ID to be configured in config.js.
 * The app works completely without this service.
 */
const GoogleDriveService = (() => {

    const BACKUP_FILENAME = 'fibbl_backup.json';
    const SCOPES = 'https://www.googleapis.com/auth/drive.file';

    let tokenClient = null;
    let accessToken = null;

    // ── Check Configuration ──────────────────────────────────

    function isConfigured() {
        return APP_CONFIG.GOOGLE_CLIENT_ID && APP_CONFIG.GOOGLE_CLIENT_ID.length > 0;
    }

    // ── Initialize Google API ────────────────────────────────

    function init() {
        if (!isConfigured()) return;

        // Load Google Identity Services library dynamically
        var script = document.createElement('script');
        script.src = 'https://accounts.google.com/gsi/client';
        script.async = true;
        script.defer = true;
        script.onload = function() {
            try {
                tokenClient = google.accounts.oauth2.initTokenClient({
                    client_id: APP_CONFIG.GOOGLE_CLIENT_ID,
                    scope: SCOPES,
                    callback: function(tokenResponse) {
                        if (tokenResponse && tokenResponse.access_token) {
                            accessToken = tokenResponse.access_token;
                        }
                    }
                });
            } catch (e) {
                console.warn('Google Identity Services init failed:', e);
            }
        };
        document.head.appendChild(script);
    }

    // ── Request Access Token ─────────────────────────────────

    function requestAccess() {
        return new Promise(function(resolve, reject) {
            if (!tokenClient) {
                reject(new Error('Google API not loaded'));
                return;
            }

            tokenClient.callback = function(tokenResponse) {
                if (tokenResponse.error) {
                    reject(new Error(tokenResponse.error));
                } else {
                    accessToken = tokenResponse.access_token;
                    resolve(accessToken);
                }
            };

            tokenClient.requestAccessToken();
        });
    }

    // ── Backup to Google Drive ───────────────────────────────

    async function backup() {
        if (!isConfigured()) {
            App.showToast('Google Drive is not configured');
            return;
        }

        try {
            App.showToast('Authenticating with Google...');
            await requestAccess();

            App.showToast('Preparing backup...');
            var data = await Repository.exportAll();
            var json = JSON.stringify(data, null, 2);

            // Check if backup file already exists
            var existingFileId = await findBackupFile();

            if (existingFileId) {
                // Update existing file
                await updateFile(existingFileId, json);
            } else {
                // Create new file
                await createFile(json);
            }

            App.showToast('Backup saved to Google Drive');
        } catch (e) {
            console.error('Google Drive backup error:', e);
            App.showToast('Google Drive backup failed');
        }
    }

    // ── Restore from Google Drive ────────────────────────────

    async function restore() {
        if (!isConfigured()) {
            App.showToast('Google Drive is not configured');
            return;
        }

        try {
            App.showToast('Authenticating with Google...');
            await requestAccess();

            App.showToast('Looking for backup...');
            var fileId = await findBackupFile();

            if (!fileId) {
                App.showToast('No backup found on Google Drive');
                return;
            }

            var content = await downloadFile(fileId);
            var data = JSON.parse(content);

            if (!data.accounts || !data.transactions) {
                App.showToast('Invalid backup data');
                return;
            }

            App.showConfirm(
                'Restore from Google Drive? This will replace all local data.',
                async function() {
                    try {
                        await Repository.importAll(data);
                        App.showToast('Backup restored from Google Drive');

                        // Reload app
                        var defaultAccount = await Repository.accounts.getDefault();
                        if (defaultAccount) {
                            App.setCurrentAccountId(defaultAccount.id);
                            document.getElementById('header-account-name').textContent = defaultAccount.name;
                        }

                        var darkMode = await Repository.settings.get('darkMode');
                        App.applyDarkMode(darkMode);

                        TransactionList.render();
                    } catch (e) {
                        console.error('Restore error:', e);
                        App.showToast('Error restoring backup');
                    }
                }
            );
        } catch (e) {
            console.error('Google Drive restore error:', e);
            App.showToast('Google Drive restore failed');
        }
    }

    // ── Drive API Helpers ────────────────────────────────────

    async function findBackupFile() {
        var response = await fetch(
            'https://www.googleapis.com/drive/v3/files?q=name%3D%27' + BACKUP_FILENAME +
            '%27+and+trashed%3Dfalse&fields=files(id,name,modifiedTime)',
            {
                headers: { 'Authorization': 'Bearer ' + accessToken }
            }
        );

        if (!response.ok) return null;

        var result = await response.json();
        return result.files && result.files.length > 0 ? result.files[0].id : null;
    }

    async function createFile(content) {
        var metadata = {
            name: BACKUP_FILENAME,
            mimeType: 'application/json'
        };

        var form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        form.append('file', new Blob([content], { type: 'application/json' }));

        var response = await fetch(
            'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
            {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + accessToken },
                body: form
            }
        );

        return response.json();
    }

    async function updateFile(fileId, content) {
        var response = await fetch(
            'https://www.googleapis.com/upload/drive/v3/files/' + fileId + '?uploadType=media',
            {
                method: 'PATCH',
                headers: {
                    'Authorization': 'Bearer ' + accessToken,
                    'Content-Type': 'application/json'
                },
                body: content
            }
        );

        return response.json();
    }

    async function downloadFile(fileId) {
        var response = await fetch(
            'https://www.googleapis.com/drive/v3/files/' + fileId + '?alt=media',
            {
                headers: { 'Authorization': 'Bearer ' + accessToken }
            }
        );

        return response.text();
    }

    return {
        init: init,
        backup: backup,
        restore: restore,
        isConfigured: isConfigured
    };
})();
