import { state } from '../state.js';

/**
 * Opens (and upgrades if necessary) the IndexedDB used for badge persistence.
 */
export function openBadgeDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('AccordBadgeDB', 2);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains('badge')) db.createObjectStore('badge');
            if (!db.objectStoreNames.contains('unreadChannels')) db.createObjectStore('unreadChannels');
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Updates the app badge count and syncs it to IndexedDB for Service Worker access.
 */
export async function updateAppBadge() {
    if ('setAppBadge' in navigator) {
        const count = state.unreadChannels.size;
        
        try {
            const db = await openBadgeDB();
            const tx = db.transaction('badge', 'readwrite');
            await tx.objectStore('badge').put(count, 'unreadCount');
        } catch (e) {
            console.error('Failed to sync badge count to IndexedDB:', e);
        }

        if (count > 0) {
            navigator.setAppBadge(count).catch(err => console.error('Error setting badge:', err));
        } else {
            navigator.clearAppBadge().catch(err => console.error('Error clearing badge:', err));
        }
    }
}

/**
 * Clears the app badge and resets IndexedDB state.
 */
export async function clearBadge() {
    if ('clearAppBadge' in navigator) {
        navigator.clearAppBadge();
        try {
            const db = await openBadgeDB();
            const tx = db.transaction(['badge', 'unreadChannels'], 'readwrite');
            await tx.objectStore('badge').put(0, 'unreadCount');
            await tx.objectStore('unreadChannels').clear();
        } catch (e) {
            console.error('Failed to clear badge DB:', e);
        }
    }
}

/**
 * Initializes listeners to clear badges on app focus.
 */
export function initBadging() {
    window.addEventListener('load', clearBadge);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') clearBadge();
    });
}
