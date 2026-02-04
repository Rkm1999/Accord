const CACHE_NAME = 'accord-v' + Date.now();

const CRITICAL_ASSETS = [
  '/',
  '/chat',
  '/style.css',
  '/app.js',
  '/chat.js'
];

// Check if URL is a critical asset that needs network-first
function isCriticalAsset(url) {
    return CRITICAL_ASSETS.some(path => url.includes(path));
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
        if (networkResponse.ok) {
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
    if (networkResponse.ok) {
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
    const url = event.request.url;

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
