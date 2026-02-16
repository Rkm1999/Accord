import { initializeApp } from 'firebase/app';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import { apiClient } from './api';
import { getPlatform } from './config';
import { useAuthStore } from '../store/useAuthStore';

let messaging: any = null;
let vapidKey: string | null = null;

async function initFirebase() {
  if (messaging) return messaging;
  try {
    const config: any = await apiClient.getAppConfig();
    const app = initializeApp(config.firebaseConfig);
    messaging = getMessaging(app);
    vapidKey = config.vapidKey;

    onMessage(messaging, (payload: any) => {
      console.log('Push message received in foreground:', payload);
    });

    return messaging;
  } catch (err) {
    console.error('Failed to initialize Firebase Messaging:', err);
    return null;
  }
}

async function waitForServiceWorkerActive(registration: ServiceWorkerRegistration): Promise<ServiceWorker> {
  if (registration.active) return registration.active;
  
  const worker = registration.installing || registration.waiting;
  if (!worker) throw new Error('No service worker available');

  return new Promise((resolve) => {
    worker.addEventListener('statechange', (e: any) => {
      if (e.target.state === 'active') resolve(registration.active!);
    });
  });
}

export async function requestPushPermission() {
  try {
    console.log('Requesting push permission...');
    const m = await initFirebase();
    if (!m) {
      console.error('Firebase not initialized');
      return;
    }

    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      console.log('Notification permission granted.');
      
      const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
        scope: '/firebase-cloud-messaging-push-scope'
      });
      
      console.log('Firebase SW registered, waiting for activation...');
      await waitForServiceWorkerActive(registration);
      console.log('Firebase SW is active.');

      const token = await getToken(m, { 
        vapidKey: vapidKey || undefined,
        serviceWorkerRegistration: registration
      });
      
      if (token) {
        console.log('FCM Token generated:', token);
        await registerTokenOnServer(token);
      } else {
        console.warn('No token received');
      }
    } else {
      console.warn('Notification permission denied:', permission);
    }
  } catch (err) {
    console.error('An error occurred while requesting push permission:', err);
  }
}

async function registerTokenOnServer(token: string) {
  const { username, setFcmToken } = useAuthStore.getState();
  if (!username) return;
  const platform = getPlatform();

  try {
    await apiClient.pushRegister(username, token, platform);
    setFcmToken(token);
    localStorage.setItem('pushEnabled', 'true');
  } catch (err) {
    console.error('Failed to register push token on server:', err);
  }
}

export async function initPushSync() {
  const { username, fcmToken } = useAuthStore.getState();
  if (username && localStorage.getItem('pushEnabled') !== 'false') {
    console.log('Starting push sync...');
    // Delay sync to ensure SW is ready and not block initial load
    setTimeout(async () => {
      try {
        const m = await initFirebase();
        if (!m) return;

        const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
          scope: '/firebase-cloud-messaging-push-scope'
        });

        await waitForServiceWorkerActive(registration);

        const token = await getToken(m, { 
          vapidKey: vapidKey || undefined,
          serviceWorkerRegistration: registration
        });
        
        if (token) {
          console.log('Push sync: token retrieved');
          await registerTokenOnServer(token);
        } else if (!fcmToken) {
          console.log('Push sync: no token, requesting permission');
          await requestPushPermission();
        }
      } catch (e) {
        console.log('Push sync skipped:', e);
      }
    }, 5000);
  }
}

export async function togglePushNotifications(enabled: boolean) {
  const { username, fcmToken, setFcmToken } = useAuthStore.getState();
  if (enabled) {
    localStorage.setItem('pushEnabled', 'true');
    await requestPushPermission();
  } else {
    localStorage.setItem('pushEnabled', 'false');
    if (fcmToken && username) {
      try {
        await apiClient.pushUnregister(username, fcmToken);
        setFcmToken(null);
      } catch (e) { 
        console.error('Failed to unregister push token', e); 
      }
    }
  }
}
