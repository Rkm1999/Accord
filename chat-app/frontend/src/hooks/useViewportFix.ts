import { useEffect } from 'react';
import { isIOS } from '../lib/config';
import { useUIStore } from '../store/useUIStore';

/**
 * Sets up listeners for the Visual Viewport API.
 * Essential for handling mobile keyboard layout shifts, especially on iOS.
 */
export const useViewportFix = () => {
  const setKeyboardHeight = useUIStore((state) => state.setKeyboardHeight);

  useEffect(() => {
    if (!window.visualViewport) return;

    const handleViewportChange = () => {
      const app = document.getElementById('root'); 
      if (!app) return;

      const height = window.visualViewport!.height;
      const offsetTop = window.visualViewport!.offsetTop;

      // Adjust app height to match visual viewport
      app.style.height = `${height}px`;

      // On iOS, the viewport can be scrolled/offset when the keyboard is open.
      if (isIOS) {
        app.style.transform = `translateY(${offsetTop}px)`;
        window.scrollTo(0, 0);
      }

      // Detect keyboard height for our custom emoji keyboard
      const isInputFocused = document.activeElement && (
        document.activeElement.id === 'message-input' || 
        document.activeElement.tagName === 'INPUT' ||
        document.activeElement.tagName === 'TEXTAREA'
      );
      
      if (isInputFocused && height < window.innerHeight * 0.9) {
        const detectedHeight = window.innerHeight - height;
        if (detectedHeight > 150) { // Reasonable keyboard height
          setKeyboardHeight(detectedHeight);
        }
      }

      // Adjust all full-screen modals to stay within visual viewport
      const modals = document.querySelectorAll<HTMLElement>('.fixed.inset-0:not(#root)');
      modals.forEach(modal => {
        modal.style.height = `${height}px`;
        if (isIOS) {
          modal.style.transform = `translateY(${offsetTop}px)`;
        }
      });
    };

    window.visualViewport.addEventListener('resize', handleViewportChange);
    window.visualViewport.addEventListener('scroll', handleViewportChange);
    
    // Initial run
    handleViewportChange();

    return () => {
      window.visualViewport?.removeEventListener('resize', handleViewportChange);
      window.visualViewport?.removeEventListener('scroll', handleViewportChange);
    };
  }, [setKeyboardHeight]);
};
