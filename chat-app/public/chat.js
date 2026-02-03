const username = localStorage.getItem('chatUsername');
if (!username) {
    window.location.href = 'index.html';
}

let displayName = localStorage.getItem('displayName') || username;
let avatarKey = localStorage.getItem('avatarKey') || '';

const currentChannelId = parseInt(localStorage.getItem('currentChannelId') || '1');

const isLocalDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
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
let reactionPickerMessageId = null;
let channels = [];
let customEmojis = [];
let onlineUsers = new Set();


function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    let html = div.innerHTML;

    // Replace custom emojis :name:
    customEmojis.forEach(emoji => {
        const emojiTag = `<img src="${isLocalDev ? 'http://localhost:8787/api/file/' : '/api/file/'}${emoji.file_key}" alt=":${emoji.name}:" title=":${emoji.name}:" class="inline-block w-6 h-6 mx-0.5 align-bottom">`;
        const regex = new RegExp(`:${emoji.name}:`, 'g');
        html = html.replace(regex, emojiTag);
    });

    return html;
}


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

function connect() {
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        isConnected = true;
        console.log('Connected to chat server');
        onlineUsers.add(username);
        renderMembers();
        removeSystemMessage();
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
                updateMessageEdit(data.messageId, data.newMessage);
                break;
            case 'delete':
                removeMessageElement(data.messageId);
                break;
            case 'reaction':
                updateMessageReactions(data.messageId, data.reactions);
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
        onlineUsers.delete(username);
        renderMembers();
        console.log('Disconnected from chat server', event.code, event.reason);
        showSystemMessage('Disconnected. Reconnecting in 3 seconds...');
        setTimeout(connect, 3000);
    };

    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
    };
}

function removeSystemMessage() {
    const systemMessages = document.querySelectorAll('.system-message');
    systemMessages.forEach(msg => msg.remove());
}

