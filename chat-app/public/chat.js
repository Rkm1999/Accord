const username = localStorage.getItem('chatUsername') || 'Anonymous';
const isLocalDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const currentChannelId = parseInt(localStorage.getItem('currentChannelId') || '1');
const wsUrl = isLocalDev
    ? `ws://localhost:8787/ws?username=${encodeURIComponent(username)}&channelId=${currentChannelId}`
    : `ws://${window.location.host}/ws?username=${encodeURIComponent(username)}&channelId=${currentChannelId}`;
let ws;
let isConnected = false;
let typingTimeout;
let typingUsers = new Set();
let selectedFiles = [];
let replyingTo = null;
let editingMessageId = null;
let channels = [];

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
            case 'edit':
                if (data.replyFileKey || data.replyFileName || data.replyFileType || data.replyFileSize) {
                    updateMessageEditWithFile(data.messageId, data.newMessage, data.replyFileKey, data.replyFileName, data.replyFileType, data.replyFileSize);
                } else {
                    updateMessageEdit(data.messageId, data.newMessage);
                }
                break;
            case 'delete':
                removeMessageElement(data.messageId);
                break;
            case 'presence':
                updatePresence(data);
                break;
            case 'typing':
                updateTypingIndicator(data);
                break;
            case 'channel_switched':
                console.log(`Switched to channel ${data.channelId}`);
                break;
            case 'error':
                alert(data.message);
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

    const currentChannel = channels.find(c => c.id === currentChannelId);
    const channelName = currentChannel ? `#${currentChannel.name}` : 'Chat';

    document.title = `Chat App - ${channelName}`;

    if (messages.length === 0) {
        showSystemMessage(`No messages yet in ${channelName}. Be the first to say hello!`);
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
    msgEl.id = `msg-${data.id || Date.now()}-${data.username}`;
    const isOwnMessage = data.username === username;

    msgEl.dataset.messageId = data.id || '';
    msgEl.dataset.username = data.username;
    msgEl.dataset.message = data.message || '';
    msgEl.dataset.fileKey = data.file_key || '';
    msgEl.dataset.fileName = data.file_name || '';
    msgEl.dataset.fileType = data.file_type || '';
    msgEl.dataset.fileSize = data.file_size || '';
    msgEl.dataset.replyTo = data.reply_to || '';
    msgEl.dataset.replyUsername = data.reply_username || '';
    msgEl.dataset.replyMessage = data.reply_message || '';
    msgEl.dataset.replyTimestamp = data.reply_timestamp || '';
    msgEl.dataset.replyFileKey = data.reply_file_key || '';
    msgEl.dataset.replyFileName = data.reply_file_name || '';
    msgEl.dataset.replyFileType = data.reply_file_type || '';
    msgEl.dataset.replyFileSize = data.reply_file_size || '';

    // Message Content
    if (data.message) {
        msgEl.innerHTML += `
            <span class="time">${time}</span>
            <span class="username">${escapeHtml(data.username)}:</span>
            <span class="content">${escapeHtml(data.message)}${data.is_edited ? ' <span class="edited">(edited)</span>' : ''}</span>
        `;
    } else if (data.file_key) {
        msgEl.innerHTML += `
            <span class="time">${time}</span>
            <span class="username">${escapeHtml(data.username)}:</span>
        `;
    } else {
        return;
    }

    // Link Metadata
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

    // File Attachments (Main Message)
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

    // Reply Logic
    if (data.reply_to) {
        const replyTime = new Date(data.reply_timestamp).toLocaleTimeString();
        const replyFile = data.reply_file_key ? {
            name: data.reply_file_name,
            type: data.reply_file_type,
            size: data.reply_file_size,
            key: data.reply_file_key
        } : null;

        let replyContent = '';

        if (replyFile && replyFile.type && replyFile.type.startsWith('image/')) {
            const replyFileUrl = isLocalDev
                ? `http://localhost:8787/api/file/${replyFile.key}`
                : `/api/file/${replyFile.key}`;
            replyContent += `<div class="file-attachment reply-file"><img src="${replyFileUrl}" alt="${escapeHtml(replyFile.name)}" class="file-image" onclick="openImageModal('${replyFileUrl}')" onerror="this.style.display='none'"></div>`;
        } else if (replyFile) {
            const replyFileUrl = isLocalDev
                ? `http://localhost:8787/api/file/${replyFile.key}`
                : `/api/file/${replyFile.key}`;
            replyContent += `<a href="${replyFileUrl}" target="_blank" class="file-attachment reply-file"><div class="file-icon">${getFileIcon(replyFile.type)}</div><div class="file-info"><span class="file-name">${escapeHtml(replyFile.name)}</span><span class="file-size">${formatFileSize(replyFile.size)}</span></div></a>`;
        }

        if (data.reply_message) {
            replyContent += `<div class="reply-message">${escapeHtml(data.reply_message)}</div>`;
        }

        msgEl.innerHTML += `
            <div class="reply-info">
                <div class="reply-header">
                    <span class="reply-username">${escapeHtml(data.reply_username)}</span>
                    <span class="reply-time">${replyTime}</span>
                </div>
                ${replyContent}
            </div>
        `;
    }

    // Message Actions
    msgEl.innerHTML += `
        <div class="message-actions">
            ${isOwnMessage ? `
                <button type="button" class="action-btn" onclick="startReply(${data.id})">↩</button>
                <button type="button" class="action-btn" onclick="openEditModal(${data.id})">✎</button>
                <button type="button" class="action-btn" onclick="deleteMessage(this)">🗑</button>
            ` : `
                <button type="button" class="action-btn" onclick="startReply(${data.id})">↩</button>
            `}
        </div>
    `;

    chatHistory.appendChild(msgEl);
    chatHistory.scrollTop = chatHistory.scrollHeight;
}

