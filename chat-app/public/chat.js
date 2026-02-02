const username = localStorage.getItem('chatUsername') || 'Anonymous';
const isLocalDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const wsUrl = isLocalDev
    ? `ws://localhost:8787/ws?username=${encodeURIComponent(username)}`
    : `ws://${window.location.host}/ws?username=${encodeURIComponent(username)}`;
let ws;
let isConnected = false;
let typingTimeout;
let typingUsers = new Set();

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
            case 'typing':
                updateTypingIndicator(data);
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

    let messageContent = `
        <span class="time">${time}</span>
        <span class="username">${escapeHtml(data.username)}:</span>
        <span class="content">${escapeHtml(data.message)}</span>
    `;

    const linkMetadata = data.linkMetadata || {
        url: data.link_url,
        title: data.link_title,
        description: data.link_description,
        image: data.link_image
    };

    if (linkMetadata && linkMetadata.url) {
        const hasImage = !!linkMetadata.image;
        messageContent += `
            <a href="${escapeHtml(linkMetadata.url)}" target="_blank" class="link-preview${!hasImage ? ' no-image' : ''}">
                ${hasImage ? `<img src="${escapeHtml(linkMetadata.image)}" alt="Link preview" class="link-preview-image" onerror="this.onerror=null;this.src='https://img.youtube.com/vi/default/0.jpg';">` : ''}
                <div class="link-preview-content">
                    <div class="link-preview-title">${escapeHtml(linkMetadata.title)}</div>
                    ${linkMetadata.description ? `<div class="link-preview-description">${escapeHtml(linkMetadata.description)}</div>` : ''}
                    <div class="link-preview-domain">${escapeHtml(linkMetadata.url)}</div>
                </div>
            </a>
        `;
    }

    msgEl.innerHTML = messageContent;
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

function updateTypingIndicator(data) {
    if (data.username === username) return;

    if (data.isTyping) {
        typingUsers.add(data.username);
    } else {
        typingUsers.delete(data.username);
    }

    showTypingIndicator();
}

function showTypingIndicator() {
    const typingIndicator = document.getElementById('typingIndicator');
    const users = Array.from(typingUsers);

    if (users.length === 0) {
        typingIndicator.innerHTML = '';
        return;
    }

    if (users.length === 1) {
        typingIndicator.innerHTML = `${escapeHtml(users[0])} is typing...`;
    } else if (users.length === 2) {
        typingIndicator.innerHTML = `${escapeHtml(users[0])} and ${escapeHtml(users[1])} are typing...`;
    } else {
        typingIndicator.innerHTML = `${users.length} people are typing...`;
    }
}

function sendTypingStatus(isTyping) {
    if (isConnected) {
        ws.send(JSON.stringify({
            type: 'typing',
            isTyping
        }));
    }
}

function handleTyping() {
    sendTypingStatus(true);

    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        sendTypingStatus(false);
    }, 30000);
}

document.getElementById('chatForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = document.getElementById('message');
    const message = input.value.trim();

    if (message && isConnected) {
        ws.send(JSON.stringify({
            type: 'chat',
            message
        }));
        input.value = '';
        sendTypingStatus(false);
    }
});

document.getElementById('message').addEventListener('input', handleTyping);

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
