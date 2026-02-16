import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getMessaging, getToken, onMessage } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging.js";
import { api } from '../api.js';
import { getPlatform } from '../config.js';
import { state } from '../state.js';

let messaging = null;
let vapidKey = null;

/**
 * Initializes Firebase Messaging using configuration from the server.
 */
async function initFirebase() {
    if (messaging) return messaging;
    try {
        const config = await api.getAppConfig();
        const app = initializeApp(config.firebaseConfig);
        messaging = getMessaging(app);
        vapidKey = config.vapidKey;

        // Handle foreground messages
        onMessage(messaging, (payload) => {
            console.log('Push message received in foreground:', payload);
        });

        return messaging;
    } catch (err) {
        console.error('Failed to initialize Firebase Messaging:', err);
        return null;
    }
}

/**
 * Requests notification permission and registers the FCM token.
 */
export async function requestPushPermission() {
    try {
        const m = await initFirebase();
        if (!m) return;

        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            const registration = await navigator.serviceWorker.ready;
            const token = await getToken(m, { 
                vapidKey,
                serviceWorkerRegistration: registration
            });
            
            if (token) {
                await registerTokenOnServer(token);
            }
        }
    } catch (err) {
        console.error('An error occurred while requesting push permission:', err);
    }
}

/**
 * Registers the FCM token on the backend.
 */
async function registerTokenOnServer(token) {
    if (!state.username) return;
    const platform = getPlatform();

    try {
        await api.pushRegister(state.username, token, platform);
        localStorage.setItem('fcmToken', token);
    } catch (err) {
        console.error('Failed to register push token on server:', err);
    }
}

/**
 * Synchronizes the push token on app start if enabled.
 */
export async function initPushSync() {
    if (state.username && localStorage.getItem('pushEnabled') !== 'false') {
        setTimeout(async () => {
            try {
                const m = await initFirebase();
                const registration = await navigator.serviceWorker.ready;
                const token = await getToken(m, { 
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
}

/**
 * Toggles push notifications on/off and syncs with server.
 */
export async function togglePushNotifications(enabled) {
    if (enabled) {
        localStorage.setItem('pushEnabled', 'true');
        await requestPushPermission();
    } else {
        localStorage.setItem('pushEnabled', 'false');
        const token = localStorage.getItem('fcmToken');
        if (token && state.username) {
            try {
                await api.pushUnregister(state.username, token);
                localStorage.removeItem('fcmToken');
            } catch (e) { console.error('Failed to unregister push token', e); }
        }
    }
}

// Global expose
window.requestPushPermission = requestPushPermission;
window.togglePushNotifications = togglePushNotifications;
