import { api } from '../api.js';
import { state, setUserIdentity } from '../state.js';

let isLogin = true;

/**
 * Handles user logout.
 */
export async function logout() {
    if (confirm('Do you want to logout?')) {
        const token = localStorage.getItem('fcmToken');
        if (token && state.username) {
            try {
                await api.pushUnregister(state.username, token);
            } catch (e) { console.error('Failed to unregister push token', e); }
        }
        localStorage.removeItem('chatUsername');
        localStorage.removeItem('displayName');
        localStorage.removeItem('avatarKey');
        localStorage.removeItem('fcmToken');
        window.location.replace('/');
    }
}

/**
 * Initializes authentication UI listeners for the landing page.
 */
export function initAuthUI() {
    const authForm = document.getElementById('authForm');
    const toggleAuth = document.getElementById('toggleAuth');
    const title = document.getElementById('title');
    const subtitle = document.getElementById('subtitle');
    const btnText = document.getElementById('btnText');
    const toggleText = document.getElementById('toggleText');
    const submitBtn = document.getElementById('submitBtn');

    const resetForm = document.getElementById('resetForm');
    const resetKeyInput = document.getElementById('resetKey');

    if (!authForm) return;

    // Toggle between Login and Register
    toggleAuth.addEventListener('click', () => {
        isLogin = !isLogin;
        title.textContent = isLogin ? 'Welcome back!' : 'Create an account';
        subtitle.textContent = isLogin ? "We're so excited to see you again!" : 'Join the conversation today';
        btnText.textContent = isLogin ? 'Login' : 'Register';
        toggleText.textContent = isLogin ? 'Need an account?' : 'Already have an account?';
        toggleAuth.textContent = isLogin ? 'Register' : 'Login';

        const icon = submitBtn.querySelector('[data-lucide]') || submitBtn.querySelector('svg');
        if (icon) {
            if (isLogin) {
                icon.setAttribute('data-lucide', 'log-in');
            } else {
                icon.setAttribute('data-lucide', 'user-plus');
            }
        }
        if (window.lucide) lucide.createIcons();
    });

    // Handle Login/Register submission
    authForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value;

        if (!username || !password) return;

        try {
            const data = isLogin
                ? await api.login(username, password)
                : await api.register(username, password);

            if (isLogin) {
                setUserIdentity(data);
                window.location.href = '/chat';
            } else {
                if (data.recoveryKey) {
                    showRecoveryKey(data.recoveryKey);
                } else {
                    alert('Registration successful! Please login.');
                    isLogin = true;
                    toggleAuth.click();
                }
            }
        } catch (error) {
            console.error('Auth error:', error);
            alert(error.message || 'Authentication failed');
        }
    });

    // Recovery Key UI Logic
    window.closeRecoveryModal = () => {
        document.getElementById('recoveryModal').classList.add('hidden');
        isLogin = true;
        if (!isLogin) toggleAuth.click(); // Ensure we are on login mode
    };

    window.copyRecoveryKey = () => {
        const key = document.getElementById('recoveryKeyDisplay').textContent;
        navigator.clipboard.writeText(key);
        alert('Recovery Key copied to clipboard!');
    };

    // Password Reset UI Logic
    window.openResetModal = () => {
        document.getElementById('resetModal').classList.remove('hidden');
    };

    window.closeResetModal = () => {
        document.getElementById('resetModal').classList.add('hidden');
    };

    if (resetKeyInput) {
        resetKeyInput.addEventListener('input', (e) => {
            let value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
            if (value.length > 12) value = value.slice(0, 12);

            let formatted = '';
            for (let i = 0; i < value.length; i++) {
                if (i > 0 && i % 4 === 0) formatted += '-';
                formatted += value[i];
            }
            e.target.value = formatted;
        });
    }

    if (resetForm) {
        resetForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('resetUsername').value.trim();
            const recoveryKey = document.getElementById('resetKey').value.trim();
            const newPassword = document.getElementById('resetNewPassword').value;

            try {
                await api.resetPassword(username, recoveryKey, newPassword);
                alert('Password reset successful! You can now login with your new password.');
                window.closeResetModal();
            } catch (error) {
                console.error('Reset error:', error);
                alert(error.message || 'Reset failed');
            }
        });
    }

    // New Listeners for cleaned index.html
    document.getElementById('openResetBtn')?.addEventListener('click', () => window.openResetModal());
    document.getElementById('copyRecoveryKeyBtn')?.addEventListener('click', () => window.copyRecoveryKey());
    document.getElementById('closeRecoveryModalBtn')?.addEventListener('click', () => window.closeRecoveryModal());
    document.getElementById('closeResetModalBtn')?.addEventListener('click', () => window.closeResetModal());

    // Backdrop click to close
    document.getElementById('recoveryModal')?.addEventListener('click', (e) => {
        if (e.target.id === 'recoveryModal') window.closeRecoveryModal();
    });
    document.getElementById('resetModal')?.addEventListener('click', (e) => {
        if (e.target.id === 'resetModal') window.closeResetModal();
    });
}

// Global exposes for generated HTML and legacy listeners
window.logout = logout;
window.openUserSettings = logout; // Legacy alias

/**
 * Shows the recovery key modal after registration.
 */
function showRecoveryKey(key) {
    const modal = document.getElementById('recoveryModal');
    const display = document.getElementById('recoveryKeyDisplay');
    if (modal && display) {
        display.textContent = key;
        modal.classList.remove('hidden');
        if (window.lucide) lucide.createIcons();
    }
}
