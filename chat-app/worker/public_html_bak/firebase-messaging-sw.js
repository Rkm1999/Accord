// Import Firebase scripts
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

const CACHE_NAME = 'accord-v' + Date.now();

const CRITICAL_ASSETS = [
  '/',
  '/chat',
  '/style.css',
  '/app.js',
  '/chat.js'
];

// Initialize Firebase in Service Worker
let firebaseApp = null;
let messaging = null;

// Background message handler - MUST be registered at top level synchronously
self.addEventListener('push', (event) => {
    const initPromise = getFirebaseMessaging();
    
    if (event.data) {
        try {
            const data = event.data.json();
            event.waitUntil(Promise.all([initPromise, showNotification(data)]));
        } catch (e) {
            console.error('Error handling push event:', e);
        }
    }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.link) ? event.notification.data.link : '/chat';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(targetUrl) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

async function getFirebaseMessaging() {
    if (messaging) return messaging;
    
    try {
        const response = await fetch('/api/config');
        const config = await response.json();
        firebaseApp = firebase.initializeApp(config.firebaseConfig);
        messaging = firebase.messaging();
        
        messaging.onBackgroundMessage((payload) => {
            console.log('[firebase-messaging-sw.js] Received background message ', payload);
            showNotification(payload);
        });
        
        return messaging;
    } catch (err) {
        console.error('Failed to initialize Firebase in Service Worker:', err);
        return null;
    }
}

// Shared DB logic
function openBadgeDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('AccordBadgeDB', 2);
        request.onupgradeneeded = (e) => {
            const db = request.result;
            if (!db.objectStoreNames.contains('badge')) db.createObjectStore('badge');
            if (!db.objectStoreNames.contains('unreadChannels')) db.createObjectStore('unreadChannels');
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function getAndIncrementBadgeCount(payload) {
    try {
        const db = await openBadgeDB();
        const tx = db.transaction(['badge', 'unreadChannels'], 'readwrite');
        const badgeStore = tx.objectStore('badge');
        const channelStore = tx.objectStore('unreadChannels');
        
        const channelId = payload.data?.channelId;
        const type = payload.data?.notificationType;

        return new Promise((resolve) => {
            const getBadgeReq = badgeStore.get('unreadCount');
            getBadgeReq.onsuccess = () => {
                const currentCount = getBadgeReq.result || 0;
                
                if (type === 'mention') {
                    const newCount = currentCount + 1;
                    badgeStore.put(newCount, 'unreadCount');
                    resolve(newCount);
                } else {
                    const getChannelReq = channelStore.get(channelId);
                    getChannelReq.onsuccess = () => {
                        if (!getChannelReq.result) {
                            const newCount = currentCount + 1;
                            badgeStore.put(newCount, 'unreadCount');
                            channelStore.put(true, channelId);
                            resolve(newCount);
                        } else {
                            resolve(currentCount);
                        }
                    };
                }
            };
        });
    } catch (e) {
        return 1;
    }
}

async function showNotification(payload) {
    const notificationTitle = payload.notification ? payload.notification.title : (payload.data?.title || "New Message");
    const notificationOptions = {
        body: payload.notification ? payload.notification.body : (payload.data?.body || ""),
        icon: '/icons/icon-192x192.png',
        data: payload.data
    };

    const promises = [
        self.registration.showNotification(notificationTitle, notificationOptions)
    ];

    if ('setAppBadge' in self.navigator) {
        promises.push(getAndIncrementBadgeCount(payload).then(count => {
            return self.navigator.setAppBadge(count);
        }).catch(() => {}));
    }

    return Promise.all(promises);
}

// Check if URL is a critical asset that needs network-first
function isCriticalAsset(url) {
    const path = new URL(url).pathname;
    return CRITICAL_ASSETS.includes(path);
}

// Check if URL is a media file (images, uploads)
function isMediaAsset(url) {
    return url.includes('/api/file/');
}

// Network-first: Try network first, fall back to cache if offline
async function networkFirst(request) {
    try {
        const networkResponse = await fetch(request);

        // Update cache with fresh response for next time
        if (networkResponse.ok && request.method === 'GET') {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, networkResponse.clone());
        }
        return networkResponse;
    } catch (error) {
        // Network failed, fall back to cache (offline scenario)
        console.log('Network failed, falling back to cache:', error);
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(request);
        if (cached) {
            return cached;
        }
        // No cache available, throw error
        throw error;
    }
}

// Cache-first: Try cache first, fetch from network if missing
async function cacheFirst(request) {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);

    if (cached) {
        return cached;
    }

    // Not in cache, fetch from network
    const networkResponse = await fetch(request);
    if (networkResponse.ok && request.method === 'GET') {
        cache.put(request, networkResponse.clone());
    }
    return networkResponse;
}

self.addEventListener('install', (event) => {
  // Do NOT skipWaiting automatically. We want to prompt the user.
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(CRITICAL_ASSETS);
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then((keys) => {
        return Promise.all(
          keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
        );
      })
    ])
  );
});

self.addEventListener('fetch', (event) => {
    // Only handle GET requests for caching. 
    // POST/PUT/DELETE should always go directly to the network and are not cacheable.
    if (event.request.method !== 'GET') return;

    const url = event.request.url;

    // IMPORTANT: Ignore file download API. 
    // If the Service Worker intercepts these, iOS PWAs will "lock up" in a preview 
    // instead of showing the native download prompt.
    if (url.includes('/api/file/')) {
        return; // Let the browser handle it natively
    }

    // Skip cross-origin requests
    if (!url.startsWith(self.location.origin)) return;

    // Route based on asset type
    if (isCriticalAsset(url)) {
        // Critical assets: Network-first (always fresh, fall back to cache for offline)
        event.respondWith(networkFirst(event.request));
    } else if (isMediaAsset(url)) {
        // Media assets: Cache-first (permanent caching, fast loading)
        event.respondWith(cacheFirst(event.request));
    } else {
        // API calls and everything else: No caching (always fresh)
        event.respondWith(fetch(event.request));
    }
});
