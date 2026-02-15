import { state, updateState } from '../state.js';
import { isIOS } from '../config.js';

/**
 * Sets up listeners for the Visual Viewport API.
 * Essential for handling mobile keyboard layout shifts, especially on iOS.
 */
export function setupViewportHandlers() {
    if (!window.visualViewport) return;

    const handleViewportChange = () => {
        const container = document.getElementById('messages-container');
        const oldHeight = container ? container.clientHeight : 0;
        const oldScrollTop = container ? container.scrollTop : 0;

        const app = document.getElementById('app');
        if (!app) return;

        const height = window.visualViewport.height;
        const offsetTop = window.visualViewport.offsetTop;

        // Adjust app height to match visual viewport
        app.style.height = `${height}px`;

        // On iOS, the viewport can be scrolled/offset when the keyboard is open.
        if (isIOS) {
            app.style.transform = `translateY(${offsetTop}px)`;
            window.scrollTo(0, 0);
        }

        // Detect keyboard height for our custom emoji keyboard
        const isInputFocused = document.activeElement && (document.activeElement.id === 'message-input' || document.activeElement.tagName === 'INPUT');
        if (isInputFocused && height < window.innerHeight * 0.9) {
            const detectedHeight = window.innerHeight - height;
            if (detectedHeight > 150) { // Reasonable keyboard height
                updateState({ lastKnownKeyboardHeight: detectedHeight });
            }
        }

        // Adjust all full-screen modals to stay within visual viewport
        const modals = document.querySelectorAll('.fixed.inset-0:not(#app)');
        modals.forEach(modal => {
            modal.style.height = `${height}px`;
            if (isIOS) {
                modal.style.transform = `translateY(${offsetTop}px)`;
            }
        });

        // Preserve scroll position relative to the bottom
        if (container) {
            const newHeight = container.clientHeight;
            container.scrollTop = oldScrollTop + (oldHeight - newHeight);
            updateState({ lastScrollTop: container.scrollTop });
        }

        // Ensure the active input is still visible
        if (document.activeElement && document.activeElement.id === 'message-input') {
            setTimeout(() => {
                document.activeElement.scrollIntoView({ behavior: 'auto', block: 'end' });
            }, 100);
        }
    };

    window.visualViewport.addEventListener('resize', handleViewportChange);
    window.visualViewport.addEventListener('scroll', handleViewportChange);
}
