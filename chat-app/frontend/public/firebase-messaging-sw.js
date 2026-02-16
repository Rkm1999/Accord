// Import Firebase scripts (Compat version for Service Worker)
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

// Initialize Firebase in Service Worker
let firebaseApp = null;
let messaging = null;

// Background message handler
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
        // Fetch config from server
        const response = await fetch('/api/config');
        const config = await response.json();
        
        firebase.initializeApp(config.firebaseConfig);
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

async function showNotification(payload) {
    const notificationTitle = payload.notification ? payload.notification.title : (payload.data?.title || "New Message");
    const notificationOptions = {
        body: payload.notification ? payload.notification.body : (payload.data?.body || ""),
        icon: '/vite.svg', // Use an existing icon from your build
        data: payload.data
    };

    return self.registration.showNotification(notificationTitle, notificationOptions);
}

// Minimal activation logic to take control immediately
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(clients.claim()));
