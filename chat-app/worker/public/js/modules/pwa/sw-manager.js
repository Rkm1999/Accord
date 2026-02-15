/**
 * Manages Service Worker registration, updates, and PWA installation logic.
 */

let deferredPrompt;

/**
 * Registers the service worker and sets up update handling.
 */
export function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/firebase-messaging-sw.js').then(reg => {
                console.log('Service Worker registered');

                // Check for updates on load
                if (reg.waiting) {
                    showUpdatePrompt(reg.waiting);
                }

                reg.addEventListener('updatefound', () => {
                    const newWorker = reg.installing;
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            showUpdatePrompt(newWorker);
                        }
                    });
                });
            }).catch(err => console.log('Service Worker registration failed', err));

            // Reload page when new SW takes control
            navigator.serviceWorker.addEventListener('controllerchange', () => {
                window.location.reload();
            });
        });
    }
}

/**
 * Shows a prompt when a new version of the service worker is available.
 */
function showUpdatePrompt(worker) {
    const prompt = document.getElementById('pwaUpdatePrompt');
    const btn = document.getElementById('pwaUpdateBtn');

    if (prompt && btn) {
        prompt.classList.remove('hidden');
        prompt.style.display = 'flex';
        btn.onclick = () => {
            worker.postMessage({ type: 'SKIP_WAITING' });
            btn.disabled = true;
            btn.textContent = 'Updating...';
        };
    }
}

/**
 * Initializes PWA installation prompts and detection.
 */
export function initPwaInstallation() {
    const pwaPrompt = document.getElementById('pwaInstallPrompt');
    const installBtn = document.getElementById('pwaInstallBtn');
    const iosInstruction = document.getElementById('iosInstruction');

    if (!pwaPrompt) return;

    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || localStorage.getItem('debug_pwa') === 'true';
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone || document.referrer.includes('android-app://');

    // Don't show if already installed
    if (isStandalone) {
        pwaPrompt.style.display = 'none';
        return;
    }

    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

    window.addEventListener('beforeinstallprompt', (e) => {
        console.log('beforeinstallprompt event fired');
        e.preventDefault();
        deferredPrompt = e;

        if (isMobile) {
            pwaPrompt.style.display = 'flex';
            if (installBtn) installBtn.classList.remove('hidden');
        }
    });

    // iOS specific handling
    if (isIOS && isMobile) {
        setTimeout(() => {
            if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) return;
            pwaPrompt.style.display = 'flex';
            if (iosInstruction) iosInstruction.classList.remove('hidden');
            if (window.lucide) window.lucide.createIcons();
        }, 3000);
    }

    // Debug mode
    if (localStorage.getItem('debug_pwa') === 'true') {
        setTimeout(() => {
            if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) return;
            pwaPrompt.style.display = 'flex';
            if (installBtn) installBtn.classList.remove('hidden');
            if (window.lucide) window.lucide.createIcons();
        }, 1000);
    }

    // Click handler for install button
    document.addEventListener('click', async (e) => {
        if (e.target.id === 'pwaInstallBtn' || e.target.closest('#pwaInstallBtn')) {
            if (!deferredPrompt) {
                alert('Please use your browser menu to install this app.');
                return;
            }
            deferredPrompt.prompt();
            await deferredPrompt.userChoice;
            deferredPrompt = null;
            closePwaPrompt();
        }
    });

    document.getElementById('closePwaPromptBtn')?.addEventListener('click', closePwaPrompt);
}

export function closePwaPrompt() {
    const pwaPrompt = document.getElementById('pwaInstallPrompt');
    if (pwaPrompt) pwaPrompt.style.display = 'none';
}

// Global exposes
window.closePwaPrompt = closePwaPrompt;
