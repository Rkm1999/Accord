import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getMessaging, getToken, onMessage } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging.js";

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID",
  measurementId: "YOUR_MEASUREMENT_ID"
};

const app = initializeApp(firebaseConfig);
const messaging = getMessaging(app);
const vapidKey = "YOUR_VAPID_PUBLIC_KEY";

export async function requestPushPermission() {
    try {
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

    try {
        await fetch('/api/push/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, token, platform: 'web' })
        });
        localStorage.setItem('fcmToken', token);
    } catch (err) {
        console.error('Failed to register token on server:', err);
    }
}

// Handle foreground messages
onMessage(messaging, (payload) => {
    console.log('Message received. ', payload);
    // You can show a custom toast here if you want
    // But usually we already have real-time websocket messages
});

// Auto request on load if we don't have a token yet
if (localStorage.getItem('chatUsername') && !localStorage.getItem('fcmToken')) {
    // Small delay to not interrupt loading
    setTimeout(requestPushPermission, 5000);
}

window.requestPushPermission = requestPushPermission;