function startReply(messageId) {
    const msgEl = document.querySelector(`[data-message-id="${messageId}"]`);
    if (!msgEl) return;

    const replyUsername = msgEl.dataset.username;
    const replyMessage = msgEl.dataset.message;
    const replyFileKey = msgEl.dataset.fileKey;
    const replyFileName = msgEl.dataset.fileName;
    const replyFileType = msgEl.dataset.fileType;
    const replyFileSize = msgEl.dataset.fileSize;

    replyingTo = {
        messageId,
        replyUsername,
        replyMessage,
        replyFileKey,
        replyFileName,
        replyFileType,
        replyFileSize,
        replyTimestamp: Date.now() // added missing timestamp
    };

    const replyBanner = document.getElementById('replyBanner');
    const replyToUsernameEl = document.getElementById('replyToUsername');
    replyToUsernameEl.textContent = replyUsername;
    replyBanner.classList.remove('hidden');

    const messageInput = document.getElementById('message');
    messageInput.focus();
}

function cancelReply() {
    replyingTo = null;
    const replyBanner = document.getElementById('replyBanner');
    replyBanner.classList.add('hidden');
}

function openEditModal(messageId) {
    const msgEl = document.querySelector(`[data-message-id="${messageId}"]`);
    if (!msgEl) return;

    const currentMessage = msgEl.dataset.message;

    editingMessageId = messageId;

    const editModal = document.getElementById('editModal');
    const editInput = document.getElementById('editMessageInput');
    editInput.value = currentMessage;
    // Store data on modal if needed, though usually not required if we have ID
    editModal.dataset.replyFileKey = msgEl.dataset.replyFileKey;
    editModal.dataset.replyFileName = msgEl.dataset.replyFileName;
    editModal.dataset.replyFileType = msgEl.dataset.replyFileType;
    editModal.dataset.replyFileSize = msgEl.dataset.replyFileSize;
    
    editModal.classList.remove('hidden');
}

function closeEditModal(event) {
    if (event && event.target !== event.currentTarget && event.target !== document.getElementById('editModal')) {
        return;
    }

    editingMessageId = null;

    const editModal = document.getElementById('editModal');
    editModal.classList.add('hidden');
}

function saveEdit() {
    const editInput = document.getElementById('editMessageInput');
    const newMessage = editInput.value.trim();

    if (!newMessage) {
        alert('Message cannot be empty');
        return;
    }

    if (isConnected) {
        ws.send(JSON.stringify({
            type: 'edit',
            messageId: editingMessageId,
            newMessage
        }));
        closeEditModal();
    }
}

function deleteMessage(buttonOrId) {
    // Handle both button element or direct ID
    let messageId;
    if (typeof buttonOrId === 'object') {
        const msgEl = buttonOrId.closest('.message');
        messageId = msgEl?.dataset.messageId;
    } else {
        messageId = buttonOrId;
    }

    if (!messageId) {
        return;
    }

    if (!confirm('Are you sure you want to delete this message?')) {
        return;
    }

    if (isConnected) {
        ws.send(JSON.stringify({
            type: 'delete',
            messageId: parseInt(messageId)
        }));
    }
}

function updateMessageEdit(messageId, newMessage) {
    let msgEl = document.getElementById(`msg-${messageId}-${username}`);
    if (!msgEl) {
        msgEl = document.querySelector(`[data-message-id="${messageId}"]`);
    }

    if (msgEl) {
        msgEl.dataset.message = newMessage;

        const contentEl = msgEl.querySelector('.content');
        if (contentEl) {
            contentEl.innerHTML = `${escapeHtml(newMessage)} <span class="edited">(edited)</span>`;
        }
    }
}

