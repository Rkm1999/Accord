let isLogin = true;

// Register Service Worker for PWA
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(reg => console.log('Service Worker registered'))
            .catch(err => console.log('Service Worker registration failed', err));
    });
}

const authForm = document.getElementById('authForm');
const toggleAuth = document.getElementById('toggleAuth');
const title = document.getElementById('title');
const subtitle = document.getElementById('subtitle');
const btnText = document.getElementById('btnText');
const toggleText = document.getElementById('toggleText');
const submitBtn = document.getElementById('submitBtn');

toggleAuth.addEventListener('click', () => {
    isLogin = !isLogin;
    title.textContent = isLogin ? 'Welcome back!' : 'Create an account';
    subtitle.textContent = isLogin ? 'We\'re so excited to see you again!' : 'Join the conversation today';
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
    lucide.createIcons();
});

authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;

    if (!username || !password) return;

    const isLocalDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const baseUrl = isLocalDev ? 'http://localhost:8787' : '';
    const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';

    try {
        const response = await fetch(`${baseUrl}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        if (response.ok) {
            const data = await response.json();
            if (isLogin) {
                localStorage.setItem('chatUsername', data.username);
                localStorage.setItem('displayName', data.displayName);
                localStorage.setItem('avatarKey', data.avatarKey || '');
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
        } else {
            const error = await response.text();
            alert(error || 'Authentication failed');
        }
    } catch (error) {
        console.error('Auth error:', error);
        alert('An error occurred. Please try again.');
    }
});

function showRecoveryKey(key) {
    const modal = document.getElementById('recoveryModal');
    const display = document.getElementById('recoveryKeyDisplay');
    display.textContent = key;
    modal.classList.remove('hidden');
    lucide.createIcons();
}

function closeRecoveryModal() {
    document.getElementById('recoveryModal').classList.add('hidden');
    isLogin = true;
    toggleAuth.click();
}

function copyRecoveryKey() {
    const key = document.getElementById('recoveryKeyDisplay').textContent;
    navigator.clipboard.writeText(key);
    alert('Recovery Key copied to clipboard!');
}

function openResetModal() {
    document.getElementById('resetModal').classList.remove('hidden');
}

function closeResetModal() {
    document.getElementById('resetModal').classList.add('hidden');
}

document.getElementById('resetKey').addEventListener('input', (e) => {
    let value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (value.length > 12) value = value.slice(0, 12);
    
    let formatted = '';
    for (let i = 0; i < value.length; i++) {
        if (i > 0 && i % 4 === 0) formatted += '-';
        formatted += value[i];
    }
    e.target.value = formatted;
});

document.getElementById('resetForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('resetUsername').value.trim();
    const recoveryKey = document.getElementById('resetKey').value.trim();
    const newPassword = document.getElementById('resetNewPassword').value;

    const isLocalDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const baseUrl = isLocalDev ? 'http://localhost:8787' : '';

    try {
        const response = await fetch(`${baseUrl}/api/auth/reset-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, recoveryKey, newPassword })
        });

        if (response.ok) {
            alert('Password reset successful! You can now login with your new password.');
            closeResetModal();
        } else {
            const err = await response.text();
            alert(err || 'Reset failed');
        }
    } catch (error) {
        console.error('Reset error:', error);
    }
});

window.openResetModal = openResetModal;
window.closeResetModal = closeResetModal;
window.closeRecoveryModal = closeRecoveryModal;
window.copyRecoveryKey = copyRecoveryKey;

document.addEventListener('DOMContentLoaded', () => {
    lucide.createIcons();
});
