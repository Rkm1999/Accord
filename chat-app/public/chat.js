const username = localStorage.getItem('chatUsername') || 'Anonymous';
const isLocalDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const wsUrl = isLocalDev
    ? `ws://localhost:8787/ws?username=${encodeURIComponent(username)}`
    : `ws://${window.location.host}/ws?username=${encodeURIComponent(username)}`;
let ws;
let isConnected = false;

function connect() {
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        isConnected = true;
        console.log('Connected to chat server');
        clearSystemMessage();
    };

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);

        switch (data.type) {
            case 'history':
                displayHistory(data.messages);
                break;
            case 'chat':
                displayMessage(data);
                break;
            case 'presence':
                updatePresence(data);
                break;
        }
    };

    ws.onclose = (event) => {
        isConnected = false;
        console.log('Disconnected from chat server', event.code, event.reason);
        showSystemMessage('Disconnected. Reconnecting in 3 seconds...');
        setTimeout(connect, 3000);
    };

    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
    };
}

function clearSystemMessage() {
    const systemMessages = document.querySelectorAll('.system-message');
    systemMessages.forEach(msg => msg.remove());
}

function showSystemMessage(message) {
    const chatHistory = document.getElementById('chatHistory');
    const msgEl = document.createElement('div');
    msgEl.className = 'system-message';
    msgEl.textContent = message;
    chatHistory.appendChild(msgEl);
    chatHistory.scrollTop = chatHistory.scrollHeight;
}

function displayHistory(messages) {
    const chatHistory = document.getElementById('chatHistory');
    chatHistory.innerHTML = '';

    if (messages.length === 0) {
        showSystemMessage('No messages yet. Be the first to say hello!');
        return;
    }

    messages.forEach(msg => displayMessage(msg));
}

function displayMessage(data) {
    const chatHistory = document.getElementById('chatHistory');
    const time = new Date(data.timestamp).toLocaleTimeString();
    const msgEl = document.createElement('div');
    msgEl.className = 'message';
    msgEl.innerHTML = `
        <span class="time">${time}</span>
        <span class="username">${escapeHtml(data.username)}:</span>
        <span class="content">${escapeHtml(data.message)}</span>
    `;
    chatHistory.appendChild(msgEl);
    chatHistory.scrollTop = chatHistory.scrollHeight;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function updatePresence(data) {
    const userCount = document.getElementById('userCount');
    const userList = document.getElementById('userList');

    if (data.userCount !== undefined) {
        userCount.textContent = `${data.userCount} online`;
    }

    if (data.event === 'user_joined') {
        showPresenceMessage(`${escapeHtml(data.username)} joined the chat`);
        addUserToList(data.username);
    } else if (data.event === 'user_left') {
        showPresenceMessage(`${escapeHtml(data.username)} left the chat`, true);
        removeUserFromList(data.username);
    }
}

function showPresenceMessage(message, isLeft = false) {
    const chatHistory = document.getElementById('chatHistory');
    const msgEl = document.createElement('div');
    msgEl.className = `presence-message ${isLeft ? 'user-left' : ''}`;
    msgEl.textContent = message;
    chatHistory.appendChild(msgEl);
    chatHistory.scrollTop = chatHistory.scrollHeight;
}

function addUserToList(username) {
    const userList = document.getElementById('userList');
    const existing = Array.from(userList.children).find(li =>
        li.textContent === username
    );

    if (!existing) {
        const li = document.createElement('li');
        li.textContent = username;
        userList.appendChild(li);
    }
}

function removeUserFromList(username) {
    const userList = document.getElementById('userList');
    const existing = Array.from(userList.children).find(li =>
        li.textContent === username
    );

    if (existing) {
        existing.remove();
    }
}

document.getElementById('chatForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = document.getElementById('message');
    const message = input.value.trim();

    if (message && isConnected) {
        ws.send(message);
        input.value = '';
    }
});

document.getElementById('message').addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        document.getElementById('chatForm').dispatchEvent(new Event('submit'));
    }
});

document.getElementById('leaveBtn').addEventListener('click', () => {
    if (ws) {
        ws.close(1000, 'User left');
    }
    localStorage.removeItem('chatUsername');
    window.location.href = 'index.html';
});

document.addEventListener('DOMContentLoaded', () => {
    console.log(`Connecting as: ${username}`);
    connect();
});