function updateMessageEditWithFile(messageId, newMessage, replyKey, replyName, replyType, replySize) {
    let msgEl = document.getElementById(`msg-${messageId}-${username}`);
    if (!msgEl) {
        msgEl = document.querySelector(`[data-message-id="${messageId}"]`);
    }

    if (!msgEl) return;

    if (newMessage) {
        msgEl.dataset.message = newMessage;
        const contentEl = msgEl.querySelector('.content');
        if (contentEl) {
            contentEl.innerHTML = `${escapeHtml(newMessage)} <span class="edited">(edited)</span>`;
        }
    }

    const replyFile = replyKey ? {
        key: replyKey,
        name: replyName,
        type: replyType,
        size: replySize
    } : null;

    const contentEl = msgEl.querySelector('.content');

    // Only append file logic if content element exists or we are handling a specific file scenario
    // (Note: This logic appends to the message. Ensure this doesn't duplicate if called multiple times)
    if (replyFile) {
        // Check if file attachment already exists to prevent duplication could be added here
        
        if (replyFile.type && replyFile.type.startsWith('image/')) {
            const replyFileUrl = isLocalDev
                ? `http://localhost:8787/api/file/${replyFile.key}`
                : `/api/file/${replyFile.key}`;
            msgEl.innerHTML += `
                <div class="file-attachment reply-file">
                    <img src="${replyFileUrl}" alt="${escapeHtml(replyFile.name)}" class="file-image" onclick="openImageModal('${replyFileUrl}')" onerror="this.style.display='none'">
                </div>
            `;
        } else if (replyFile.type) {
            const replyFileUrl = isLocalDev
                ? `http://localhost:8787/api/file/${replyFile.key}`
                : `/api/file/${replyFile.key}`;
            msgEl.innerHTML += `
                <a href="${replyFileUrl}" target="_blank" class="file-attachment reply-file">
                    <div class="file-icon">${getFileIcon(replyFile.type)}</div>
                    <div class="file-info">
                        <span class="file-name">${escapeHtml(replyFile.name)}</span>
                        <span class="file-size">${formatFileSize(replyFile.size)}</span>
                    </div>
                </a>
            `;
        }
    }
}


function removeMessageElement(messageId) {
    // Select by ID or Data Attribute to be safe
    let msgEl = document.getElementById(`msg-${messageId}-${username}`);
    if (!msgEl) {
        msgEl = document.querySelector(`[data-message-id="${messageId}"]`);
    }
    
    if (msgEl) {
        msgEl.remove();
    }
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function updatePresence(data) {
    const userCount = document.getElementById('userCount');
    // const userList = document.getElementById('userList'); // Unused

    if (data.userCount !== undefined && userCount) {
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
    if (!userList) return;
    
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
    if (!userList) return;

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
    }, 30000); // Note: 30s is a long timeout for typing, usually 3-5s is better
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

// Make globally available for onclick handlers
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

// Event Listeners
const fileInputEl = document.getElementById('fileInput');
if (fileInputEl) {
    fileInputEl.addEventListener('change', handleFileSelect);
}

const chatFormEl = document.getElementById('chatForm');
if (chatFormEl) {
    chatFormEl.addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = document.getElementById('message');
        const message = input.value.trim();

        if (!message && selectedFiles.length === 0) return;

        if (isConnected) {
            const filesToSend = [...selectedFiles];
            const payload = {
                type: 'chat',
                message
            };

            if (replyingTo) {
                payload.replyTo = replyingTo.messageId;
                payload.replyUsername = replyingTo.replyUsername;
                payload.replyMessage = replyingTo.replyMessage;
                payload.replyTimestamp = Date.now();
            }

            if (message) {
                ws.send(JSON.stringify(payload));
                input.value = '';
            }

            for (const file of filesToSend) {
                const filePayload = {
                    type: 'chat',
                    message: '',
                    file
                };

                if (replyingTo) {
                    filePayload.replyTo = replyingTo.messageId;
                    filePayload.replyUsername = replyingTo.replyUsername;
                    filePayload.replyMessage = replyingTo.replyMessage;
                    filePayload.replyTimestamp = replyingTo.replyTimestamp;
                }

                ws.send(JSON.stringify(filePayload));
            }

            selectedFiles = [];
            const fileInput = document.getElementById('fileInput');
            fileInput.value = '';
            hideFilePreview();
            cancelReply();
            sendTypingStatus(false);
        }
    });
}

const messageInputEl = document.getElementById('message');
if (messageInputEl) {
    messageInputEl.addEventListener('input', handleTyping);
    messageInputEl.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            const form = document.getElementById('chatForm');
            if (form) form.dispatchEvent(new Event('submit'));
        }
    });
}

