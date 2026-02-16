import { useEffect } from 'react';
import { useChatStore } from '../store/useChatStore';

export const usePwaBadging = () => {
  const unreadCount = useChatStore((state) => state.unreadChannels.length);

  useEffect(() => {
    const syncBadgeToDB = async () => {
      try {
        const request = indexedDB.open('AccordBadgeDB', 2);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains('badge')) db.createObjectStore('badge');
          if (!db.objectStoreNames.contains('unreadChannels')) db.createObjectStore('unreadChannels');
        };

        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction('badge', 'readwrite');
          tx.objectStore('badge').put(unreadCount, 'unreadCount');
        };
      } catch (e) {
        console.error('Failed to sync badge to IndexedDB', e);
      }

      if ('setAppBadge' in navigator) {
        if (unreadCount > 0) {
          (navigator as any).setAppBadge(unreadCount).catch(() => {});
        } else {
          (navigator as any).clearAppBadge().catch(() => {});
        }
      }
    };

    syncBadgeToDB();
  }, [unreadCount]);
};