function showSystemMessage(message) {
    const messagesContainer = document.getElementById('messages-container');
    const msgEl = document.createElement('div');
    msgEl.className = 'flex items-center justify-center mt-auto mb-6';
    msgEl.innerHTML = `
        <div class="bg-[#404249] text-[#949BA4] text-sm px-4 py-2 rounded-lg">
            ${escapeHtml(message)}
        </div>
    `;
    messagesContainer.appendChild(msgEl);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function displayHistory(messages) {
    const messagesContainer = document.getElementById('messages-container');
    messagesContainer.innerHTML = '';

    const currentChannel = channels.find(c => c.id === currentChannelId);
    const channelName = currentChannel ? `#${currentChannel.name}` : '#general';

    document.title = `Accord - ${channelName}`;
    document.getElementById('header-channel-name').textContent = channelName.substring(1);
    document.getElementById('message-input').placeholder = `Message ${channelName}`;

    if (messages.length === 0) {
        messagesContainer.innerHTML = `
            <div class="mt-auto mb-6">
                <div class="h-16 w-16 bg-[#41434A] rounded-full flex items-center justify-center mb-4 mx-auto">
                    <i data-lucide="hash" class="w-10 h-10 text-white"></i>
                </div>
                <h1 class="text-3xl font-bold mb-2 text-center">Welcome to ${channelName}!</h1>
                <p class="text-[#B5BAC1] text-center">This is start of ${channelName} channel.</p>
            </div>
        `;
        lucide.createIcons();
        return;
    }

    messages.forEach(msg => {
        if (msg.message || msg.file_name) {
            displayMessage(msg, true);
        }
    });

    lucide.createIcons();
}

function displayMessage(data, isHistory = false) {
    const messagesContainer = document.getElementById('messages-container');
    const time = new Date(data.timestamp).toLocaleTimeString();
    const date = new Date(data.timestamp).toLocaleDateString();
    const isOwnMessage = data.username === username;
    const prevMessage = messagesContainer.lastElementChild;
    
    const display_name = data.displayName || data.display_name || data.username;
    const avatar_key = data.avatarKey || data.avatar_key || data.user_avatar;
    
    const avatarUrl = avatar_key 
        ? (isLocalDev ? `http://localhost:8787/api/file/${avatar_key}` : `/api/file/${avatar_key}`)
        : `https://ui-avatars.com/api/?name=${encodeURIComponent(display_name)}&background=random`;

    const linkMetadata = data.linkMetadata || {

        url: data.link_url,
        title: data.link_title,
        description: data.link_description,
        image: data.link_image
    };

    const fileAttachment = data.fileAttachment || {
        name: data.file_name,
        type: data.file_type,
        size: data.file_size,
        key: data.file_key
    };

    let shouldGroup = false;
    if (prevMessage && !isHistory) {
        const prevUsername = prevMessage.dataset.username;
        const prevTimestamp = parseInt(prevMessage.dataset.timestamp);
        const timeDiff = Date.now() - prevTimestamp;
        shouldGroup = prevUsername === data.username && timeDiff < 60000;
    }

    const msgEl = document.createElement('div');
    msgEl.className = `group flex pr-4 hover:bg-[#2e3035] -mx-4 px-4 py-0.5 ${shouldGroup ? 'mt-0' : 'mt-[17px]'} relative message-group`;
    msgEl.dataset.messageId = data.id || '';
    msgEl.dataset.username = data.username;
    msgEl.dataset.timestamp = data.timestamp;

    let messageHtml = '';

    if (!shouldGroup) {
        messageHtml += `
            <div class="mt-0.5 mr-4 cursor-pointer hover:opacity-80 transition-opacity">
                <img src="${avatarUrl}" alt="${escapeHtml(display_name)}" class="w-10 h-10 rounded-full object-cover">
            </div>
            <div class="flex-1 min-w-0">
                <div class="flex items-center">
                    <span class="font-medium mr-2 hover:underline cursor-pointer text-[#dbdee1]">
                        ${escapeHtml(display_name)}
                    </span>
                    <span class="text-xs text-[#949BA4] ml-1">${date} at ${time}</span>
                </div>
        `;

    } else {
        messageHtml += `
            <div class="w-10 mr-4 text-[10px] text-[#949BA4] opacity-0 group-hover:opacity-100 flex items-center justify-end select-none">
                ${time}
            </div>
            <div class="flex-1 min-w-0">
        `;
    }

    if (data.message) {
        messageHtml += `<p class="text-[#dbdee1] whitespace-pre-wrap leading-[1.375rem]">${escapeHtml(data.message)}${data.is_edited ? '<span class="edited-text">(edited)</span>' : ''}</p>`;
    }

    if (linkMetadata && linkMetadata.url) {
        const hasImage = !!linkMetadata.image;
        messageHtml += `
            <a href="${escapeHtml(linkMetadata.url)}" target="_blank" class="block mt-2 ${!hasImage ? 'border-l-2 border-[#5865F2] pl-3' : ''}">
                ${hasImage ? `<img src="${escapeHtml(linkMetadata.image)}" alt="Link preview" class="rounded-lg max-w-full mb-2">` : ''}
                ${linkMetadata.title ? `<div class="text-[#00A8FC] hover:underline font-medium">${escapeHtml(linkMetadata.title)}</div>` : ''}
                ${linkMetadata.description ? `<div class="text-sm text-[#949BA4] mt-1">${escapeHtml(linkMetadata.description)}</div>` : ''}
            </a>
        `;
    }

    if (fileAttachment && fileAttachment.key) {
        const fileUrl = isLocalDev
            ? `http://localhost:8787/api/file/${fileAttachment.key}`
            : `/api/file/${fileAttachment.key}`;

        if (fileAttachment.type && fileAttachment.type.startsWith('image/')) {
            messageHtml += `
                <div class="mt-2">
                    <img src="${fileUrl}" alt="${escapeHtml(fileAttachment.name)}" class="rounded-lg max-w-[300px] cursor-pointer hover:opacity-90" onclick="openImageModal('${fileUrl}')" onerror="this.style.display='none'">
                </div>
            `;
        } else {
            messageHtml += `
                <a href="${fileUrl}" target="_blank" class="flex items-center mt-2 bg-[#2B2D31] hover:bg-[#36383E] p-3 rounded-lg transition-colors">
                    <div class="text-2xl mr-3">${getFileIcon(fileAttachment.type)}</div>
                    <div class="flex-1 min-w-0">
                        <div class="text-[#dbdee1] font-medium truncate">${escapeHtml(fileAttachment.name)}</div>
                        <div class="text-xs text-[#949BA4]">${formatFileSize(fileAttachment.size)}</div>
                    </div>
                </a>
            `;
        }
    }

    if (data.reply_to) {
        const replyTime = new Date(data.reply_timestamp).toLocaleTimeString();
        messageHtml += `
            <div class="mt-2 bg-[#2B2D31] p-2 rounded-lg border-l-2 border-[#5865F2]">
                <div class="flex items-center text-xs text-[#949BA4] mb-1">
                    <i data-lucide="corner-up-right" class="w-3 h-3 mr-1"></i>
                    <span>${escapeHtml(data.reply_username)}</span>
                    <span class="ml-1">${replyTime}</span>
                </div>
                ${data.reply_message ? `<p class="text-sm text-[#dbdee1]">${escapeHtml(data.reply_message)}</p>` : ''}
            </div>
        `;
    }

    // Reactions
    let reactionsHtml = `<div class="reactions-container flex flex-wrap mt-1" id="reactions-${data.id}">`;
    if (data.reactions && data.reactions.length > 0) {
        const grouped = data.reactions.reduce((acc, r) => {
            acc[r.emoji] = acc[r.emoji] || [];
            acc[r.emoji].push(r.username);
            return acc;
        }, {});

        Object.entries(grouped).forEach(([emoji, users]) => {
            const hasReacted = users.includes(username);
            const isCustom = emoji.startsWith(':') && emoji.endsWith(':');
            let emojiDisplay = emoji;

            if (isCustom) {
                const name = emoji.slice(1, -1);
                const customEmoji = customEmojis.find(e => e.name === name);
                if (customEmoji) {
                    emojiDisplay = `<img src="${isLocalDev ? 'http://localhost:8787/api/file/' : '/api/file/'}${customEmoji.file_key}" class="w-4 h-4 inline-block">`;
                }
            }

            reactionsHtml += `
                <div class="reaction-badge ${hasReacted ? 'active' : ''}" onclick="event.stopPropagation(); toggleReaction(${data.id}, '${emoji}')" title="${users.join(', ')}">
                    <span>${emojiDisplay}</span>
                    <span class="reaction-count">${users.length}</span>
                </div>
            `;
        });
    }
    reactionsHtml += '</div>';
    messageHtml += reactionsHtml;

    messageHtml += `
            </div>
            <div class="message-actions absolute right-4 -mt-2 bg-[#313338] shadow-sm border border-[#26272D] rounded flex items-center p-1 z-10">
                <div class="p-1 hover:bg-[#404249] rounded cursor-pointer text-[#B5BAC1] hover:text-[#dbdee1]" onclick="toggleReactionPicker(event, ${data.id})" title="Add Reaction">
                    <i data-lucide="smile" class="w-[18px] h-[18px]"></i>
                </div>
                <div class="p-1 hover:bg-[#404249] rounded cursor-pointer text-[#B5BAC1] hover:text-[#dbdee1]" onclick="startReply(${data.id})" title="Reply">
                    <i data-lucide="reply" class="w-[18px] h-[18px]"></i>
                </div>
                ${isOwnMessage ? `
                    <div class="p-1 hover:bg-[#404249] rounded cursor-pointer text-[#B5BAC1] hover:text-[#dbdee1]" onclick="openEditModal(${data.id})" title="Edit">
                        <i data-lucide="edit-2" class="w-[16px] h-[16px]"></i>
                    </div>
                    <div class="p-1 hover:bg-[#404249] rounded cursor-pointer text-red-400 hover:text-red-500" onclick="deleteMessage(${data.id})" title="Delete">
                        <i data-lucide="trash-2" class="w-[16px] h-[16px]"></i>
                    </div>
                ` : ''}
            </div>
        `;


    msgEl.innerHTML = messageHtml;
    messagesContainer.appendChild(msgEl);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function startReply(messageId) {
    replyingTo = { messageId };

    const replyBanner = document.getElementById('replyBanner');
    const replyToUsernameEl = document.getElementById('reply-to-username');

    const msgEl = document.querySelector(`[data-message-id="${messageId}"]`);
    if (msgEl) {
        replyToUsernameEl.textContent = msgEl.dataset.username;
    } else {
        replyToUsernameEl.textContent = 'Unknown';
    }

    replyBanner.classList.remove('hidden');
    document.getElementById('message-input').focus();
}

function cancelReply() {
    replyingTo = null;
    const replyBanner = document.getElementById('replyBanner');
    replyBanner.classList.add('hidden');
}

function openEditModal(messageId) {
    const msgEl = document.querySelector(`[data-message-id="${messageId}"]`);
    if (!msgEl) return;

    const currentMessage = msgEl.querySelector('p');
    editingMessageId = messageId;

    const editModal = document.getElementById('editModal');
    const editInput = document.getElementById('editMessageInput');

    editInput.value = currentMessage ? currentMessage.textContent.replace('(edited)', '').trim() : '';
    editModal.classList.remove('hidden');
    editInput.focus();
}

function closeEditModal() {
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

function deleteMessage(messageId) {
    if (!confirm('Are you sure you want to delete this message?')) {
        return;
    }

    if (isConnected) {
        ws.send(JSON.stringify({
            type: 'delete',
            messageId
        }));
    }
}

function updateMessageEdit(messageId, newMessage) {
    const msgEl = document.querySelector(`[data-message-id="${messageId}"]`);
    if (!msgEl) return;

    const contentEl = msgEl.querySelector('p');
    if (contentEl) {
        contentEl.innerHTML = `${escapeHtml(newMessage)} <span class="edited-text">(edited)</span>`;
    }
}

function removeMessageElement(messageId) {
    const msgEl = document.querySelector(`[data-message-id="${messageId}"]`);
    if (msgEl) {
        msgEl.remove();
    }
}

function updatePresence(data) {
    const userDisplayName = data.displayName || data.username;
    if (data.event === 'user_joined') {
        onlineUsers.add(JSON.stringify({
            username: data.username,
            displayName: userDisplayName,
            avatarKey: data.avatarKey
        }));
        showPresenceMessage(`${escapeHtml(userDisplayName)} joined the chat`);
    } else if (data.event === 'user_left') {
        // Find and remove user
        for (let userStr of onlineUsers) {
            const user = JSON.parse(userStr);
            if (user.username === data.username) {
                onlineUsers.delete(userStr);
                break;
            }
        }
        showPresenceMessage(`${escapeHtml(userDisplayName)} left the chat`, true);
    }

    renderMembers();
}


function showPresenceMessage(message, isLeft = false) {
    const messagesContainer = document.getElementById('messages-container');
    const msgEl = document.createElement('div');
    msgEl.className = `text-center my-4 ${isLeft ? 'text-red-400' : ''}`;
    msgEl.innerHTML = `<span class="text-sm text-[#949BA4]">${escapeHtml(message)}</span>`;
    messagesContainer.appendChild(msgEl);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
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
    const typingText = document.getElementById('typing-text');
    const users = Array.from(typingUsers);

    if (users.length === 0) {
        typingIndicator.classList.add('hidden');
        return;
    }

    typingIndicator.classList.remove('hidden');

    if (users.length === 1) {
        typingText.textContent = `${escapeHtml(users[0])} is typing...`;
    } else if (users.length === 2) {
        typingText.textContent = `${escapeHtml(users[0])} and ${escapeHtml(users[1])} are typing...`;
    } else {
        typingText.textContent = `${users.length} people are typing...`;
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
    }, 3000);
}

function handleFileSelect(event) {
    const files = Array.from(event.target.files);

    if (files.length === 0) return;

    const newCount = selectedFiles.length + files.length;

    if (newCount > 10) {
        alert(`You can only upload up to 10 files at a time.`);
        return;
    }

    let invalidFiles = false;

    files.forEach(file => {
        if (file.size > 10 * 1024 * 1024) {
            alert(`File "${file.name}" is too large. Maximum size is 10MB per file.`);
            invalidFiles = true;
            return;
        }
    });

    if (invalidFiles) return;

    let processedCount = 0;

    files.forEach(file => {
        const reader = new FileReader();
        reader.onload = (e) => {
            selectedFiles.push({
                name: file.name,
                type: file.type,
                data: e.target.result.split(',')[1]
            });
            processedCount++;

            if (processedCount === files.length) {
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
                <div class="relative group">
                    <img src="${imageDataUrl}" alt="Preview" class="w-16 h-16 rounded-lg object-cover">
                    <button type="button" class="absolute -top-1 -right-1 bg-red-500 hover:bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity" onclick="removeFile(${index})">✕</button>
                </div>
            `;
        } else {
            previewHtml += `
                <div class="relative group bg-[#2B2D31] p-2 rounded-lg">
                    <div class="text-xl">${getFileIcon(file.type)}</div>
                    <button type="button" class="absolute -top-1 -right-1 bg-red-500 hover:bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity" onclick="removeFile(${index})">✕</button>
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

async function fetchCustomEmojis() {
    try {
        const apiUrl = isLocalDev
            ? 'http://localhost:8787/api/emojis'
            : '/api/emojis';
        const response = await fetch(apiUrl);
        customEmojis = await response.json();
    } catch (error) {
        console.error('Error fetching emojis:', error);
    }
}

function displayChannels() {

    const channelsContainer = document.getElementById('channels-container');
    if (!channelsContainer) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'mt-2';

    channels.forEach(channel => {
        const isActive = channel.id === currentChannelId;
        const channelEl = document.createElement('div');
        channelEl.className = `channel-item flex items-center px-2 py-[6px] rounded-[4px] cursor-pointer group mb-[2px] ${isActive ? 'bg-[#404249] text-white' : 'text-[#949BA4] hover:bg-[#35373C] hover:text-[#dbdee1]'}`;
        channelEl.onclick = () => switchChannel(channel.id);

        channelEl.innerHTML = `
            <i data-lucide="hash" class="mr-1.5 w-5 h-5 text-[#80848E] flex-shrink-0"></i>
            <span class="font-medium truncate flex-1">${escapeHtml(channel.name)}</span>
            ${channel.id !== 1 ? `
                <button class="delete-btn ml-auto opacity-0 group-hover:opacity-100 hover:bg-red-500/20 hover:text-red-400 text-[#949BA4] p-1 rounded cursor-pointer" 
                        onclick="event.stopPropagation(); if(confirm('Are you sure you want to delete this channel? All messages in this channel will be deleted.')) deleteChannel(${channel.id})" 
                        title="Delete channel">
                    <i data-lucide="trash-2" class="w-[14px] h-[14px]"></i>
                </button>
            ` : ''}
        `;

        wrapper.appendChild(channelEl);
    });

    channelsContainer.innerHTML = '';
    channelsContainer.appendChild(wrapper);
    lucide.createIcons();
}

function switchChannel(channelId) {
    if (channelId === currentChannelId) return;

    localStorage.setItem('currentChannelId', channelId);
    window.location.reload();
}

let escapeHandler = null;

function openCreateChannelModal() {
    const modal = document.getElementById('createChannelModal');
    const input = document.getElementById('newChannelName');
    input.value = '';
    modal.classList.remove('hidden');
    
    // Remove any error states
    input.classList.remove('ring-2', 'ring-red-500');
    input.placeholder = 'e.g., general, random, announcements';
    
    // Focus input after a brief delay to ensure modal is visible
    setTimeout(() => {
        input.focus();
        input.select();
    }, 100);
    
    // Remove existing handler and add new one
    if (escapeHandler) {
        document.removeEventListener('keydown', escapeHandler);
    }
    
    // Add escape key handler
    escapeHandler = (e) => {
        if (e.key === 'Escape') {
            closeCreateChannelModal();
        }
    };
    document.addEventListener('keydown', escapeHandler);
}

function closeCreateChannelModal() {
    const modal = document.getElementById('createChannelModal');
    const input = document.getElementById('newChannelName');
    
    modal.classList.add('hidden');
    input.value = '';
    input.classList.remove('ring-2', 'ring-red-500');
    
    // Remove escape key listener
    if (escapeHandler) {
        document.removeEventListener('keydown', escapeHandler);
        escapeHandler = null;
    }
}

async function createChannel() {
    const input = document.getElementById('newChannelName');
    const channelName = input.value.trim();
    const createBtn = document.getElementById('createChannelBtn');

    if (!channelName) {
        input.focus();
        input.classList.add('ring-2', 'ring-red-500');
        setTimeout(() => input.classList.remove('ring-2', 'ring-red-500'), 2000);
        return;
    }

    if (channelName.length < 2) {
        input.focus();
        input.classList.add('ring-2', 'ring-red-500');
        setTimeout(() => input.classList.remove('ring-2', 'ring-red-500'), 2000);
        return;
    }

    // Disable button and show loading state
    createBtn.disabled = true;
    createBtn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 mr-2 animate-spin"></i>Creating...';
    lucide.createIcons();

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
            // Show success feedback
            const newChannel = await response.json();
            if (newChannel && newChannel.id) {
                switchChannel(newChannel.id);
            }
        } else if (response.status === 409) {
            input.focus();
            input.classList.add('ring-2', 'ring-red-500');
            input.value = '';
            input.placeholder = 'Channel name already exists!';
            setTimeout(() => {
                input.classList.remove('ring-2', 'ring-red-500');
                input.placeholder = 'e.g., general, random, announcements';
            }, 2000);
        } else {
            throw new Error('Failed to create channel');
        }
    } catch (error) {
        console.error('Error creating channel:', error);
        input.focus();
        input.classList.add('ring-2', 'ring-red-500');
        setTimeout(() => input.classList.remove('ring-2', 'ring-red-500'), 2000);
    } finally {
        // Reset button state
        createBtn.disabled = false;
        createBtn.innerHTML = '<i data-lucide="plus" class="w-4 h-4 mr-2"></i>Create Channel';
        lucide.createIcons();
    }
}

async function deleteChannel(channelId) {
    const channel = channels.find(c => c.id === channelId);
    const channelName = channel ? channel.name : 'this channel';
    
    if (!confirm(`Are you sure you want to delete #${channelName}? All messages in this channel will be permanently deleted.`)) {
        return;
    }

    try {
        const apiUrl = isLocalDev
            ? `http://localhost:8787/api/channels/${channelId}`
            : `/api/channels/${channelId}`;

        // Add visual feedback - remove the channel element immediately
        const channelEl = document.querySelector(`[onclick="switchChannel(${channelId})"]`);
        if (channelEl) {
            channelEl.style.opacity = '0.5';
            channelEl.style.pointerEvents = 'none';
        }

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
            // Restore the channel element if deletion failed
            if (channelEl) {
                channelEl.style.opacity = '1';
                channelEl.style.pointerEvents = 'auto';
            }
            throw new Error('Failed to delete channel');
        }
    } catch (error) {
        console.error('Error deleting channel:', error);
        const channelEl = document.querySelector(`[onclick="switchChannel(${channelId})"]`);
        if (channelEl) {
            channelEl.style.opacity = '1';
            channelEl.style.pointerEvents = 'auto';
        }
    }
}

function openSearchModal() {
    const modal = document.getElementById('searchModal');
    const channelIdSelect = document.getElementById('searchChannelId');

    channelIdSelect.innerHTML = '<option value="all">All Channels</option>';
    channels.forEach(channel => {
        channelIdSelect.innerHTML += `<option value="${channel.id}">${escapeHtml(channel.name)}</option>`;
    });

    document.getElementById('searchQuery').value = '';
    document.getElementById('searchUsername').value = '';
    document.getElementById('searchStartDate').value = '';
    document.getElementById('searchEndDate').value = '';
    document.getElementById('searchResults').innerHTML = '';

    modal.classList.remove('hidden');
    document.getElementById('searchQuery').focus();
}

function closeSearchModal() {
    const modal = document.getElementById('searchModal');
    modal.classList.add('hidden');
}

async function performSearch() {
    const query = document.getElementById('searchQuery').value.trim();
    const usernameInput = document.getElementById('searchUsername').value.trim();
    const channelId = document.getElementById('searchChannelId').value;
    const startDate = document.getElementById('searchStartDate').value;
    const endDate = document.getElementById('searchEndDate').value;

    if (!query && !usernameInput && channelId === 'all' && !startDate && !endDate) {
        alert('Please enter at least one search criteria');
        return;
    }

    const searchResultsEl = document.getElementById('searchResults');
    searchResultsEl.innerHTML = '<div class="p-4 text-[#949BA4]">Searching...</div>';

    try {
        const apiUrl = isLocalDev
            ? 'http://localhost:8787/api/search'
            : '/api/search';

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                query,
                username: usernameInput,
                channelId,
                startDate,
                endDate,
            }),
        });

        const results = await response.json();
        displaySearchResults(results);
    } catch (error) {
        console.error('Error searching messages:', error);
        searchResultsEl.innerHTML = '<div class="p-4 text-red-400">Error searching messages</div>';
    }
}

