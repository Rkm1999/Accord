import { initAuthUI } from './js/modules/ui/auth.js';
import { registerServiceWorker, initPwaInstallation } from './js/modules/pwa/sw-manager.js';

/**
 * Landing Page Module Orchestrator
 */

// Show auth container if not redirecting
window.addEventListener('load', () => {
    if (!localStorage.getItem('chatUsername')) {
        const loading = document.getElementById('loading-overlay');
        const container = document.getElementById('auth-container');
        if (loading) loading.style.display = 'none';
        if (container) container.classList.add('opacity-100');
    }
});

// Initialize PWA and Auth UI
registerServiceWorker();
initPwaInstallation();
initAuthUI();

console.log('Accord Landing Page initialized.');
