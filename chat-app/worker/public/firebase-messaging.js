import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getMessaging, getToken, onMessage } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging.js";

async function getFirebaseConfig() {
    const isLocalDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const baseUrl = isLocalDev ? 'http://localhost:8787' : '';
    const response = await fetch(`${baseUrl}/api/config`);
    return await response.json();
}

let messaging = null;
let vapidKey = null;

async function initFirebase() {
    const config = await getFirebaseConfig();
    const app = initializeApp(config.firebaseConfig);
    messaging = getMessaging(app);
    vapidKey = config.vapidKey;

    // Handle foreground messages
    onMessage(messaging, (payload) => {
        console.log('Message received. ', payload);
    });

    return messaging;
}

export async function requestPushPermission() {
    try {
        if (!messaging) await initFirebase();
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            console.log('Notification permission granted.');
            
            // Wait for service worker to be ready to avoid "no active Service Worker" error
            const registration = await navigator.serviceWorker.ready;
            
            const token = await getToken(messaging, { 
                vapidKey,
                serviceWorkerRegistration: registration
            });
            
            if (token) {
                console.log('FCM Token:', token);
                await registerTokenOnServer(token);
            } else {
                console.log('No registration token available. Request permission to generate one.');
            }
        } else {
            console.log('Unable to get permission to notify.');
        }
    } catch (err) {
        console.error('An error occurred while retrieving token. ', err);
    }
}

async function registerTokenOnServer(token) {
    const username = localStorage.getItem('chatUsername');
    if (!username) return;

    // Detect platform specifically to distinguish between devices
    let platform = 'web';
    const ua = navigator.userAgent.toLowerCase();
    if (/ipad/.test(ua)) platform = 'ios-ipad';
    else if (/iphone|ipod/.test(ua)) platform = 'ios-iphone';
    else if (/android/.test(ua)) {
        if (/mobile/.test(ua)) platform = 'android-phone';
        else platform = 'android-tablet';
    }

    try {
        await fetch('/api/push/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, token, platform })
        });
        localStorage.setItem('fcmToken', token);
    } catch (err) {
        console.error('Failed to register token on server:', err);
    }
}

// Auto request/sync on load
if (localStorage.getItem('chatUsername') && localStorage.getItem('pushEnabled') !== 'false') {
    // If we already have a token, just re-register it to sync platform tag
    // If not, request permission
    setTimeout(async () => {
        try {
            if (!messaging) await initFirebase();
            const registration = await navigator.serviceWorker.ready;
            const token = await getToken(messaging, { 
                vapidKey,
                serviceWorkerRegistration: registration
            });
            if (token) {
                await registerTokenOnServer(token);
            } else if (!localStorage.getItem('fcmToken')) {
                await requestPushPermission();
            }
        } catch (e) {
            console.log('Push sync skipped:', e);
        }
    }, 5000);
}

window.requestPushPermission = requestPushPermission;