function displaySearchResults(results) {
    const searchResultsEl = document.getElementById('searchResults');

    if (results.length === 0) {
        searchResultsEl.innerHTML = '<div class="p-4 text-[#949BA4]">No results found</div>';
        return;
    }

    searchResultsEl.innerHTML = '';

    results.forEach(result => {
        const time = new Date(result.timestamp).toLocaleString();
        const resultEl = document.createElement('div');
        resultEl.className = 'px-4 py-3 hover:bg-[#2e3035] cursor-pointer transition-colors border-b border-[#26272D]';
        resultEl.innerHTML = `
            <div class="flex items-center mb-2">
                <span class="font-medium text-[#dbdee1] mr-2">${escapeHtml(result.username)}</span>
                <span class="text-xs text-[#949BA4] bg-[#2B2D31] px-2 py-0.5 rounded">#${escapeHtml(result.channel_name)}</span>
                <span class="text-xs text-[#949BA4] ml-auto">${time}</span>
            </div>
            <div class="text-sm text-[#dbdee1]">${escapeHtml(result.message || '<i>File attachment</i>')}</div>
        `;

        resultEl.addEventListener('click', () => {
            if (result.channel_id !== currentChannelId) {
                localStorage.setItem('currentChannelId', result.channel_id);
                closeSearchModal();
                window.location.reload();
            } else {
                closeSearchModal();
            }
        });

        searchResultsEl.appendChild(resultEl);
    });
}

