/**
 * Fibbl – Service Worker
 * Caches all app shell assets for offline-first experience.
 */

const CACHE_NAME = 'fibbl-cache-v3';

const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './config.js',
    './manifest.json',
    './assets/css/style.css',
    './assets/js/db.js',
    './assets/js/repository.js',
    './assets/js/transactions.js',
    './assets/js/transaction-form.js',
    './assets/js/accounts.js',
    './assets/js/reports.js',
    './assets/js/backup.js',
    './assets/js/settings.js',
    './assets/js/googleDrive.js',
    './assets/js/excelImporter.js',
    './assets/js/import.js',
    './assets/js/app.js',
    './assets/vendor/xlsx/xlsx.full.min.js',
    './assets/images/icon-192.png',
    './assets/images/icon-512.png'
];

// ── Install ──────────────────────────────────────────────────

self.addEventListener('install', function(event) {
    event.waitUntil(
        caches.open(CACHE_NAME).then(function(cache) {
            console.log('[SW] Caching app shell');
            return cache.addAll(ASSETS_TO_CACHE);
        }).then(function() {
            return self.skipWaiting();
        })
    );
});

// ── Activate ─────────────────────────────────────────────────

self.addEventListener('activate', function(event) {
    event.waitUntil(
        caches.keys().then(function(cacheNames) {
            return Promise.all(
                cacheNames.filter(function(name) {
                    return name !== CACHE_NAME;
                }).map(function(name) {
                    console.log('[SW] Deleting old cache:', name);
                    return caches.delete(name);
                })
            );
        }).then(function() {
            return self.clients.claim();
        })
    );
});

// ── Fetch ────────────────────────────────────────────────────

self.addEventListener('fetch', function(event) {
    // Skip non-GET and external requests
    if (event.request.method !== 'GET') return;

    // Skip Google API requests (should not be cached)
    if (event.request.url.includes('googleapis.com') ||
        event.request.url.includes('accounts.google.com')) {
        return;
    }

    event.respondWith(
        caches.match(event.request).then(function(cachedResponse) {
            if (cachedResponse) {
                return cachedResponse;
            }

            return fetch(event.request).then(function(networkResponse) {
                // Cache successful responses for app assets
                if (networkResponse && networkResponse.status === 200 &&
                    networkResponse.type === 'basic') {
                    var responseClone = networkResponse.clone();
                    caches.open(CACHE_NAME).then(function(cache) {
                        cache.put(event.request, responseClone);
                    });
                }
                return networkResponse;
            }).catch(function() {
                // If both cache and network fail, return offline fallback
                if (event.request.destination === 'document') {
                    return caches.match('./index.html');
                }
            });
        })
    );
});
