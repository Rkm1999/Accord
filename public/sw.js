const CACHE_NAME = 'accord-v7'; // Bumped to v7
const ASSETS = [
    '/',
    '/index.html',
    '/manifest.json',
    'https://cdn.jsdelivr.net/npm/marked/marked.min.js'
];

// Install event
self.addEventListener('install', (event) => {
    console.log('[SW] Installing v7...');
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS);
        })
    );
    self.skipWaiting();
});

// Activate event
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating v7...');
    event.waitUntil(
        caches.keys().then((keyList) => {
            return Promise.all(
                keyList.map((key) => {
                    if (key !== CACHE_NAME && key !== 'token-cache') {
                        return caches.delete(key);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

// Fetch event
self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;
    if (event.request.url.includes('/api/')) return;
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            return cachedResponse || fetch(event.request).catch(() => { });
        })
    );
});

// Push Event: Handle Encrypted Payload
self.addEventListener('push', (event) => {
    console.log('[SW] Background push signal received');

    let data = { title: 'Accord Message', body: 'You have a new message.' };

    if (event.data) {
        try {
            data = event.data.json();
            console.log('[SW] Payload:', data);
        } catch (e) {
            console.warn('[SW] Non-JSON payload');
            data.body = event.data.text();
        }
    }

    // High-priority notification options to force OS visibility
    const options = {
        body: data.body,
        icon: 'https://cdn-icons-png.flaticon.com/512/733/733579.png', // Guaranteed icon
        data: {
            url: data.url || '/'
        },
        tag: 'accord-' + Date.now(), // Force individual appearance
        renotify: true,
        requireInteraction: true,
        vibrate: [200, 100, 200, 100, 200],
        timestamp: Date.now(),
        silent: false
    };

    event.waitUntil(
        self.registration.showNotification(data.title, options)
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const url = event.notification.data?.url || '/';

    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
            for (const client of clients) {
                if (client.url.includes(self.location.origin)) {
                    return client.navigate(url).then(c => c.focus());
                }
            }
            if (self.clients.openWindow) return self.clients.openWindow(url);
        })
    );
});