function renderMembers() {
    const membersSidebar = document.getElementById('members-sidebar');
    if (!membersSidebar) return;

    const users = Array.from(onlineUsers).map(u => JSON.parse(u));
    const currentChannel = channels.find(c => c.id === currentChannelId);

    membersSidebar.innerHTML = '';

    if (users.length === 0) {
        membersSidebar.innerHTML = '<div class="p-3 text-sm text-[#949BA4]">No users online</div>';
        return;
    }

    const onlineGroup = document.createElement('div');
    onlineGroup.className = 'mb-6';
    onlineGroup.innerHTML = `<h3 class="text-[#949BA4] text-xs font-bold uppercase mb-2 px-2">Online — ${users.length}</h3>`;

    users.forEach(user => {
        const avatarUrl = user.avatarKey
            ? (isLocalDev ? `http://localhost:8787/api/file/${user.avatarKey}` : `/api/file/${user.avatarKey}`)
            : `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName)}&background=random`;
        
        const userEl = document.createElement('div');
        userEl.className = 'flex items-center px-2 py-1.5 rounded hover:bg-[#35373C] cursor-pointer group opacity-90 hover:opacity-100';
        userEl.innerHTML = `
            <div class="relative mr-3">
                <img src="${avatarUrl}" alt="${escapeHtml(user.displayName)}" class="w-8 h-8 rounded-full object-cover">
                <div class="absolute bottom-0 right-0 w-3.5 h-3.5 border-[3px] border-[#2B2D31] rounded-full bg-green-500"></div>
            </div>
            <div class="flex-1 min-w-0">
                <div class="text-[15px] font-medium leading-4 text-[#dbdee1] truncate">
                    ${escapeHtml(user.displayName)}
                </div>
            </div>
        `;
        onlineGroup.appendChild(userEl);
    });

    membersSidebar.appendChild(onlineGroup);
}


