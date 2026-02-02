const username = localStorage.getItem('chatUsername') || 'Anonymous';
const isLocalDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const wsUrl = isLocalDev
    ? `ws://localhost:8787/ws?username=${encodeURIComponent(username)}`
    : `ws://${window.location.host}/ws?username=${encodeURIComponent(username)}`;
let ws;
let isConnected = false;
let typingTimeout;
let typingUsers = new Set();
let selectedFiles = [];

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

    messages.forEach(msg => {
        if (msg.message || msg.file_name) {
            displayMessage(msg);
        }
    });
}

function displayMessage(data) {
    const chatHistory = document.getElementById('chatHistory');
    const time = new Date(data.timestamp).toLocaleTimeString();
    const msgEl = document.createElement('div');
    msgEl.className = 'message';

    if (data.message) {
        msgEl.innerHTML += `
            <span class="time">${time}</span>
            <span class="username">${escapeHtml(data.username)}:</span>
            <span class="content">${escapeHtml(data.message)}</span>
        `;
    }

    const linkMetadata = data.linkMetadata || {
        url: data.link_url,
        title: data.link_title,
        description: data.link_description,
        image: data.link_image
    };

    if (linkMetadata && linkMetadata.url) {
        const hasImage = !!linkMetadata.image;
        msgEl.innerHTML += `
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

    const fileAttachment = data.fileAttachment || {
        name: data.file_name,
        type: data.file_type,
        size: data.file_size,
        key: data.file_key
    };

    if (fileAttachment && fileAttachment.key) {
        const fileUrl = isLocalDev
            ? `http://localhost:8787/api/file/${fileAttachment.key}`
            : `/api/file/${fileAttachment.key}`;

        if (fileAttachment.type && fileAttachment.type.startsWith('image/')) {
            msgEl.innerHTML += `
                <div class="file-attachment">
                    <img src="${fileUrl}" alt="${escapeHtml(fileAttachment.name)}" class="file-image" onclick="openImageModal('${fileUrl}')" onerror="this.style.display='none'">
                </div>
            `;
        } else {
            msgEl.innerHTML += `
                <a href="${fileUrl}" target="_blank" class="file-attachment">
                    <div class="file-icon">${getFileIcon(fileAttachment.type)}</div>
                    <div class="file-info">
                        <span class="file-name">${escapeHtml(fileAttachment.name)}</span>
                        <span class="file-size">${formatFileSize(fileAttachment.size)}</span>
                    </div>
                </a>
            `;
        }
    }

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

function handleFileSelect(event) {
    const files = Array.from(event.target.files);

    if (files.length === 0) {
        return;
    }

    const currentCount = selectedFiles.length;
    const newCount = currentCount + files.length;

    if (newCount > 10) {
        alert(`You can only upload up to 10 files at a time. Currently selected: ${currentCount}, trying to add: ${files.length}`);
        return;
    }

    const validFiles = [];
    let invalidFiles = false;

    files.forEach(file => {
        if (file.size > 10 * 1024 * 1024) {
            alert(`File "${file.name}" is too large. Maximum size is 10MB per file.`);
            invalidFiles = true;
            return;
        }
        validFiles.push(file);
    });

    if (invalidFiles) {
        return;
    }

    let processedCount = 0;

    validFiles.forEach(file => {
        const reader = new FileReader();
        reader.onload = (e) => {
            selectedFiles.push({
                name: file.name,
                type: file.type,
                data: e.target.result.split(',')[1]
            });
            processedCount++;

            if (processedCount === validFiles.length) {
                showFilePreview();
            }
        };
        reader.readAsDataURL(file);
    });
}

function showFilePreview() {
    const preview = document.getElementById('filePreview');

    if (selectedFiles.length === 0) {
        hideFilePreview();
        return;
    }

    preview.classList.remove('hidden');
    let previewHtml = '';

    selectedFiles.forEach((file, index) => {
        if (file.type.startsWith('image/')) {
            const imageDataUrl = `data:${file.type};base64,${file.data}`;
            previewHtml += `
                <div class="file-preview-item">
                    <img src="${imageDataUrl}" alt="Preview">
                    <span class="file-name">${escapeHtml(file.name)}</span>
                    <button type="button" class="remove-file" onclick="removeFile(${index})">×</button>
                </div>
            `;
        } else {
            previewHtml += `
                <div class="file-preview-item">
                    <div class="file-icon">📄</div>
                    <span class="file-name">${escapeHtml(file.name)}</span>
                    <button type="button" class="remove-file" onclick="removeFile(${index})">×</button>
                </div>
            `;
        }
    });

    preview.innerHTML = previewHtml;
}

function hideFilePreview() {
    const preview = document.getElementById('filePreview');
    preview.classList.add('hidden');
    preview.innerHTML = '';
}

function removeFile(index) {
    selectedFiles.splice(index, 1);

    if (selectedFiles.length === 0) {
        const fileInput = document.getElementById('fileInput');
        fileInput.value = '';
        hideFilePreview();
    } else {
        showFilePreview();
    }
}

window.removeFile = removeFile;

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

function getFileIcon(type) {
    if (!type) return '📄';

    if (type.startsWith('image/')) return '🖼️';
    if (type.startsWith('video/')) return '🎬';
    if (type.startsWith('audio/')) return '🎵';
    if (type.includes('pdf')) return '📕';
    if (type.includes('word') || type.includes('document')) return '📘';
    if (type.includes('excel') || type.includes('spreadsheet')) return '📗';
    if (type.includes('powerpoint') || type.includes('presentation')) return '📙';
    if (type.includes('zip') || type.includes('rar') || type.includes('compressed')) return '📦';
    if (type.includes('text')) return '📝';

    return '📄';
}

document.getElementById('fileInput').addEventListener('change', handleFileSelect);

document.getElementById('chatForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById('message');
    const message = input.value.trim();

    if (!message && selectedFiles.length === 0) return;

    if (isConnected) {
        const filesToSend = [...selectedFiles];

        if (message) {
            const payload = {
                type: 'chat',
                message
            };
            ws.send(JSON.stringify(payload));
            input.value = '';
        }

        for (const file of filesToSend) {
            const payload = {
                type: 'chat',
                message: '',
                file: file
            };
            ws.send(JSON.stringify(payload));
        }

        selectedFiles = [];
        const fileInput = document.getElementById('fileInput');
        fileInput.value = '';
        hideFilePreview();
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

function openImageModal(imageUrl) {
    const modal = document.getElementById('imageModal');
    const modalImg = document.getElementById('imageModalImg');
    modalImg.src = imageUrl;
    modal.classList.remove('hidden');
}

function closeImageModal() {
    const modal = document.getElementById('imageModal');
    modal.classList.add('hidden');
}

window.openImageModal = openImageModal;
window.closeImageModal = closeImageModal;