const leaveBtnEl = document.getElementById('leaveBtn');
if (leaveBtnEl) {
    leaveBtnEl.addEventListener('click', () => {
        if (ws) {
            ws.close(1000, 'User left');
        }
        localStorage.removeItem('chatUsername');
        window.location.href = 'index.html';
    });
}

const createChannelBtnEl = document.getElementById('createChannelBtn');
if (createChannelBtnEl) {
    createChannelBtnEl.addEventListener('click', openCreateChannelModal);
}

document.addEventListener('DOMContentLoaded', () => {
    console.log(`Connecting as: ${username} to channel ${currentChannelId}`);
    fetchChannels();
    connect();
});

function openImageModal(imageUrl) {
    const modal = document.getElementById('imageModal');
    const modalImg = document.getElementById('imageModalImg');
    if (modal && modalImg) {
        modalImg.src = imageUrl;
        modal.classList.remove('hidden');
    }
}

function closeImageModal() {
    const modal = document.getElementById('imageModal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

async function fetchChannels() {
    try {
        const apiUrl = isLocalDev
            ? 'http://localhost:8787/api/channels'
            : '/api/channels';
        const response = await fetch(apiUrl);
        channels = await response.json();
        displayChannels();
    } catch (error) {
        console.error('Error fetching channels:', error);
    }
}

function displayChannels() {
    const channelList = document.getElementById('channelList');
    if (!channelList) return;

    channelList.innerHTML = '';

    channels.forEach(channel => {
        const channelEl = document.createElement('div');
        channelEl.className = 'channel-item';
        if (channel.id === currentChannelId) {
            channelEl.classList.add('active');
        }

        channelEl.innerHTML = `
            <span class="channel-name"># ${escapeHtml(channel.name)}</span>
            ${channel.id !== 1 ? `
                <div class="channel-actions">
                    <button class="delete-channel-btn" onclick="deleteChannel(${channel.id})">🗑</button>
                </div>
            ` : ''}
        `;

        channelEl.addEventListener('click', (e) => {
            if (!e.target.classList.contains('delete-channel-btn')) {
                switchChannel(channel.id);
            }
        });

        channelList.appendChild(channelEl);
    });
}

function switchChannel(channelId) {
    if (channelId === currentChannelId) return;

    localStorage.setItem('currentChannelId', channelId);
    window.location.reload();
}

function openCreateChannelModal() {
    const modal = document.getElementById('createChannelModal');
    const input = document.getElementById('newChannelName');
    input.value = '';
    modal.classList.remove('hidden');
    input.focus();
}

function closeCreateChannelModal() {
    const modal = document.getElementById('createChannelModal');
    modal.classList.add('hidden');
}

async function createChannel() {
    const input = document.getElementById('newChannelName');
    const channelName = input.value.trim();

    if (!channelName) {
        alert('Channel name cannot be empty');
        return;
    }

    try {
        const apiUrl = isLocalDev
            ? 'http://localhost:8787/api/channels'
            : '/api/channels';
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                name: channelName,
                createdBy: username,
            }),
        });

        if (response.ok) {
            closeCreateChannelModal();
            await fetchChannels();
        } else if (response.status === 409) {
            alert('Channel name already exists');
        } else {
            alert('Failed to create channel');
        }
    } catch (error) {
        console.error('Error creating channel:', error);
        alert('Failed to create channel');
    }
}

async function deleteChannel(channelId) {
    if (!confirm('Are you sure you want to delete this channel? All messages in this channel will be deleted.')) {
        return;
    }

    try {
        const apiUrl = isLocalDev
            ? `http://localhost:8787/api/channels/${channelId}`
            : `/api/channels/${channelId}`;

        const response = await fetch(apiUrl, {
            method: 'DELETE',
        });

        if (response.ok) {
            if (currentChannelId === channelId) {
                localStorage.setItem('currentChannelId', '1');
                window.location.reload();
            } else {
                await fetchChannels();
            }
        } else {
            alert('Failed to delete channel');
        }
    } catch (error) {
        console.error('Error deleting channel:', error);
        alert('Failed to delete channel');
    }
}

window.openCreateChannelModal = openCreateChannelModal;
window.closeCreateChannelModal = closeCreateChannelModal;
window.createChannel = createChannel;
window.deleteChannel = deleteChannel;

// Global scope binding for HTML inline events
window.openImageModal = openImageModal;
window.closeImageModal = closeImageModal;
window.startReply = startReply;
window.cancelReply = cancelReply;
window.openEditModal = openEditModal;
window.closeEditModal = closeEditModal;
window.saveEdit = saveEdit;
window.deleteMessage = deleteMessage;