function openUserSettings() {
    if (confirm('Do you want to logout?')) {
        localStorage.removeItem('chatUsername');
        localStorage.removeItem('displayName');
        localStorage.removeItem('avatarKey');
        window.location.href = 'index.html';
    }
}

function openEmojiModal() {
    const modal = document.getElementById('emojiUploadModal');
    modal.classList.remove('hidden');
    document.getElementById('emojiNameInput').focus();
}

function closeEmojiModal() {
    document.getElementById('emojiUploadModal').classList.add('hidden');
}

async function uploadEmoji() {
    const nameInput = document.getElementById('emojiNameInput');
    const fileInput = document.getElementById('emojiFileInput');
    const name = nameInput.value.trim();
    const file = fileInput.files[0];

    if (!name || !file) {
        alert('Please provide both a name and an image.');
        return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
        const image = e.target.result;
        try {
            const apiUrl = isLocalDev ? 'http://localhost:8787/api/emojis' : '/api/emojis';
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, image, username })
            });

            if (response.ok) {
                alert('Emoji uploaded!');
                closeEmojiModal();
                await fetchCustomEmojis();
                nameInput.value = '';
                fileInput.value = '';
            } else {
                const err = await response.text();
                alert('Upload failed: ' + err);
            }
        } catch (error) {
            console.error('Emoji upload error:', error);
        }
    };
    reader.readAsDataURL(file);
}

