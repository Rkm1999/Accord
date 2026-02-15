import { state, updateState, markChannelUnread } from '../state.js';
import { api } from '../api.js';
import { parseMessage, extractYouTubeVideoId, getYouTubeIframe } from '../utils/parser.js';
import { formatFileSize, getFileIcon, isEmojiOnly, basicEscapeHtml } from '../utils/helpers.js';
import { isIOS, apiBaseUrl, isLocalDev } from '../config.js';
import { send } from '../socket.js';

import { 
    updateMessageReactions, toggleReactionPicker, initReactionListeners 
} from './reactions.js';

/**
 * Main module for message rendering and scroll management.
 */

/**
 * Maintains scroll at the bottom when content changes, if it was already at the bottom.
 */
export function maintainScrollBottom(callback) {
    const messagesContainer = document.getElementById('messages-container');
    if (!messagesContainer) return callback();

    const wasNearBottom = messagesContainer.scrollHeight - messagesContainer.scrollTop - messagesContainer.clientHeight < 100;
    const result = callback();

    if (wasNearBottom) {
        setTimeout(() => {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }, 0);
    }

    return result;
}

/**
 * Scroll to the very bottom of the chat.
 */
export function scrollToBottom() {
    const messagesContainer = document.getElementById('messages-container');
    if (messagesContainer) {
        messagesContainer.scrollTo({
            top: messagesContainer.scrollHeight,
            behavior: 'smooth'
        });
    }
}

/**
 * Highlights and scrolls to a specific message by ID.
 */
export function scrollToMessage(messageId) {
    const selector = `[data-message-id="${messageId}"]`;
    let msgEl = document.querySelector(selector);

    if (!msgEl) {
        // If not found, try to load more history if available
        if (state.hasMoreMessages && !state.isLoadingMore) {
            loadMoreMessages();
            // Retry after a delay
            setTimeout(() => scrollToMessage(messageId), 500);
        }
        return;
    }

    msgEl.style.backgroundColor = 'rgba(250, 168, 26, 0.15)';
    msgEl.style.transition = 'background-color 0.3s ease';
    msgEl.scrollIntoView({ behavior: 'smooth', block: 'center' });

    setTimeout(() => {
        msgEl.style.backgroundColor = '';
    }, 3000);
}

/**
 * Recalculates visual grouping for all messages in the container.
 */
export function recalculateAllGrouping() {
    const container = document.getElementById('messages-container');
    const messages = Array.from(container.querySelectorAll('.message-group'));
    
    let lastMsg = null;
    let groupCount = 0;

    messages.forEach(msgEl => {
        const username = msgEl.dataset.username;
        const replyTo = msgEl.dataset.replyTo;
        
        let shouldGroup = false;
        if (lastMsg && lastMsg.username === username && !replyTo) {
            if (groupCount < 10) {
                shouldGroup = true;
                groupCount++;
            } else {
                groupCount = 0;
            }
        } else {
            groupCount = 0;
        }

        // Apply visual grouping
        const avatarCol = msgEl.querySelector('.avatar-col');
        const userInfoCol = msgEl.querySelector('.user-info-col');
        const timeCol = msgEl.querySelector('.time-col');

        if (shouldGroup) {
            msgEl.classList.add('mt-0');
            msgEl.classList.remove('mt-[17px]');
            if (avatarCol) avatarCol.classList.add('hidden');
            if (userInfoCol) userInfoCol.classList.add('hidden');
            if (timeCol) {
                timeCol.style.display = 'flex';
                timeCol.classList.remove('hidden');
            }
        } else {
            msgEl.classList.remove('mt-0');
            msgEl.classList.add('mt-[17px]');
            if (avatarCol) avatarCol.classList.remove('hidden');
            if (userInfoCol) userInfoCol.classList.remove('hidden');
            if (timeCol) {
                timeCol.style.display = 'none';
                timeCol.classList.add('hidden');
            }
        }

        lastMsg = { username };
    });
}

/**
 * Creates a single message DOM element.
 */
