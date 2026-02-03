let isLogin = true;

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
    
    const icon = submitBtn.querySelector('i');
    if (isLogin) {
        icon.setAttribute('data-lucide', 'log-in');
    } else {
        icon.setAttribute('data-lucide', 'user-plus');
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
            if (isLogin) {
                const data = await response.json();
                localStorage.setItem('chatUsername', data.username);
                localStorage.setItem('displayName', data.displayName);
                localStorage.setItem('avatarKey', data.avatarKey || '');
                window.location.href = 'chat.html';
            } else {
                alert('Registration successful! Please login.');
                isLogin = true;
                toggleAuth.click();
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

document.addEventListener('DOMContentLoaded', () => {
    lucide.createIcons();
});