function openProfileModal() {
    const modal = document.getElementById('profileModal');
    const nameInput = document.getElementById('displayNameInput');
    const preview = document.getElementById('profilePreview');

    nameInput.value = displayName;
    preview.src = avatarKey 
        ? (isLocalDev ? `http://localhost:8787/api/file/${avatarKey}` : `/api/file/${avatarKey}`)
        : `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=random`;

    modal.classList.remove('hidden');
}

function closeProfileModal() {
    document.getElementById('profileModal').classList.add('hidden');
}

function previewAvatar(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            document.getElementById('profilePreview').src = e.target.result;
        };
        reader.readAsDataURL(file);
    }
}

async function updateProfile() {
    const nameInput = document.getElementById('displayNameInput');
    const avatarInput = document.getElementById('avatarInput');
    const newDisplayName = nameInput.value.trim();
    const avatarFile = avatarInput.files[0];

    if (!newDisplayName) {
        alert('Display name cannot be empty');
        return;
    }

    let avatarImage = null;
    if (avatarFile) {
        avatarImage = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.readAsDataURL(avatarFile);
        });
    }

    try {
        const apiUrl = isLocalDev ? 'http://localhost:8787/api/user/profile' : '/api/user/profile';
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                username, 
                displayName: newDisplayName, 
                avatarImage 
            })
        });

        if (response.ok) {
            const result = await response.json();
            displayName = newDisplayName;
            localStorage.setItem('displayName', displayName);
            if (result.avatarKey) {
                avatarKey = result.avatarKey;
                localStorage.setItem('avatarKey', avatarKey);
            }
            
            // Update local UI
            document.getElementById('display-username').textContent = displayName;
            document.getElementById('user-avatar-initial').textContent = displayName.charAt(0).toUpperCase();
            
            alert('Profile updated! Refresh to see changes in old messages.');
            closeProfileModal();
            window.location.reload(); // Reload to update WebSocket connection with new info
        } else {
            alert('Failed to update profile');
        }
    } catch (error) {
        console.error('Update profile error:', error);
    }
}

