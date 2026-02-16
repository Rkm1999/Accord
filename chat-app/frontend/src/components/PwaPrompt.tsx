import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { MessageSquare, RefreshCw, X, Share } from 'lucide-react';
import { isIOS } from '@/lib/config';

export const PwaPrompt = () => {
  const {
    offlineReady: [, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({

    onRegistered(r) {
      console.log('SW Registered: ' + r);
    },
    onRegisterError(error) {
      console.log('SW registration error', error);
    },
  });


  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstall, setShowInstall] = useState(false);

  useEffect(() => {
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    
    const handleBeforeInstall = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      // Only show install banner automatically if on mobile
      if (isMobile) {
        setShowInstall(true);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    // iOS specific handling (doesn't support beforeinstallprompt)
    if (isIOS && !(window.navigator as any).standalone && isMobile) {
      setShowInstall(true);
    }

    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
  }, []);


  const close = () => {
    setOfflineReady(false);
    setNeedRefresh(false);
    setShowInstall(false);
  };

  const handleInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setDeferredPrompt(null);
        setShowInstall(false);
      }
    }
  };

  return (
    <>
      {/* Update Prompt */}
      {needRefresh && (
        <div className="fixed top-4 left-4 right-4 bg-accord-blurple text-white p-4 rounded-xl shadow-2xl z-[300] flex items-center justify-between animate-slide-in">
          <div className="flex items-center gap-3">
            <RefreshCw className="w-5 h-5 animate-spin" />
            <span className="font-semibold text-sm">New version available!</span>
          </div>
          <button 
            onClick={() => updateServiceWorker(true)}
            className="bg-white text-accord-blurple px-4 py-1.5 rounded-lg text-sm font-bold shadow hover:bg-gray-100 transition-colors"
          >
            Update
          </button>
        </div>
      )}

      {/* Install Prompt */}
      {showInstall && (
        <div className="fixed bottom-24 left-4 right-4 lg:left-auto lg:right-6 lg:max-w-xs bg-accord-dark-400 border border-accord-dark-100 p-4 rounded-2xl shadow-2xl z-[200] animate-slide-in">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 bg-accord-blurple rounded-xl flex items-center justify-center shadow-lg">
              <MessageSquare className="text-white w-6 h-6" />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-bold text-white">Accord Chat</h4>
              <p className="text-accord-text-muted text-xs leading-tight">Install for a better experience</p>
            </div>
            <button onClick={close} className="text-accord-text-muted hover:text-white p-1">
              <X className="w-5 h-5" />
            </button>
          </div>
          
          {isIOS ? (
            <div className="text-[13px] text-accord-text-normal border-t border-accord-dark-100 pt-3 flex items-center justify-center gap-1.5">
              Tap the <Share className="w-4 h-4 text-accord-text-link" /> icon and "Add to Home Screen"
            </div>
          ) : (
            <button 
              onClick={handleInstall}
              className="w-full bg-accord-blurple hover:bg-[#4752C4] text-white font-bold py-2.5 rounded-xl text-sm transition-all shadow-lg active:scale-[0.98]"
            >
              Install App
            </button>
          )}
        </div>
      )}
    </>
  );
};