export function createMessageElement(data, shouldGroup = false) {
    const time = new Date(data.timestamp).toLocaleTimeString();
    const date = new Date(data.timestamp).toLocaleDateString();
    const isOwnMessage = data.username === state.username;

    const display_name = data.displayName || data.display_name || data.username;
    const avatar_key = data.avatarKey || data.avatar_key || data.user_avatar;

    const avatarUrl = avatar_key
        ? (isLocalDev ? `${apiBaseUrl}/api/file/${avatar_key}` : `/api/file/${avatar_key}`)
        : `https://ui-avatars.com/api/?name=${encodeURIComponent(display_name)}&background=random`;

    // Persistent Highlight Check
    const isMentioned = (data.mentions && data.mentions.includes(state.username)) ||
        (data.reply_username === state.username) ||
        (data.message && (
            data.message.includes(`@${state.username}`) ||
            data.message.includes('@everyone') ||
            data.message.includes('@here')
        ));

    let replyHtml = '';
    if (data.reply_to) {
        replyHtml = `
            <div class="flex items-center gap-1 mb-0.5 opacity-60 hover:opacity-100 cursor-pointer transition-opacity select-none" onclick="event.stopPropagation(); window.scrollToMessage(${data.reply_to})">
                <i data-lucide="corner-up-left" class="w-3 h-3 text-[#949BA4] mr-1"></i>
                <span class="text-xs font-semibold text-[#b5bac1] hover:underline">@${basicEscapeHtml(data.reply_username)}</span>
                <span class="text-xs text-[#949BA4] truncate max-w-[300px]">${basicEscapeHtml(data.reply_message || (data.reply_file_name ? 'Attachment' : ''))}</span>
            </div>
        `;
    }

    let messageHtml = `
        <div class="avatar-col mt-0.5 mr-4 cursor-pointer hover:opacity-80 transition-opacity ${shouldGroup ? 'hidden' : ''}" onclick="window.openUserDetailModal('${basicEscapeHtml(data.username)}')" oncontextmenu="return false;">
            <img src="${avatarUrl}" alt="${basicEscapeHtml(display_name)}" class="w-10 h-10 rounded-full object-cover" oncontextmenu="return false;">
        </div>
        <div class="time-col w-10 mr-4 text-[10px] text-[#949BA4] opacity-0 group-hover:opacity-100 flex items-center justify-end select-none ${shouldGroup ? '' : 'hidden'}" oncontextmenu="return false;">
            ${time}
        </div>
        <div class="flex-1 min-w-0" oncontextmenu="return false;">
            ${replyHtml}
            <div class="user-info-col flex items-center ${shouldGroup ? 'hidden' : ''}" oncontextmenu="return false;">
                <span class="font-medium mr-2 hover:underline cursor-pointer text-[#dbdee1]" onclick="window.openUserDetailModal('${basicEscapeHtml(data.username)}')" oncontextmenu="return false;">
                    ${basicEscapeHtml(display_name)}
                </span>
                <span class="text-xs text-[#949BA4] ml-1">${date} - ${time}</span>
            </div>
    `;

    if (data.message) {
        const emojiOnlyClass = isEmojiOnly(data.message, state.customEmojis) ? 'jumbo-emoji-message' : '';
        messageHtml += `<p class="text-[#dbdee1] whitespace-pre-wrap leading-[1.375rem] ${emojiOnlyClass}">${parseMessage(data.message, state.customEmojis, state.allUsers, state.username)}${data.is_edited ? '<span class="edited-text">(edited)</span>' : ''}</p>`;
    }

    // Handle Link Previews
    const linkMetadata = data.linkMetadata || {
        url: data.link_url, title: data.link_title, description: data.link_description, image: data.link_image,
        isSpoiler: !!(data.is_spoiler || (data.linkMetadata && data.linkMetadata.isSpoiler))
    };

    if (linkMetadata && linkMetadata.url) {
        const ytVideoId = extractYouTubeVideoId(linkMetadata.url);
        const isSpoiler = linkMetadata.isSpoiler;
        const containerClass = isSpoiler ? 'spoiler-file-container' : '';
        const spoilerOverlay = isSpoiler ? `<div class="spoiler-overlay" onclick="this.parentElement.classList.add('revealed'); event.stopPropagation();"><i data-lucide="eye-off" class="w-8 h-8 mb-2"></i><span class="text-xs font-bold uppercase tracking-widest">Spoiler</span></div>` : '';

        if (ytVideoId) {
            const playerContainerId = `yt-player-${data.id || Math.random().toString(36).substr(2, 9)}`;
            messageHtml += `
                <div class="mt-2 max-w-full ${containerClass}">
                    ${spoilerOverlay}
                    <div id="${playerContainerId}">
                        <div class="relative group/yt cursor-pointer rounded-lg overflow-hidden max-w-[400px]" onclick="window.playYouTube('${ytVideoId}', '${playerContainerId}')" oncontextmenu="return false;">
                            <img src="${basicEscapeHtml(linkMetadata.image || `https://img.youtube.com/vi/${ytVideoId}/hqdefault.jpg`)}" class="w-full h-auto" oncontextmenu="return false;">
                            <div class="absolute inset-0 flex items-center justify-center bg-black/20 group-hover/yt:bg-black/40 transition-colors">
                                <div class="w-16 h-11 bg-[#FF0000] rounded-lg flex items-center justify-center shadow-lg group-hover/yt:scale-110 transition-transform"><div class="w-0 h-0 border-t-[8px] border-t-transparent border-l-[14px] border-l-white border-b-[8px] border-b-transparent ml-1"></div></div>
                            </div>
                        </div>
                    </div>
                    <a href="${basicEscapeHtml(linkMetadata.url)}" target="_blank" class="block mt-2">
                        ${linkMetadata.title ? `<div class="text-[#00A8FC] hover:underline font-medium">${basicEscapeHtml(linkMetadata.title)}</div>` : ''}
                        ${linkMetadata.description ? `<div class="text-sm text-[#949BA4] mt-1">${basicEscapeHtml(linkMetadata.description)}</div>` : ''}
                    </a>
                </div>`;
        } else {
            messageHtml += `
                <div class="${containerClass} mt-2">
                    ${spoilerOverlay}
                    <a href="${basicEscapeHtml(linkMetadata.url)}" target="_blank" class="block ${!linkMetadata.image ? 'border-l-2 border-[#5865F2] pl-3' : ''}">
                        ${linkMetadata.image ? `<img src="${basicEscapeHtml(linkMetadata.image)}" class="rounded-lg max-w-full mb-2">` : ''}
                        ${linkMetadata.title ? `<div class="text-[#00A8FC] hover:underline font-medium">${basicEscapeHtml(linkMetadata.title)}</div>` : ''}
                        ${linkMetadata.description ? `<div class="text-sm text-[#949BA4] mt-1">${basicEscapeHtml(linkMetadata.description)}</div>` : ''}
                    </a>
                </div>`;
        }
    }

    // Handle File Attachments
    const file = data.fileAttachment || {
        name: data.file_name, type: data.file_type, size: data.file_size, key: data.file_key,
        isSpoiler: !!(data.is_spoiler || (data.fileAttachment && data.fileAttachment.isSpoiler))
    };

    if (file && file.key) {
        const fileUrl = isLocalDev ? `${apiBaseUrl}/api/file/${file.key}` : `/api/file/${file.key}`;
        const isSpoiler = file.isSpoiler;
        const containerClass = isSpoiler ? 'spoiler-file-container' : 'relative';
        const spoilerOverlay = isSpoiler ? `<div class="spoiler-overlay" onclick="this.parentElement.classList.add('revealed'); event.stopPropagation();"><i data-lucide="eye-off" class="w-8 h-8 mb-2"></i><span class="text-xs font-bold uppercase tracking-widest">Spoiler</span></div>` : '';

        if (file.type?.startsWith('image/')) {
            messageHtml += `
                <div class="mt-2 group/image ${containerClass}">
                    ${spoilerOverlay}
                    <img src="${fileUrl}" class="rounded-lg max-w-[300px] cursor-pointer hover:opacity-90" onclick="window.openImageModal('${fileUrl}', '${basicEscapeHtml(file.name)}')" oncontextmenu="return false;">
                    <a href="${fileUrl}" download="${basicEscapeHtml(file.name)}" class="absolute bottom-2 right-2 bg-[#5865F2] text-white p-2 rounded-full shadow-lg opacity-0 lg:group-hover/image:opacity-100 transition-opacity hidden lg:flex z-30" onclick="window.downloadFile(this.href, this.getAttribute('download')); return false;">
                        <i data-lucide="download" class="w-4 h-4"></i>
                    </a>
                </div>`;
        } else if (file.type?.startsWith('video/')) {
            messageHtml += `
                <div class="mt-2 group/video ${containerClass} max-w-[400px]">
                    ${spoilerOverlay}
                    <video src="${fileUrl}" controls preload="metadata" class="w-full rounded-lg bg-black/20"></video>
                    <a href="${fileUrl}" download="${basicEscapeHtml(file.name)}" class="absolute top-2 right-2 bg-[#5865F2] text-white p-1.5 rounded-full shadow-lg opacity-0 group-hover/video:opacity-100 transition-opacity z-30" onclick="window.downloadFile(this.href, this.getAttribute('download')); return false;">
                        <i data-lucide="download" class="w-3 h-3"></i>
                    </a>
                </div>`;
        } else {
            messageHtml += `
                <div class="flex items-center mt-2 bg-[#2B2D31] hover:bg-[#36383E] p-3 rounded-lg transition-colors relative ${containerClass}">
                    ${spoilerOverlay}
                    <div class="text-2xl mr-3">${getFileIcon(file.type)}</div>
                    <div class="flex-1 min-w-0">
                        <div class="text-[#dbdee1] font-medium truncate">${basicEscapeHtml(file.name)}</div>
                        <div class="text-xs text-[#949BA4]">${formatFileSize(file.size)}</div>
                    </div>
                    <a href="${fileUrl}" download="${basicEscapeHtml(file.name)}" class="ml-2 p-2 hover:bg-[#404249] rounded transition-colors z-30" onclick="window.downloadFile(this.href, this.getAttribute('download')); return false;">
                        <i data-lucide="download" class="w-5 h-5 text-[#949BA4] hover:text-[#dbdee1]"></i>
                    </a>
                </div>`;
        }
    }

    // Reactions Container
    messageHtml += `<div class="reactions-container flex flex-wrap mt-1" id="reactions-${data.id}"></div>`;

    // Message Actions
    messageHtml += `
            </div>
            <div class="message-actions absolute right-4 -mt-2 bg-[#313338] shadow-sm border border-[#26272D] rounded items-center p-1 z-10">
                <div class="p-1 hover:bg-[#404249] rounded cursor-pointer text-[#B5BAC1] action-trigger" data-action="reaction" data-id="${data.id}"><i data-lucide="smile" class="w-[18px] h-[18px] pointer-events-none"></i></div>
                <div class="p-1 hover:bg-[#404249] rounded cursor-pointer text-[#B5BAC1] action-trigger" data-action="reply" data-id="${data.id}"><i data-lucide="reply" class="w-[18px] h-[18px] pointer-events-none"></i></div>
                ${isOwnMessage ? `
                    <div class="p-1 hover:bg-[#404249] rounded cursor-pointer text-[#B5BAC1] action-trigger" data-action="edit" data-id="${data.id}"><i data-lucide="edit-2" class="w-[16px] h-[16px] pointer-events-none"></i></div>
                    <div class="p-1 hover:bg-[#404249] rounded cursor-pointer text-red-400 action-trigger" data-action="delete" data-id="${data.id}"><i data-lucide="trash-2" class="w-[16px] h-[16px] pointer-events-none"></i></div>
                ` : ''}
            </div>
        `;

    const msgEl = document.createElement('div');
    msgEl.className = `group flex pr-4 hover:bg-[#2e3035] -mx-4 px-4 py-0.5 ${shouldGroup ? 'mt-0' : 'mt-[17px]'} relative message-group ${isMentioned ? 'mention-highlight' : ''}`;
    msgEl.dataset.messageId = data.id || '';
    msgEl.dataset.username = data.username;
    msgEl.dataset.timestamp = data.timestamp;
    msgEl.dataset.text = data.message || '';
    if (data.reply_to) msgEl.dataset.replyTo = data.reply_to;
    if (file.key) {
        msgEl.dataset.fileKey = file.key;
        msgEl.dataset.fileName = file.name;
        msgEl.dataset.fileType = file.type;
    }

    msgEl.innerHTML = messageHtml;

    // Swipe indicator for mobile
    const swipeIndicator = document.createElement('div');
    swipeIndicator.className = 'reply-swipe-indicator';
    swipeIndicator.innerHTML = '<i data-lucide="reply" class="w-5 h-5"></i>';
    msgEl.appendChild(swipeIndicator);

    // Render initial reactions if any
    if (data.reactions && data.reactions.length > 0) {
        setTimeout(() => updateMessageReactions(data.id, data.reactions), 0);
    }

    return msgEl;
}

/**
 * Displays chat history in the container.
 */
export function displayHistory(messages, lastReadMessageId = 0, before = null, hasMore = false) {
    const messagesContainer = document.getElementById('messages-container');
    messagesContainer.innerHTML = '';

    updateState({
        oldestMessageTimestamp: messages.length > 0 ? messages[0].timestamp : null,
        hasMoreMessages: hasMore,
        isLoadingMore: false,
        isAutoLoading: false
    });

    // Update Header UI based on current channel
    const publicChannel = state.channels.find(c => c.id === state.currentChannelId);
    const dmChannel = state.dms.find(d => d.id === state.currentChannelId);

    let channelName = 'general';
    let isDm = false;

    if (publicChannel) {
        channelName = publicChannel.name;
    } else if (dmChannel) {
        channelName = dmChannel.other_display_name || dmChannel.other_username;
        isDm = true;
    }

    const displayTitle = isDm ? channelName : `#${channelName}`;
    document.title = `Accord - ${displayTitle}`;
    
    const headerNameEl = document.getElementById('header-channel-name');
    if (headerNameEl) {
        headerNameEl.textContent = channelName;
        const headerIcon = headerNameEl.previousElementSibling;
        if (headerIcon) {
            headerIcon.setAttribute('data-lucide', isDm ? 'at-sign' : 'hash');
        }
    }

    const input = document.getElementById('message-input');
    if (input) input.placeholder = `Message ${displayTitle}`;

    const footerBadge = document.getElementById('current-channel-badge');
    if (footerBadge) footerBadge.textContent = displayTitle;

    if (messages.length === 0) {
        messagesContainer.innerHTML = `<div class="mt-auto mb-6 text-center text-[#B5BAC1]">This is the start of the conversation.</div>`;
        return;
    }

    if (hasMore) {
        const loadMoreBtn = document.createElement('div');
        loadMoreBtn.className = 'text-center py-4';
        loadMoreBtn.id = 'load-more-button';
        loadMoreBtn.innerHTML = `<button onclick="window.loadMoreMessages()" class="bg-[#5865F2] text-white py-2 px-4 rounded">Load More Messages</button>`;
        messagesContainer.appendChild(loadMoreBtn);
    }

    let unreadDividerShown = false;
    let maxMessageId = 0;
    let lastMsg = null;
    let groupCount = 0;

    messages.forEach(msg => {
        if (msg.message || msg.file_name) {
            if (msg.id > maxMessageId) maxMessageId = msg.id;

            if (lastReadMessageId > 0 && !unreadDividerShown && msg.id > lastReadMessageId) {
                const divider = document.createElement('div');
                divider.className = 'flex items-center my-4 unread-divider';
                divider.id = 'unread-divider';
                divider.innerHTML = `<div class="flex-grow h-[1px] bg-red-500 opacity-50"></div><span class="px-2 text-xs font-bold text-red-500 uppercase">New Messages</span><div class="flex-grow h-[1px] bg-red-500 opacity-50"></div>`;
                messagesContainer.appendChild(divider);
                unreadDividerShown = true;
                lastMsg = null;
                groupCount = 0;
            }

            let shouldGroup = false;
            if (lastMsg && lastMsg.username === msg.username && !msg.reply_to) {
                if (groupCount < 10) {
                    shouldGroup = true;
                    groupCount++;
                } else {
                    groupCount = 0;
                }
            } else {
                groupCount = 0;
            }

            displayMessage(msg, true, shouldGroup);
            lastMsg = msg;
        }
    });

    if (window.lucide) lucide.createIcons();

    setTimeout(() => {
        const divider = document.getElementById('unread-divider');
        if (divider) divider.scrollIntoView({ block: 'center' });
        else scrollToBottom();
    }, 50);

    if (maxMessageId > lastReadMessageId && state.isConnected) {
        send({ type: 'mark_read', messageId: maxMessageId });
    }
}

/**
 * Handles "Load More" pagination.
 */
export function loadMoreMessages(showButtonLoading = true) {
    if (state.isLoadingMore || !state.hasMoreMessages) return false;

    updateState({ isLoadingMore: true });
    
    if (showButtonLoading) {
        const btn = document.getElementById('load-more-button');
        if (btn) btn.innerHTML = 'Loading older messages...';
    }

    send({
        type: 'load_history',
        before: state.oldestMessageTimestamp,
        limit: 25
    });
    return true;
}

/**
 * Appends or prepends a batch of messages.
 */
export function displayMoreMessages(messages, before, hasMore) {
    try {
        const messagesContainer = document.getElementById('messages-container');
        const nextMessage = document.getElementById('load-more-button')?.nextSibling || messagesContainer.firstChild;
        const distanceFromBottom = messagesContainer.scrollHeight - messagesContainer.scrollTop;

        if (messages.length > 0) {
            updateState({ oldestMessageTimestamp: messages[0].timestamp });
        }
        updateState({ hasMoreMessages: hasMore });

        const fragment = document.createDocumentFragment();
        const batch = [...messages].reverse();

        batch.forEach(msg => {
            if (msg.message || msg.file_name) {
                const msgEl = createMessageElement(msg, true);
                fragment.appendChild(msgEl);
            }
        });

        messagesContainer.insertBefore(fragment, nextMessage);
        recalculateAllGrouping();
        if (window.lucide) lucide.createIcons();

        messagesContainer.scrollTop = messagesContainer.scrollHeight - distanceFromBottom;
    } finally {
        updateState({ isLoadingMore: false, isAutoLoading: false });
    }
}

/**
 * Displays a single message.
 */
export function displayMessage(data, isHistory = false, passedShouldGroup = false) {
    const messagesContainer = document.getElementById('messages-container');
    const prevMessage = messagesContainer.lastElementChild;

    let shouldGroup = passedShouldGroup;
    if (!isHistory && !passedShouldGroup && prevMessage) {
        const prevUsername = prevMessage.dataset.username;
        let groupSize = 0;
        let current = prevMessage;
        while (current && current.classList.contains('mt-0')) {
            groupSize++;
            current = current.previousElementSibling;
        }
        shouldGroup = prevUsername === data.username && !data.reply_to && groupSize < 10;
    }

    const msgEl = createMessageElement(data, shouldGroup);

    if (!isHistory) {
        const wasNearBottom = messagesContainer.scrollHeight - messagesContainer.scrollTop - messagesContainer.clientHeight < 100;
        msgEl.classList.add('new-message');
        messagesContainer.appendChild(msgEl);
        if (window.lucide) lucide.createIcons();

        if (data.username === state.username || wasNearBottom) scrollToBottom();
    } else {
        messagesContainer.appendChild(msgEl);
    }
}

/**
 * Message Actions: Reply
 */
export function startReply(messageId) {
    updateState({ replyingTo: { messageId } });

    const banner = document.getElementById('replyBanner');
    const userEl = document.getElementById('reply-to-username');
    const contentEl = document.getElementById('reply-to-content');
    const mediaEl = document.getElementById('reply-to-media');

    const msgEl = document.querySelector(`[data-message-id="${messageId}"]`);
    if (msgEl) {
        userEl.textContent = msgEl.dataset.username;
        contentEl.textContent = msgEl.dataset.text || '';

        if (msgEl.dataset.fileKey) {
            mediaEl.classList.remove('hidden');
            const url = isLocalDev ? `${apiBaseUrl}/api/file/${msgEl.dataset.fileKey}` : `/api/file/${msgEl.dataset.fileKey}`;
            if (msgEl.dataset.fileType?.startsWith('image/')) {
                mediaEl.innerHTML = `<img src="${url}" class="w-12 h-12 rounded object-cover">`;
            } else {
                mediaEl.innerHTML = `<div class="bg-[#2B2D31] p-1 rounded"><i data-lucide="file" class="w-6 h-6"></i></div>`;
            }
        } else {
            mediaEl.classList.add('hidden');
            mediaEl.innerHTML = '';
        }
    }

    banner.classList.remove('hidden');
    banner.classList.add('active');
    if (window.lucide) lucide.createIcons();
    document.getElementById('message-input')?.focus();
}

export function cancelReply() {
    maintainScrollBottom(() => {
        updateState({ replyingTo: null });
        document.getElementById('replyBanner')?.classList.add('hidden');
        document.getElementById('reply-to-media').innerHTML = '';
    });
}

/**
 * Message Actions: Edit
 */
export function openEditModal(messageId) {
    if (state.editingMessageId !== null) closeEditModal();

    const msgEl = document.querySelector(`[data-message-id="${messageId}"]`);
    if (!msgEl) return;

    const contentEl = msgEl.querySelector('p');
    if (!contentEl) return;

    updateState({ editingMessageId: messageId });
    const originalText = msgEl.dataset.text || '';

    const editorHtml = `
        <div class="inline-edit-container mt-2">
            <textarea id="inline-edit-input" class="w-full bg-[#1E1F22] text-[#dbdee1] rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#5865F2] resize-none min-h-[44px] mb-2">${basicEscapeHtml(originalText)}</textarea>
            <div class="flex gap-2 text-[12px]">
                <span class="text-[#949BA4]">escape to <button onclick="window.closeEditModal()" class="text-[#00A8FC] hover:underline">cancel</button></span>
                <span class="text-[#949BA4]">•</span>
                <span class="text-[#949BA4]">enter to <button onclick="window.saveEdit()" class="text-[#00A8FC] hover:underline font-bold">save</button></span>
            </div>
        </div>`;

    contentEl.style.display = 'none';
    contentEl.insertAdjacentHTML('afterend', editorHtml);

    const input = document.getElementById('inline-edit-input');
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
    input.style.height = input.scrollHeight + 'px';
    input.oninput = () => { input.style.height = 'auto'; input.style.height = input.scrollHeight + 'px'; };
    input.onkeydown = (e) => {
        if (e.key === 'Escape') closeEditModal();
        else if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit(); }
    };
}

export function closeEditModal() {
    if (state.editingMessageId === null) return;
    const msgEl = document.querySelector(`[data-message-id="${state.editingMessageId}"]`);
    if (msgEl) {
        msgEl.querySelector('p').style.display = 'block';
        msgEl.querySelector('.inline-edit-container')?.remove();
    }
    updateState({ editingMessageId: null });
}

export async function saveEdit() {
    const input = document.getElementById('inline-edit-input');
    const newMessage = input?.value.trim();
    if (!newMessage) return;

    if (state.isConnected) {
        send({ type: 'edit', messageId: state.editingMessageId, newMessage });
        closeEditModal();
    }
}

/**
 * Message Actions: Delete
 */
export function deleteMessage(messageId) {
    if (!confirm('Are you sure you want to delete this message?')) return;
    if (state.isConnected) {
        send({ type: 'delete', messageId });
    }
}

/**
 * Updates a message after editing.
 */
export function updateMessageEdit(messageId, newMessage) {
    const msgEl = document.querySelector(`[data-message-id="${messageId}"]`);
    if (!msgEl) return;
    msgEl.dataset.text = newMessage;
    const p = msgEl.querySelector('p');
    if (p) p.innerHTML = `${parseMessage(newMessage, state.customEmojis, state.allUsers, state.username)} <span class="edited-text">(edited)</span>`;
}

/**
 * Removes a message from the DOM.
 */
export function removeMessageElement(messageId) {
    document.querySelector(`[data-message-id="${messageId}"]`)?.remove();
}

// Global exposes
window.startReply = startReply;
window.cancelReply = cancelReply;
window.openEditModal = openEditModal;
window.closeEditModal = closeEditModal;
window.saveEdit = saveEdit;
window.deleteMessage = deleteMessage;
window.loadMoreMessages = loadMoreMessages;