function toggleReactionPicker(event, messageId) {
    event.stopPropagation();
    const picker = document.getElementById('reactionPicker');
    const isHidden = picker.classList.contains('hidden');
    
    if (!isHidden && reactionPickerMessageId === messageId) {
        picker.classList.add('hidden');
        return;
    }

    reactionPickerMessageId = messageId;
    
    // Show picker first to get dimensions
    picker.classList.remove('hidden');

    // Add custom emojis to picker
    const customSection = document.getElementById('customEmojisInPicker');
    if (customSection) {
        if (customEmojis.length === 0) {
            customSection.innerHTML = '<div class="text-[10px] text-[#949BA4] w-full text-center py-2">No custom emojis</div>';
        } else {
            customSection.innerHTML = customEmojis.map(emoji => `
                <button class="hover:bg-[#35373C] p-1 rounded transition-colors" onclick="sendReaction(':${emoji.name}:')" title=":${emoji.name}:">
                    <img src="${isLocalDev ? 'http://localhost:8787/api/file/' : '/api/file/'}${emoji.file_key}" class="w-6 h-6 object-contain pointer-events-none">
                </button>
            `).join('');
        }
    }
    
    // Position picker
    const rect = event.currentTarget.getBoundingClientRect();
    const pickerHeight = picker.offsetHeight;
    const pickerWidth = picker.offsetWidth;
    
    let top = rect.top - pickerHeight - 10;
    let left = rect.left - pickerWidth / 2 + rect.width / 2;
    
    // Keep in viewport
    if (top < 10) top = rect.bottom + 10;
    if (left < 10) left = 10;
    if (left + pickerWidth > window.innerWidth - 10) left = window.innerWidth - pickerWidth - 10;

    picker.style.top = `${top}px`;
    picker.style.left = `${left}px`;
    
    lucide.createIcons();
}

function toggleReaction(messageId, emoji) {
    if (isConnected) {
        ws.send(JSON.stringify({
            type: 'reaction',
            messageId,
            emoji
        }));
    }
}

function sendReaction(emoji) {
    if (reactionPickerMessageId !== null) {
        toggleReaction(reactionPickerMessageId, emoji);
    } else {
        const input = document.getElementById('message-input');
        const space = (input.value.length > 0 && !input.value.endsWith(' ')) ? ' ' : '';
        input.value += space + emoji + ' ';
        input.focus();
    }
    document.getElementById('reactionPicker').classList.add('hidden');
}

function updateMessageReactions(messageId, reactions) {
    const container = document.getElementById(`reactions-${messageId}`);
    if (!container) return;

    if (!reactions || reactions.length === 0) {
        container.innerHTML = '';
        return;
    }

    const grouped = reactions.reduce((acc, r) => {
        acc[r.emoji] = acc[r.emoji] || [];
        acc[r.emoji].push(r.username);
        return acc;
    }, {});

    let html = '';
    Object.entries(grouped).forEach(([emoji, users]) => {
        const hasReacted = users.includes(username);
        const isCustom = emoji.startsWith(':') && emoji.endsWith(':');
        let emojiDisplay = emoji;

        if (isCustom) {
            const name = emoji.slice(1, -1);
            const customEmoji = customEmojis.find(e => e.name === name);
            if (customEmoji) {
                emojiDisplay = `<img src="${isLocalDev ? 'http://localhost:8787/api/file/' : '/api/file/'}${customEmoji.file_key}" class="w-4 h-4 inline-block">`;
            }
        }

        html += `
            <div class="reaction-badge ${hasReacted ? 'active' : ''}" onclick="event.stopPropagation(); toggleReaction(${messageId}, '${emoji}')" title="${users.join(', ')}">
                <span>${emojiDisplay}</span>
                <span class="reaction-count">${users.length}</span>
            </div>
        `;
    });
    container.innerHTML = html;
}

// Close picker when clicking outside
document.addEventListener('click', (e) => {
    const picker = document.getElementById('reactionPicker');
    if (picker && !picker.contains(e.target)) {
        picker.classList.add('hidden');
    }
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

document.addEventListener('DOMContentLoaded', () => {
    console.log(`Connecting as: ${username} to channel ${currentChannelId}`);
    
    document.getElementById('display-username').textContent = displayName;
    document.getElementById('user-avatar-initial').textContent = displayName.charAt(0).toUpperCase();

    const avatarDisplay = document.querySelector('#user-avatar-initial').parentElement;
    if (avatarKey) {
        const url = isLocalDev ? `http://localhost:8787/api/file/${avatarKey}` : `/api/file/${avatarKey}`;
        avatarDisplay.innerHTML = `<img src="${url}" class="w-8 h-8 rounded-full object-cover">`;
    }

    fetchCustomEmojis();
    fetchChannels();
    connect();
    renderMembers();



    const fileInputEl = document.getElementById('fileInput');
    if (fileInputEl) {
        fileInputEl.addEventListener('change', handleFileSelect);
    }

    const messageFormEl = document.getElementById('message-form');
    if (messageFormEl) {
        messageFormEl.addEventListener('submit', async (e) => {
            e.preventDefault();
            const input = document.getElementById('message-input');
            const message = input.value.trim();

            if (!message && selectedFiles.length === 0) return;

            if (isConnected) {
                const filesToSend = [...selectedFiles];

                if (message) {
                    ws.send(JSON.stringify({
                        type: 'chat',
                        message,
                        replyTo: replyingTo?.messageId,
                    }));
                    input.value = '';
                }

                for (const file of filesToSend) {
                    ws.send(JSON.stringify({
                        type: 'chat',
                        message: '',
                        file,
                        replyTo: replyingTo?.messageId,
                    }));
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

    const messageInputEl = document.getElementById('message-input');
    if (messageInputEl) {
        messageInputEl.addEventListener('input', handleTyping);
        messageInputEl.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                const form = document.getElementById('message-form');
                if (form) form.dispatchEvent(new Event('submit'));
            }
        });
    }

    const toggleMembersBtnEl = document.getElementById('toggle-members-btn');
    if (toggleMembersBtnEl) {
        toggleMembersBtnEl.addEventListener('click', () => {
            const membersSidebar = document.getElementById('members-sidebar');
            const isHidden = membersSidebar.classList.contains('hidden');
            
            if (isHidden) {
                membersSidebar.classList.remove('hidden');
                membersSidebar.classList.add('lg:flex');
            } else {
                membersSidebar.classList.add('hidden');
                membersSidebar.classList.remove('lg:flex');
            }
            
            toggleMembersBtnEl.classList.toggle('text-white');
        });
    }
});

window.openImageModal = openImageModal;
window.closeImageModal = closeImageModal;
window.startReply = startReply;
window.cancelReply = cancelReply;
window.openEditModal = openEditModal;
window.closeEditModal = closeEditModal;
window.saveEdit = saveEdit;
window.deleteMessage = deleteMessage;
window.openCreateChannelModal = openCreateChannelModal;
window.closeCreateChannelModal = closeCreateChannelModal;
window.createChannel = createChannel;
window.deleteChannel = deleteChannel;
window.openSearchModal = openSearchModal;
window.closeSearchModal = closeSearchModal;
window.performSearch = performSearch;
window.openUserSettings = openUserSettings;
window.toggleReactionPicker = toggleReactionPicker;
window.toggleReaction = toggleReaction;
window.sendReaction = sendReaction;
window.openEmojiModal = openEmojiModal;
window.closeEmojiModal = closeEmojiModal;
window.uploadEmoji = uploadEmoji;
window.openProfileModal = openProfileModal;
window.closeProfileModal = closeProfileModal;
window.previewAvatar = previewAvatar;
window.updateProfile = updateProfile;

