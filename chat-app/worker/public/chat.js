const username = localStorage.getItem('chatUsername');
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

// Register Service Worker for PWA & Handle Updates
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/firebase-messaging-sw.js').then(reg => {
            console.log('Service Worker registered');

            // Check for updates on load
            if (reg.waiting) {
                showUpdatePrompt(reg.waiting);
            }

            reg.addEventListener('updatefound', () => {
                const newWorker = reg.installing;
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        showUpdatePrompt(newWorker);
                    }
                });
            });
        }).catch(err => console.log('Service Worker registration failed', err));

        // Reload page when new SW takes control
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            window.location.reload();
        });
    });
}

function showUpdatePrompt(worker) {
    const prompt = document.getElementById('pwaUpdatePrompt');
    const btn = document.getElementById('pwaUpdateBtn');

    if (prompt && btn) {
        prompt.classList.remove('hidden');
        prompt.style.display = 'flex';
        btn.onclick = () => {
            worker.postMessage({ type: 'SKIP_WAITING' });
            btn.disabled = true;
            btn.textContent = 'Updating...';
        };
    }
}

// PWA Installation Logic
let deferredPrompt;

function initPwaInstallation() {
    const pwaPrompt = document.getElementById('pwaInstallPrompt');
    const installBtn = document.getElementById('pwaInstallBtn');
    const iosInstruction = document.getElementById('iosInstruction');

    if (!pwaPrompt) {
        console.warn('PWA prompt element not found');
        return;
    }

    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || localStorage.getItem('debug_pwa') === 'true';
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone || document.referrer.includes('android-app://');

    console.log('PWA Init:', { isMobile, isStandalone, debug: localStorage.getItem('debug_pwa') });

    // Don't show if already installed
    if (isStandalone) {
        pwaPrompt.style.display = 'none';
        return;
    }

    // Detection logic
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

    window.addEventListener('beforeinstallprompt', (e) => {
        console.log('beforeinstallprompt event fired');
        e.preventDefault();
        deferredPrompt = e;

        if (isMobile) {
            pwaPrompt.style.display = 'flex';
            if (installBtn) installBtn.classList.remove('hidden');
        }
    });

    if (isIOS && isMobile) {
        setTimeout(() => {
            if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) return;
            pwaPrompt.style.display = 'flex';
            if (iosInstruction) iosInstruction.classList.remove('hidden');
            if (window.lucide) window.lucide.createIcons();
        }, 3000);
    }

    if (localStorage.getItem('debug_pwa') === 'true') {
        console.log('PWA Debug Mode Active');
        setTimeout(() => {
            if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) return;
            pwaPrompt.style.display = 'flex';
            if (installBtn) installBtn.classList.remove('hidden');
            if (window.lucide) window.lucide.createIcons();
        }, 1000);
    }
}

function closePwaPrompt() {
    const pwaPrompt = document.getElementById('pwaInstallPrompt');
    if (pwaPrompt) pwaPrompt.style.display = 'none';
}

// Global click handler for install button
document.addEventListener('click', async (e) => {
    if (e.target.id === 'pwaInstallBtn' || e.target.closest('#pwaInstallBtn')) {
        if (!deferredPrompt) {
            alert('Please use your browser menu to install this app (look for "Install" or "Add to Home Screen").');
            return;
        }
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        console.log(`User response to install: ${outcome}`);
        deferredPrompt = null;
        closePwaPrompt();
    }
});

window.closePwaPrompt = closePwaPrompt;
initPwaInstallation();

let displayName = localStorage.getItem('displayName') || username;
let avatarKey = localStorage.getItem('avatarKey') || '';

const currentChannelId = parseInt(localStorage.getItem('currentChannelId') || '1');

const isLocalDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const apiBaseUrl = isLocalDev ? window.location.origin : '';
const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const wsUrl = `${protocol}//${window.location.host}/ws?username=${encodeURIComponent(username)}&channelId=${currentChannelId}`;

let ws;
let isConnected = false;
let heartbeatInterval;
let typingTimeout;
let typingUsers = new Set();
let selectedFiles = [];
let replyingTo = null;
let editingMessageId = null;
let reactionPickerMessageId = null;
let channels = [];
let dms = [];
let customEmojis = [];
let allUsers = [];
let onlineUsernames = new Set();
let joinedUsers = new Set();
let selectedAutocompleteIndex = 0;
let filteredUsers = [];
let unreadChannels = new Set(JSON.parse(localStorage.getItem('unreadChannels') || '[]'));

// Chat history pagination variables
let currentOffset = 0;
let hasMoreMessages = false;
let isLoadingMore = false;
let isAutoLoading = false;
let lastScrollTop = 0;

// Search pagination variables
let searchOffset = 0;
let searchHasMore = false;
let searchIsLoading = false;
let searchIsAutoLoading = false;
let currentSearchParams = {};


function dismissKeyboard() {
    const input = document.getElementById('message-input');
    if (input) input.blur();
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    let html = div.innerHTML;

    // Replace custom emojis :name:
    customEmojis.forEach(emoji => {
        const emojiTag = `<img src="${isLocalDev ? `${apiBaseUrl}/api/file/` : '/api/file/'}${emoji.file_key}" alt=":${emoji.name}:" title=":${emoji.name}:" class="inline-block w-6 h-6 mx-0.5 align-bottom">`;
        const regex = new RegExp(`:${emoji.name}:`, 'g');
        html = html.replace(regex, emojiTag);
    });

    // Highlight mentions @username
    const mentionRegex = /@([\p{L}\p{N}_]+)/gu;
    html = html.replace(mentionRegex, (match, p1) => {
        const user = allUsers.find(u => u.username === p1);
        const dName = user ? (user.display_name || user.username) : p1;
        return `<span class="user-mention">@${escapeHtml(dName)}</span>`;
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

function extractYouTubeVideoId(url) {
    const patterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/|youtube\.com\/shorts\/)([^&\n?#]+)/,
    ];

    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match && match[1]) {
            return match[1];
        }
    }
    return null;
}

function playYouTube(videoId, elementId) {
    const container = document.getElementById(elementId);
    if (!container) return;

    // Maintain scroll bottom before layout change
    maintainScrollBottom(() => {
        container.innerHTML = `
            <div class="relative w-full aspect-video rounded-lg overflow-hidden bg-black mt-2">
                <iframe 
                    src="https://www.youtube.com/embed/${videoId}?autoplay=1" 
                    class="absolute top-0 left-0 w-full h-full" 
                    frameborder="0" 
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
                    referrerpolicy="strict-origin-when-cross-origin" 
                    allowfullscreen>
                </iframe>
            </div>
        `;
    });
}

function connect() {
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        isConnected = true;
        console.log('Connected to chat server');
        onlineUsernames.add(username);
        renderMembers();
        removeSystemMessage();

        // Start heartbeat
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        heartbeatInterval = setInterval(() => {
            if (isConnected) {
                ws.send(JSON.stringify({ type: 'heartbeat' }));
            }
        }, 20000); // Every 20 seconds
    };


    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);

        switch (data.type) {
            case 'history':
                if (data.offset && data.offset > 0) {
                    displayMoreMessages(data.messages, data.offset, data.hasMore);
                } else {
                    displayHistory(data.messages, data.lastReadMessageId, data.offset || 0, data.hasMore || false);
                }
                break;
            case 'chat':

                if (data.channelId === currentChannelId) {
                    displayMessage(data);
                } else {
                    markChannelUnread(data.channelId);
                }
                break;
            case 'online_list':
                onlineUsernames = new Set(data.usernames);
                // Pre-populate joinedUsers so we don't show join messages for users already online
                data.usernames.forEach(u => joinedUsers.add(u));
                renderMembers();
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
            case 'refresh_channels':
                fetchChannels();
                break;
            case 'refresh_users':
                fetchRegisteredUsers();
                break;
        }
    };

    ws.onclose = (event) => {
        isConnected = false;
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        onlineUsernames.delete(username);
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

function displayHistory(messages, lastReadMessageId = 0, offset = 0, hasMore = false) {
    const messagesContainer = document.getElementById('messages-container');
    messagesContainer.innerHTML = '';

    currentOffset = offset;
    hasMoreMessages = hasMore;
    isLoadingMore = false;
    isAutoLoading = false;

    const publicChannel = channels.find(c => c.id === currentChannelId);
    const dmChannel = dms.find(d => d.id === currentChannelId);

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
    document.getElementById('header-channel-name').textContent = channelName;

    // Update header icon
    const headerIcon = document.querySelector('#header-channel-name').previousElementSibling;
    if (headerIcon) {
        if (isDm) {
            headerIcon.setAttribute('data-lucide', 'at-sign');
        } else {
            headerIcon.setAttribute('data-lucide', 'hash');
        }
    }

    document.getElementById('message-input').placeholder = `Message ${displayTitle}`;

    // Update footer badge
    const footerBadge = document.getElementById('current-channel-badge');
    if (footerBadge) {
        footerBadge.textContent = displayTitle;
    }

    if (messages.length === 0) {
        messagesContainer.innerHTML = `
            <div class="mt-auto mb-6">
                <div class="h-16 w-16 bg-[#41434A] rounded-full flex items-center justify-center mb-4 mx-auto">
                    <i data-lucide="${isDm ? 'at-sign' : 'hash'}" class="w-10 h-10 text-white"></i>
                </div>
                <h1 class="text-3xl font-bold mb-2 text-center">Welcome to ${isDm ? 'your DM with ' : ''}${displayTitle}!</h1>
                <p class="text-[#B5BAC1] text-center">This is the start of ${isDm ? 'your conversation' : `the ${displayTitle} channel`}.</p>
            </div>
        `;
        lucide.createIcons();
        return;
    }

    if (hasMore) {
        const loadMoreBtn = document.createElement('div');
        loadMoreBtn.className = 'text-center py-4';
        loadMoreBtn.id = 'load-more-button';
        loadMoreBtn.innerHTML = `
            <button onclick="loadMoreMessages()" class="bg-[#5865F2] hover:bg-[#4752C4] text-white font-medium py-2 px-4 rounded transition-colors">
                Load More Messages
            </button>
        `;
        messagesContainer.appendChild(loadMoreBtn);
    }

    let unreadDividerShown = false;
    let maxMessageId = 0;

    console.log('Displaying', messages.length, 'messages');
    console.log('Message IDs:', messages.map(m => m.id));

    messages.forEach(msg => {
        if (msg.message || msg.file_name) {
            if (msg.id > maxMessageId) maxMessageId = msg.id;

            // Check if we need to insert the unread divider
            if (lastReadMessageId > 0 && !unreadDividerShown && msg.id > lastReadMessageId) {
                const divider = document.createElement('div');
                divider.className = 'flex items-center my-4 unread-divider';
                divider.id = 'unread-divider';
                divider.innerHTML = `
                    <div class="flex-grow h-[1px] bg-red-500 opacity-50"></div>
                    <span class="px-2 text-xs font-bold text-red-500 uppercase">New Messages</span>
                    <div class="flex-grow h-[1px] bg-red-500 opacity-50"></div>
                `;
                messagesContainer.appendChild(divider);
                unreadDividerShown = true;
            }

            displayMessage(msg, true);
        }
    });

    lucide.createIcons();

    // Scroll to bottom after loading history
    // Use a small timeout to ensure DOM is fully rendered and layout is settled
    setTimeout(() => {
        const divider = document.getElementById('unread-divider');
        const searchTargetId = localStorage.getItem('searchTargetMessageId');

        if (searchTargetId) {
            // Let the search jump handler handle it below
            return;
        }

        if (divider) {
            divider.scrollIntoView({ block: 'center' });
            lastScrollTop = messagesContainer.scrollTop;
        } else {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
            lastScrollTop = messagesContainer.scrollHeight;
        }

        // Update global scroll tracking variables
        wasAtBottom = messagesContainer.scrollHeight - messagesContainer.scrollTop - messagesContainer.clientHeight < 100;
        distanceToBottom = messagesContainer.scrollHeight - messagesContainer.scrollTop;
    }, 50);

    if (unreadDividerShown) {
        showUnreadBanner();
    }

    // Mark messages as read (update server)
    if (isConnected && maxMessageId > lastReadMessageId) {
        ws.send(JSON.stringify({
            type: 'mark_read',
            messageId: maxMessageId
        }));
    }

    // Check if we need to jump to a searched message
    const searchTargetId = localStorage.getItem('searchTargetMessageId');
    console.log('Checking for search target:', searchTargetId);
    if (searchTargetId) {
        // Increased timeout to ensure all elements are fully rendered
        console.log('Jumping to message in 500ms...');
        setTimeout(() => {
            scrollToMessage(searchTargetId);
            localStorage.removeItem('searchTargetMessageId');
        }, 500);
    }
}


function showUnreadBanner() {
    const banner = document.getElementById('unread-banner');
    if (banner) {
        banner.classList.remove('hidden');
        banner.classList.remove('-translate-y-full', 'opacity-0');
    }
}

function hideUnreadBanner() {
    const banner = document.getElementById('unread-banner');
    if (banner) {
        banner.classList.add('-translate-y-full', 'opacity-0');
        setTimeout(() => {
            banner.classList.add('hidden');
        }, 300);
    }
}

function jumpToUnread() {
    dismissKeyboard();
    const divider = document.getElementById('unread-divider');
    if (divider) {
        divider.scrollIntoView({ behavior: 'smooth', block: 'center' });
        hideUnreadBanner();
    }
}

function scrollToBottom() {
    const messagesContainer = document.getElementById('messages-container');
    messagesContainer.scrollTo({
        top: messagesContainer.scrollHeight,
        behavior: 'smooth'
    });
}

function scrollToMessage(messageId) {
    console.log('scrollToMessage called with ID:', messageId, 'Type:', typeof messageId);

    // Try different selector variations
    const selector1 = `[data-message-id="${messageId}"]`;
    const selector2 = `[data-message-id="'${messageId}'"]`;
    const selector3 = `[data-message-id='${messageId}']`;

    const msgEl1 = document.querySelector(selector1);
    const msgEl2 = document.querySelector(selector2);
    const msgEl3 = document.querySelector(selector3);

    const msgEl = msgEl1 || msgEl2 || msgEl3;

    if (!msgEl) {
        console.log('Message element not found for ID:', messageId);

        // Show user-friendly message
        showSystemMessage('Message not found. Loading older messages...');

        // Try loading older messages if there are more
        if (hasMoreMessages && !isLoadingMore) {
            loadMoreMessages();

            // Retry after loading completes
            let retryCount = 0;
            const maxRetries = 3;

            const tryFindAgain = () => {
                const element = document.querySelector(selector1) || document.querySelector(selector2) || document.querySelector(selector3);
                if (element) {
                    scrollToMessage(messageId);
                } else if (retryCount < maxRetries) {
                    retryCount++;
                    if (hasMoreMessages && !isLoadingMore) {
                        loadMoreMessages();
                        setTimeout(tryFindAgain, 500);
                    } else {
                        setTimeout(tryFindAgain, 500);
                    }
                } else {
                    removeSystemMessage(); // Clear loading message
                    showSystemMessage('Message could not be loaded. It may have been deleted.');
                }
            };

            setTimeout(tryFindAgain, 500);
        } else {
            showSystemMessage('Message not found. It may have been deleted.');
        }
        return;
    }

    // Message found! Remove any pending system messages (like "Loading older messages...")
    removeSystemMessage();

    console.log('Found message element, scrolling to it...');
    console.log('Element before highlight:', msgEl);

    // Apply inline styles for immediate visibility (using same color as mention highlight)
    msgEl.style.backgroundColor = 'rgba(250, 168, 26, 0.15)';
    msgEl.style.transition = 'background-color 0.3s ease';
    console.log('Applied inline styles');

    // Scroll to message
    msgEl.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // Remove highlight after animation
    setTimeout(() => {
        msgEl.style.backgroundColor = '';
        console.log('Removed inline styles');
    }, 3000);
}

function jumpToReply(messageId) {
    console.log('Jumping to reply:', messageId);
    scrollToMessage(messageId);
}

let lastResizeTime = 0;
let lastSendMessageTime = 0;

// Add scroll listener to auto-hide banner if we scroll up to the divider
const messagesContainer = document.getElementById('messages-container');
let wasAtBottom = true;
let distanceToBottom = 0;

messagesContainer.addEventListener('scroll', () => {
    const container = messagesContainer;
    const banner = document.getElementById('unread-banner');
    const scrollBottomBtn = document.getElementById('scroll-bottom-btn');
    const messageInput = document.getElementById('message-input');

    // Update bottom tracking
    wasAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
    distanceToBottom = container.scrollHeight - container.scrollTop;

    // Unread banner logic
    if (banner && !banner.classList.contains('hidden')) {
        const divider = document.getElementById('unread-divider');
        if (divider) {
            const rect = divider.getBoundingClientRect();
            const containerRect = container.getBoundingClientRect();

            // If divider is within view
            if (rect.top >= containerRect.top && rect.bottom <= containerRect.bottom) {
                hideUnreadBanner();
            }
        }
    }

    // Scroll to bottom button logic
    // Show if we are more than 200px away from bottom
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 200;

    if (scrollBottomBtn) {
        if (!isNearBottom) {
            scrollBottomBtn.classList.remove('opacity-0', 'pointer-events-none', 'translate-y-2');
            scrollBottomBtn.classList.add('visible');
        } else {
            scrollBottomBtn.classList.add('opacity-0', 'pointer-events-none', 'translate-y-2');
            scrollBottomBtn.classList.remove('visible');
        }
    }

    // Auto-load more messages when scrolling near top
    const isNearTop = container.scrollTop < 100;
    const scrollDistance = Math.abs(container.scrollTop - lastScrollTop);
    const isScrollingUp = lastScrollTop > container.scrollTop && scrollDistance > 10;

    if (isNearTop && hasMoreMessages && !isLoadingMore && currentOffset >= 0 && !isAutoLoading && isScrollingUp) {
        if (loadMoreMessages(false)) {
            isAutoLoading = true;
            const distanceFromBottom = container.scrollHeight - container.scrollTop;
            const loadingIndicator = document.createElement('div');
            loadingIndicator.className = 'text-center py-4';
            loadingIndicator.id = 'auto-loading-indicator';
            loadingIndicator.innerHTML = '<div class="flex items-center justify-center"><div class="animate-spin rounded-full h-6 w-6 border-2 border-white border-t-transparent"></div>Loading older messages...</div>';
            container.insertBefore(loadingIndicator, container.firstChild);

            // Preserve scroll position relative to bottom
            container.scrollTop = container.scrollHeight - distanceFromBottom;

            // Debounce: prevent rapid repeated loading
            setTimeout(() => {
                isAutoLoading = false;
            }, 500);
        }
    }

    lastScrollTop = container.scrollTop;
});

// Handle images and other media loading to maintain scroll position
const handleMediaLayoutChange = (e) => {
    if (e.target.tagName === 'IMG' || e.target.tagName === 'VIDEO' || e.target.tagName === 'IFRAME') {
        if (wasAtBottom) {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        } else {
            const rect = e.target.getBoundingClientRect();
            const containerRect = messagesContainer.getBoundingClientRect();
            if (rect.top < containerRect.top) {
                // Media loaded above current view, preserve distance to bottom
                // to prevent the content from jumping down
                messagesContainer.scrollTop = messagesContainer.scrollHeight - distanceToBottom;
            }
        }
    }
};

messagesContainer.addEventListener('load', handleMediaLayoutChange, true);
messagesContainer.addEventListener('error', handleMediaLayoutChange, true);

function createMessageElement(data, isHistory = false) {
    const time = new Date(data.timestamp).toLocaleTimeString();
    const date = new Date(data.timestamp).toLocaleDateString();
    const isOwnMessage = data.username === username;

    const display_name = data.displayName || data.display_name || data.username;
    const avatar_key = data.avatarKey || data.avatar_key || data.user_avatar;

    const avatarUrl = avatar_key
        ? (isLocalDev ? `${apiBaseUrl}/api/file/${avatar_key}` : `/api/file/${avatar_key}`)
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

    // For history loading, we currently disable grouping to keep it simple and safe
    const shouldGroup = false;

    // Persistent Highlight Check
    const isMentioned = (data.mentions && data.mentions.includes(username)) ||
        (data.reply_username === username) ||
        (data.message && (
            data.message.includes(`@${username}`) ||
            data.message.includes('@everyone') ||
            data.message.includes('@here')
        ));

    // Prepare Reply HTML (to show at top of content)
    let replyHtml = '';
    if (data.reply_to) {
        const replyTime = new Date(data.reply_timestamp).toLocaleTimeString();
        const replyFileUrl = data.reply_file_key
            ? (isLocalDev ? `${apiBaseUrl}/api/file/${data.reply_file_key}` : `/api/file/${data.reply_file_key}`)
            : null;

        // Use a simpler layout for inside-content reply, matching displayMessage logic
        replyHtml = `
            <div class="flex items-center gap-1 mb-0.5 opacity-60 hover:opacity-100 cursor-pointer transition-opacity select-none" onclick="event.stopPropagation(); jumpToReply(${data.reply_to})">
                <i data-lucide="corner-up-left" class="w-3 h-3 text-[#949BA4] mr-1"></i>
                <span class="text-xs font-semibold text-[#b5bac1] hover:underline">@${escapeHtml(data.reply_username)}</span>
                <span class="text-xs text-[#949BA4] truncate max-w-[300px]">${escapeHtml(data.reply_message || (data.reply_file_name ? 'Attachment' : ''))}</span>
            </div>
        `;
    }

    let messageHtml = '';

    if (!shouldGroup) {
        messageHtml += `
            <div class="mt-0.5 mr-4 cursor-pointer hover:opacity-80 transition-opacity" onclick="openUserDetailModal('${escapeHtml(data.username)}')">
                <img src="${avatarUrl}" alt="${escapeHtml(display_name)}" class="w-10 h-10 rounded-full object-cover">
            </div>
            <div class="flex-1 min-w-0">
                ${replyHtml}
                <div class="flex items-center">
                    <span class="font-medium mr-2 hover:underline cursor-pointer text-[#dbdee1]" onclick="openUserDetailModal('${escapeHtml(data.username)}')">
                        ${escapeHtml(display_name)}
                    </span>
                    <span class="text-xs text-[#949BA4] ml-1">${date} - ${time}</span>
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
        const ytVideoId = extractYouTubeVideoId(linkMetadata.url);

        if (ytVideoId) {
            const playerContainerId = `yt-player-${data.id || Math.random().toString(36).substr(2, 9)}`;
            messageHtml += `
                <div class="mt-2 max-w-full">
                    <div id="${playerContainerId}">
                        <div class="relative group/yt cursor-pointer rounded-lg overflow-hidden max-w-[400px]" onclick="playYouTube('${ytVideoId}', '${playerContainerId}')">
                            <img src="${escapeHtml(linkMetadata.image || `https://img.youtube.com/vi/${ytVideoId}/hqdefault.jpg`)}" alt="YouTube thumbnail" class="w-full h-auto">
                            <div class="absolute inset-0 flex items-center justify-center bg-black/20 group-hover/yt:bg-black/40 transition-colors">
                                <div class="w-16 h-11 bg-[#FF0000] rounded-lg flex items-center justify-center shadow-lg group-hover/yt:scale-110 transition-transform">
                                    <div class="w-0 h-0 border-t-[8px] border-t-transparent border-l-[14px] border-l-white border-b-[8px] border-b-transparent ml-1"></div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <a href="${escapeHtml(linkMetadata.url)}" target="_blank" class="block mt-2">
                        ${linkMetadata.title ? `<div class="text-[#00A8FC] hover:underline font-medium">${escapeHtml(linkMetadata.title)}</div>` : ''}
                        ${linkMetadata.description ? `<div class="text-sm text-[#949BA4] mt-1">${escapeHtml(linkMetadata.description)}</div>` : ''}
                    </a>
                </div>
            `;
        } else {
            messageHtml += `
                <a href="${escapeHtml(linkMetadata.url)}" target="_blank" class="block mt-2 ${!hasImage ? 'border-l-2 border-[#5865F2] pl-3' : ''}">
                    ${hasImage ? `<img src="${escapeHtml(linkMetadata.image)}" alt="Link preview" class="rounded-lg max-w-full mb-2">` : ''}
                    ${linkMetadata.title ? `<div class="text-[#00A8FC] hover:underline font-medium">${escapeHtml(linkMetadata.title)}</div>` : ''}
                    ${linkMetadata.description ? `<div class="text-sm text-[#949BA4] mt-1">${escapeHtml(linkMetadata.description)}</div>` : ''}
                </a>
            `;
        }
    }

    if (fileAttachment && fileAttachment.key) {
        const fileUrl = isLocalDev
            ? `${apiBaseUrl}/api/file/${fileAttachment.key}`
            : `/api/file/${fileAttachment.key}`;

        if (fileAttachment.type && fileAttachment.type.startsWith('image/')) {
            messageHtml += `
                <div class="mt-2 group/image relative">
                    <img src="${fileUrl}" alt="${escapeHtml(fileAttachment.name)}" class="rounded-lg max-w-[300px] cursor-pointer hover:opacity-90" onclick="openImageModal('${fileUrl}')" onerror="this.style.display='none'">
                    <a href="${fileUrl}" download="${escapeHtml(fileAttachment.name)}" class="absolute bottom-2 right-2 bg-[#5865F2] hover:bg-[#4752C4] text-white p-2 rounded-full shadow-lg opacity-0 group-hover/image:opacity-100 transition-opacity" title="Download">
                        <i data-lucide="download" class="w-4 h-4"></i>
                    </a>
                </div>
            `;
        } else if (fileAttachment.type && fileAttachment.type.startsWith('video/')) {
            messageHtml += `
                <div class="mt-2 group/video relative max-w-[400px]">
                    <video src="${fileUrl}" controls preload="metadata" class="w-full rounded-lg bg-black/20"></video>
                    <a href="${fileUrl}" download="${escapeHtml(fileAttachment.name)}" class="absolute top-2 right-2 bg-[#5865F2] hover:bg-[#4752C4] text-white p-1.5 rounded-full shadow-lg opacity-0 group-hover/video:opacity-100 transition-opacity" title="Download">
                        <i data-lucide="download" class="w-3 h-3"></i>
                    </a>
                </div>
            `;
        } else {
            messageHtml += `
                <div class="flex items-center mt-2 bg-[#2B2D31] hover:bg-[#36383E] p-3 rounded-lg transition-colors">
                    <div class="text-2xl mr-3">${getFileIcon(fileAttachment.type)}</div>
                    <div class="flex-1 min-w-0">
                        <div class="text-[#dbdee1] font-medium truncate">${escapeHtml(fileAttachment.name)}</div>
                        <div class="text-xs text-[#949BA4]">${formatFileSize(fileAttachment.size)}</div>
                    </div>
                    <a href="${fileUrl}" download="${escapeHtml(fileAttachment.name)}" class="ml-2 p-2 hover:bg-[#404249] rounded transition-colors" title="Download">
                        <i data-lucide="download" class="w-5 h-5 text-[#949BA4] hover:text-[#dbdee1]"></i>
                    </a>
                </div>
            `;
        }
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
                    emojiDisplay = `<img src="${isLocalDev ? `${apiBaseUrl}/api/file/` : '/api/file/'}${customEmoji.file_key}" class="w-4 h-4 inline-block">`;
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

    const msgEl = document.createElement('div');
    msgEl.className = `group flex pr-4 hover:bg-[#2e3035] -mx-4 px-4 py-0.5 ${shouldGroup ? 'mt-0' : 'mt-[17px]'} relative message-group ${isMentioned ? 'mention-highlight' : ''}`;
    msgEl.dataset.messageId = data.id || '';

    msgEl.dataset.username = data.username;
    msgEl.dataset.timestamp = data.timestamp;
    msgEl.dataset.text = data.message || '';
    if (fileAttachment && fileAttachment.key) {
        msgEl.dataset.fileKey = fileAttachment.key;
        msgEl.dataset.fileName = fileAttachment.name;
        msgEl.dataset.fileType = fileAttachment.type;
    }

    msgEl.innerHTML = messageHtml;

    // Add swipe-to-reply indicator for mobile
    const swipeIndicator = document.createElement('div');
    swipeIndicator.className = 'reply-swipe-indicator';
    swipeIndicator.innerHTML = '<i data-lucide="reply" class="w-5 h-5"></i>';
    msgEl.appendChild(swipeIndicator);

    return msgEl;
}

function loadMoreMessages(showButtonLoading = true) {
    if (isLoadingMore || !hasMoreMessages) return false;

    isLoadingMore = true;
    if (showButtonLoading) {
        const loadMoreBtn = document.getElementById('load-more-button');
        if (loadMoreBtn) {
            loadMoreBtn.innerHTML = '<div class="flex items-center justify-center"><div class="animate-spin rounded-full h-6 w-6 border-2 border-white border-t-transparent mr-2"></div>Loading more messages...</div>';
        }
    }

    ws.send(JSON.stringify({
        type: 'load_history',
        offset: currentOffset + 25, // History uses 25 messages per page in ChatRoom.ts
        limit: 25
    }));
    return true;
}

function displayMoreMessages(messages, newOffset, hasMore) {
    try {
        const messagesContainer = document.getElementById('messages-container');
        const loadMoreBtn = document.getElementById('load-more-button');
        const loadingIndicator = document.getElementById('auto-loading-indicator');

        currentOffset = newOffset;
        hasMoreMessages = hasMore;

        // Get current scroll position relative to bottom before any changes
        const distanceFromBottom = messagesContainer.scrollHeight - messagesContainer.scrollTop;

        if (loadingIndicator) {
            loadingIndicator.remove();
        }

        const fragment = document.createDocumentFragment();

        messages.forEach(msg => {
            if (msg.message || msg.file_name) {
                const msgEl = createMessageElement(msg, true);
                fragment.appendChild(msgEl);
            }
        });

        // Insert new messages at top (above button or at container start)
        messagesContainer.insertBefore(fragment, loadMoreBtn ? loadMoreBtn.nextSibling : messagesContainer.firstChild);

        lucide.createIcons();

        // Preserve scroll position relative to bottom
        messagesContainer.scrollTop = messagesContainer.scrollHeight - distanceFromBottom;
        lastScrollTop = messagesContainer.scrollTop;

        if (!hasMore || messages.length === 0) {
            if (loadMoreBtn) {
                loadMoreBtn.remove();
            }
        } else if (loadMoreBtn) {
            loadMoreBtn.innerHTML = `
                <button onclick="loadMoreMessages()" class="bg-[#5865F2] hover:bg-[#4752C4] text-white font-medium py-2 px-4 rounded transition-colors">
                    Load More Messages
                </button>
            `;
            lucide.createIcons();
        }
    } finally {
        isLoadingMore = false;
        isAutoLoading = false;
    }
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
        ? (isLocalDev ? `${apiBaseUrl}/api/file/${avatar_key}` : `/api/file/${avatar_key}`)
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
        shouldGroup = prevUsername === data.username && timeDiff < 60000 && !data.reply_to;
    }

    // Persistent Highlight Check
    const isMentioned = (data.mentions && data.mentions.includes(username)) ||
        (data.reply_username === username) ||
        (data.message && (
            data.message.includes(`@${username}`) ||
            data.message.includes('@everyone') ||
            data.message.includes('@here')
        ));

    const msgEl = document.createElement('div');
    msgEl.className = `group flex pr-4 hover:bg-[#2e3035] -mx-4 px-4 py-0.5 ${shouldGroup ? 'mt-0' : 'mt-[17px]'} relative message-group ${isMentioned ? 'mention-highlight' : ''}`;
    msgEl.dataset.messageId = data.id || '';
    console.log('Created message element with ID:', data.id);



    msgEl.dataset.username = data.username;
    msgEl.dataset.timestamp = data.timestamp;
    msgEl.dataset.text = data.message || '';
    if (fileAttachment && fileAttachment.key) {
        msgEl.dataset.fileKey = fileAttachment.key;
        msgEl.dataset.fileName = fileAttachment.name;
        msgEl.dataset.fileType = fileAttachment.type;
    }

    // Prepare Reply HTML (to show at top of content)
    let replyHtml = '';
    if (data.reply_to) {
        const replyTime = new Date(data.reply_timestamp).toLocaleTimeString();
        const replyFileUrl = data.reply_file_key
            ? (isLocalDev ? `${apiBaseUrl}/api/file/${data.reply_file_key}` : `/api/file/${data.reply_file_key}`)
            : null;

        replyHtml = `
            <div class="flex items-center gap-2 mb-1 opacity-80 hover:opacity-100 cursor-pointer transition-opacity group/reply select-none" onclick="event.stopPropagation(); jumpToReply(${data.reply_to})">
                <div class="w-8 flex justify-end">
                    <div class="w-6 h-3 border-l-2 border-t-2 border-[#949BA4] rounded-tl ml-auto mt-2"></div>
                </div>
                <div class="flex items-center gap-1 text-xs text-[#949BA4] flex-1 min-w-0">
                    <img src="${isLocalDev ? `${apiBaseUrl}/api/file/${data.reply_file_key}` : `/api/file/${data.reply_file_key}`}" class="w-4 h-4 rounded-full object-cover hidden"> 
                    <!-- We don't have author avatar in reply data easily available, so skip for now or use generic -->
                    <span class="font-semibold text-[#b5bac1] whitespace-nowrap">@${escapeHtml(data.reply_username)}</span>
                    <span class="truncate flex-1 hover:text-white transition-colors">${escapeHtml(data.reply_message || (data.reply_file_name ? 'Click to see attachment' : ''))}</span>
                </div>
            </div>
        `;

        // Use a simpler layout for inside-content reply
        replyHtml = `
            <div class="flex items-center gap-1 mb-0.5 opacity-60 hover:opacity-100 cursor-pointer transition-opacity select-none" onclick="event.stopPropagation(); jumpToReply(${data.reply_to})">
                <i data-lucide="corner-up-left" class="w-3 h-3 text-[#949BA4] mr-1"></i>
                <span class="text-xs font-semibold text-[#b5bac1] hover:underline">@${escapeHtml(data.reply_username)}</span>
                <span class="text-xs text-[#949BA4] truncate max-w-[300px]">${escapeHtml(data.reply_message || (data.reply_file_name ? 'Attachment' : ''))}</span>
            </div>
        `;
    }


    let messageHtml = '';

    if (!shouldGroup) {
        messageHtml += `
            <div class="mt-0.5 mr-4 cursor-pointer hover:opacity-80 transition-opacity" onclick="openUserDetailModal('${escapeHtml(data.username)}')">
                <img src="${avatarUrl}" alt="${escapeHtml(display_name)}" class="w-10 h-10 rounded-full object-cover">
            </div>
            <div class="flex-1 min-w-0">
                ${replyHtml}
                <div class="flex items-center">
                    <span class="font-medium mr-2 hover:underline cursor-pointer text-[#dbdee1]" onclick="openUserDetailModal('${escapeHtml(data.username)}')">
                        ${escapeHtml(display_name)}
                    </span>
                    <span class="text-xs text-[#949BA4] ml-1">${date} - ${time}</span>
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
        const ytVideoId = extractYouTubeVideoId(linkMetadata.url);

        if (ytVideoId) {
            const playerContainerId = `yt-player-${data.id || Math.random().toString(36).substr(2, 9)}`;
            messageHtml += `
                <div class="mt-2 max-w-full">
                    <div id="${playerContainerId}">
                        <div class="relative group/yt cursor-pointer rounded-lg overflow-hidden max-w-[400px]" onclick="playYouTube('${ytVideoId}', '${playerContainerId}')">
                            <img src="${escapeHtml(linkMetadata.image || `https://img.youtube.com/vi/${ytVideoId}/hqdefault.jpg`)}" alt="YouTube thumbnail" class="w-full h-auto">
                            <div class="absolute inset-0 flex items-center justify-center bg-black/20 group-hover/yt:bg-black/40 transition-colors">
                                <div class="w-16 h-11 bg-[#FF0000] rounded-lg flex items-center justify-center shadow-lg group-hover/yt:scale-110 transition-transform">
                                    <div class="w-0 h-0 border-t-[8px] border-t-transparent border-l-[14px] border-l-white border-b-[8px] border-b-transparent ml-1"></div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <a href="${escapeHtml(linkMetadata.url)}" target="_blank" class="block mt-2">
                        ${linkMetadata.title ? `<div class="text-[#00A8FC] hover:underline font-medium">${escapeHtml(linkMetadata.title)}</div>` : ''}
                        ${linkMetadata.description ? `<div class="text-sm text-[#949BA4] mt-1">${escapeHtml(linkMetadata.description)}</div>` : ''}
                    </a>
                </div>
            `;
        } else {
            messageHtml += `
                <a href="${escapeHtml(linkMetadata.url)}" target="_blank" class="block mt-2 ${!hasImage ? 'border-l-2 border-[#5865F2] pl-3' : ''}">
                    ${hasImage ? `<img src="${escapeHtml(linkMetadata.image)}" alt="Link preview" class="rounded-lg max-w-full mb-2">` : ''}
                    ${linkMetadata.title ? `<div class="text-[#00A8FC] hover:underline font-medium">${escapeHtml(linkMetadata.title)}</div>` : ''}
                    ${linkMetadata.description ? `<div class="text-sm text-[#949BA4] mt-1">${escapeHtml(linkMetadata.description)}</div>` : ''}
                </a>
            `;
        }
    }

    if (fileAttachment && fileAttachment.key) {
        const fileUrl = isLocalDev
            ? `${apiBaseUrl}/api/file/${fileAttachment.key}`
            : `/api/file/${fileAttachment.key}`;

        if (fileAttachment.type && fileAttachment.type.startsWith('image/')) {
            messageHtml += `
                <div class="mt-2 group/image relative">
                    <img src="${fileUrl}" alt="${escapeHtml(fileAttachment.name)}" class="rounded-lg max-w-[300px] cursor-pointer hover:opacity-90" onclick="openImageModal('${fileUrl}')" onerror="this.style.display='none'">
                    <a href="${fileUrl}" download="${escapeHtml(fileAttachment.name)}" class="absolute bottom-2 right-2 bg-[#5865F2] hover:bg-[#4752C4] text-white p-2 rounded-full shadow-lg opacity-0 group-hover/image:opacity-100 transition-opacity" title="Download">
                        <i data-lucide="download" class="w-4 h-4"></i>
                    </a>
                </div>
            `;
        } else if (fileAttachment.type && fileAttachment.type.startsWith('video/')) {
            messageHtml += `
                <div class="mt-2 group/video relative max-w-[400px]">
                    <video src="${fileUrl}" controls preload="metadata" class="w-full rounded-lg bg-black/20"></video>
                    <a href="${fileUrl}" download="${escapeHtml(fileAttachment.name)}" class="absolute top-2 right-2 bg-[#5865F2] hover:bg-[#4752C4] text-white p-1.5 rounded-full shadow-lg opacity-0 group-hover/video:opacity-100 transition-opacity" title="Download">
                        <i data-lucide="download" class="w-3 h-3"></i>
                    </a>
                </div>
            `;
        } else {
            messageHtml += `
                <div class="flex items-center mt-2 bg-[#2B2D31] hover:bg-[#36383E] p-3 rounded-lg transition-colors">
                    <div class="text-2xl mr-3">${getFileIcon(fileAttachment.type)}</div>
                    <div class="flex-1 min-w-0">
                        <div class="text-[#dbdee1] font-medium truncate">${escapeHtml(fileAttachment.name)}</div>
                        <div class="text-xs text-[#949BA4]">${formatFileSize(fileAttachment.size)}</div>
                    </div>
                    <a href="${fileUrl}" download="${escapeHtml(fileAttachment.name)}" class="ml-2 p-2 hover:bg-[#404249] rounded transition-colors" title="Download">
                        <i data-lucide="download" class="w-5 h-5 text-[#949BA4] hover:text-[#dbdee1]"></i>
                    </a>
                </div>
            `;
        }
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
                    emojiDisplay = `<img src="${isLocalDev ? `${apiBaseUrl}/api/file/` : '/api/file/'}${customEmoji.file_key}" class="w-4 h-4 inline-block">`;
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


    if (!isHistory) {
        // Preserve scroll position before appending new message
        const wasNearBottom = messagesContainer.scrollHeight - messagesContainer.scrollTop - messagesContainer.clientHeight < 100;
        const oldScrollTop = messagesContainer.scrollTop;

        msgEl.innerHTML = messageHtml;

        // Add swipe-to-reply indicator for mobile
        const swipeIndicator = document.createElement('div');
        swipeIndicator.className = 'reply-swipe-indicator';
        swipeIndicator.innerHTML = '<i data-lucide="reply" class="w-5 h-5"></i>';
        msgEl.appendChild(swipeIndicator);

        // Add animation class for new messages
        msgEl.classList.add('new-message');
        setTimeout(() => msgEl.classList.remove('new-message'), 300);

        messagesContainer.appendChild(msgEl);

        lucide.createIcons();

        // Always scroll to own message, otherwise preserve scroll position
        if (isOwnMessage) {
            msgEl.scrollIntoView({ block: 'end' });
            lastScrollTop = messagesContainer.scrollTop;
        } else if (wasNearBottom) {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
            lastScrollTop = messagesContainer.scrollHeight;
        } else {
            // Restore previous scroll position
            messagesContainer.scrollTop = oldScrollTop;
            lastScrollTop = oldScrollTop;
        }
    } else {
        msgEl.innerHTML = messageHtml;

        // Add swipe-to-reply indicator for mobile
        const swipeIndicator = document.createElement('div');
        swipeIndicator.className = 'reply-swipe-indicator';
        swipeIndicator.innerHTML = '<i data-lucide="reply" class="w-5 h-5"></i>';
        msgEl.appendChild(swipeIndicator);

        messagesContainer.appendChild(msgEl);
        lucide.createIcons();
    }
}


function startReply(messageId) {
    replyingTo = { messageId };

    const replyBanner = document.getElementById('replyBanner');
    const replyToUsernameEl = document.getElementById('reply-to-username');
    const replyToContentEl = document.getElementById('reply-to-content');
    const replyToMediaEl = document.getElementById('reply-to-media');

    const msgEl = document.querySelector(`[data-message-id="${messageId}"]`);
    if (msgEl) {
        replyToUsernameEl.textContent = msgEl.dataset.username;
        replyToContentEl.textContent = msgEl.dataset.text || '';

        if (msgEl.dataset.fileKey) {
            replyToMediaEl.classList.remove('hidden');
            const fileUrl = isLocalDev
                ? `${apiBaseUrl}/api/file/${msgEl.dataset.fileKey}`
                : `/api/file/${msgEl.dataset.fileKey}`;

            if (msgEl.dataset.fileType && msgEl.dataset.fileType.startsWith('image/')) {
                replyToMediaEl.innerHTML = `<img src="${fileUrl}" class="w-12 h-12 rounded object-cover">`;
            } else {
                replyToMediaEl.innerHTML = `<div class="bg-[#2B2D31] p-1 rounded"><i data-lucide="file" class="w-6 h-6"></i></div>`;
            }
        } else {
            replyToMediaEl.classList.add('hidden');
            replyToMediaEl.innerHTML = '';
        }
    } else {
        replyToUsernameEl.textContent = 'Unknown';
        replyToContentEl.textContent = '';
        replyToMediaEl.classList.add('hidden');
    }

    replyBanner.classList.remove('hidden');

    // Add animation
    replyBanner.classList.remove('active');
    void replyBanner.offsetWidth; // Trigger reflow
    replyBanner.classList.add('active');

    lucide.createIcons();
    document.getElementById('message-input').focus();

    // Scroll message into view if it might be covered
    if (msgEl) {
        setTimeout(() => {
            msgEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
    }
}

function cancelReply() {
    maintainScrollBottom(() => {
        replyingTo = null;
        const replyBanner = document.getElementById('replyBanner');
        const replyToMediaEl = document.getElementById('reply-to-media');
        replyBanner.classList.add('hidden');
        if (replyToMediaEl) replyToMediaEl.innerHTML = '';

        // Ensure keyboard stays open if it was open
        const input = document.getElementById('message-input');
        if (document.activeElement === input) {
            input.focus();
        }
    });
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
    editModal.classList.add('visible');
    setTimeout(() => editModal.classList.remove('visible'), 300);
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
        onlineUsernames.add(data.username);
        // If user is not in our registered list, fetch the updated list
        if (!allUsers.find(u => u.username === data.username)) {
            fetchRegisteredUsers();
        }
        // Only show join message if this is first time seeing this user
        if (!joinedUsers.has(data.username)) {
            joinedUsers.add(data.username);
            showPresenceMessage(`${escapeHtml(userDisplayName)} joined the chat`);
        }
    } else if (data.event === 'user_left') {
        onlineUsernames.delete(data.username);
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

function maintainScrollBottom(callback) {
    const messagesContainer = document.getElementById('messages-container');
    if (!messagesContainer) return callback();

    // Check if we are near bottom before changing layout
    const wasNearBottom = messagesContainer.scrollHeight - messagesContainer.scrollTop - messagesContainer.clientHeight < 100;

    const result = callback();

    // If we were at bottom, stay at bottom after layout change
    if (wasNearBottom) {
        setTimeout(() => {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }, 0);
    }

    return result;
}

function showTypingIndicator() {
    const typingIndicator = document.getElementById('typingIndicator');
    const typingText = document.getElementById('typing-text');
    const users = Array.from(typingUsers);

    maintainScrollBottom(() => {
        const isCurrentlyHidden = typingIndicator.classList.contains('hidden');

        if (users.length === 0) {
            if (!isCurrentlyHidden) {
                typingIndicator.classList.add('hidden');
            }
            return;
        }

        typingIndicator.classList.remove('hidden');
        typingIndicator.classList.add('active');

        if (users.length === 1) {
            typingText.textContent = `${escapeHtml(users[0])} is typing...`;
        } else if (users.length === 2) {
            typingText.textContent = `${escapeHtml(users[0])} and ${escapeHtml(users[1])} are typing...`;
        } else {
            typingText.textContent = `${users.length} people are typing...`;
        }
    });
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

function updateSendButtonVisibility() {
    const sendBtn = document.getElementById('send-message-btn');
    const input = document.getElementById('message-input');
    if (!sendBtn || !input) return;

    const hasContent = input.value.trim().length > 0 || selectedFiles.length > 0;

    if (hasContent) {
        sendBtn.classList.add('visible');
    } else {
        sendBtn.classList.remove('visible');
    }
}

function handleFileSelect(event) {
    const files = Array.from(event.target.files);
    if (files.length === 0) return;

    const newCount = selectedFiles.length + files.length;
    if (newCount > 20) {
        alert(`You can only upload up to 20 files at a time.`);
        return;
    }

    files.forEach(file => {
        if (file.size > 50 * 1024 * 1024) {
            alert(`File "${file.name}" is too large. Maximum size is 50MB per file.`);
        } else {
            processFile(file);
        }
    });

    // Clear the input so the same file can be selected again
    event.target.value = '';
}

function processFile(file) {
    // We store the raw file object now
    selectedFiles.push({
        file: file,
        name: file.name,
        type: file.type,
        size: file.size,
        // Preview URL for UI
        previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : null
    });

    showFilePreview();
    updateSendButtonVisibility();
}

function handlePaste(event) {
    const items = Array.from(event.clipboardData?.items || []);
    const files = Array.from(event.clipboardData?.files || []);

    for (const item of items) {
        if (item.type.startsWith('image/') || item.type.startsWith('video/')) {
            const file = item.getAsFile();
            if (file && !files.find(f => f.name === file.name)) {
                files.push(file);
            }
        }
    }

    if (files.length > 0) {
        event.preventDefault();
        files.forEach(file => processFile(file));
    }
}

function handleDragEnter(event) {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'copy';
    console.log('Drag enter on:', event.target);

    const overlay = document.getElementById('drag-drop-overlay');
    if (overlay) {
        overlay.classList.remove('hidden');
        lucide.createIcons();
    }
}

function handleDragOver(event) {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'copy';
}

function handleDragLeave(event) {
    event.preventDefault();
    event.stopPropagation();

    const overlay = document.getElementById('drag-drop-overlay');
    const relatedTarget = event.relatedTarget;

    if (overlay && (!relatedTarget || !overlay.contains(relatedTarget) && event.target.id === 'app')) {
        console.log('Drag leave');
        overlay.classList.add('hidden');
    }
}

function handleDrop(event) {
    event.preventDefault();
    event.stopPropagation();
    console.log('Drop on:', event.target);

    const overlay = document.getElementById('drag-drop-overlay');
    if (overlay) overlay.classList.add('hidden');

    const files = Array.from(event.dataTransfer.files);
    console.log('Files dropped:', files.length, files.map(f => f.name));
    if (files.length > 0) {
        files.forEach(file => processFile(file));
    }
}

async function calculateFileHash(file) {
    const arrayBuffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function uploadFileWithProgress(fileItem, index) {
    return new Promise(async (resolve, reject) => {
        // 1. Calculate hash and check if server already has it
        const bar = document.getElementById(`progress-bar-${index}`);
        const container = document.getElementById(`progress-container-${index}`);
        if (container) container.style.display = 'block';

        try {
            const hash = await calculateFileHash(fileItem.file);
            const checkRes = await fetch(`/api/upload/check?hash=${hash}`);
            const checkData = await checkRes.json();

            if (checkData.exists) {
                // Instant upload!
                if (bar) bar.style.width = '100%';
                setTimeout(() => {
                    resolve({
                        name: fileItem.name,
                        type: fileItem.type,
                        size: fileItem.size,
                        key: checkData.key
                    });
                }, 100);
                return;
            }
        } catch (e) {
            console.warn('Deduplication check failed, proceeding with normal upload', e);
        }

        // 2. Normal upload if not found
        const formData = new FormData();
        formData.append('file', fileItem.file);
        formData.append('username', username);

        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/upload', true);

        xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
                const percentComplete = (e.loaded / e.total) * 100;
                if (bar) bar.style.width = percentComplete + '%';
            }
        };

        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                resolve(JSON.parse(xhr.responseText));
            } else {
                reject(new Error(`Upload failed: ${xhr.statusText}`));
            }
        };

        xhr.onerror = () => reject(new Error('Network error during upload'));
        xhr.send(formData);
    });
}

function showFilePreview() {
    maintainScrollBottom(() => {
        const preview = document.getElementById('filePreview');

        if (selectedFiles.length === 0) {
            hideFilePreview();
            return;
        }

        preview.classList.remove('hidden');
        let previewHtml = '';

        selectedFiles.forEach((file, index) => {
            if (file.type.startsWith('image/')) {
                previewHtml += `
                    <div class="relative group" id="preview-${index}">
                        <img src="${file.previewUrl}" alt="Preview" class="w-16 h-16 rounded-lg object-cover border border-[#404249]">
                        <button type="button" class="absolute -top-1 -right-1 bg-red-500 hover:bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center shadow-lg transition-transform hover:scale-110" onclick="removeFile(${index})">✕</button>
                        <div class="upload-progress-container" id="progress-container-${index}">
                            <div class="upload-progress-bar" id="progress-bar-${index}"></div>
                        </div>
                    </div>
                `;
            } else {
                previewHtml += `
                    <div class="relative group bg-[#2B2D31] p-3 rounded-lg border border-[#404249] flex items-center gap-2" id="preview-${index}">
                        <div class="text-xl">${getFileIcon(file.type)}</div>
                        <div class="text-[10px] text-[#dbdee1] max-w-[60px] truncate">${escapeHtml(file.name)}</div>
                        <button type="button" class="absolute -top-1 -right-1 bg-red-500 hover:bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center shadow-lg transition-transform hover:scale-110" onclick="removeFile(${index})">✕</button>
                        <div class="upload-progress-container" id="progress-container-${index}">
                            <div class="upload-progress-bar" id="progress-bar-${index}"></div>
                        </div>
                    </div>
                `;
            }
        });

        preview.innerHTML = previewHtml;
    });
}

function hideFilePreview() {
    maintainScrollBottom(() => {
        const preview = document.getElementById('filePreview');
        preview.classList.add('hidden');
        preview.innerHTML = '';
    });
}

function removeFile(index) {
    const file = selectedFiles[index];
    if (file && file.previewUrl) {
        URL.revokeObjectURL(file.previewUrl);
    }
    selectedFiles.splice(index, 1);

    if (selectedFiles.length === 0) {
        const fileInput = document.getElementById('fileInput');
        fileInput.value = '';
        hideFilePreview();
    } else {
        showFilePreview();
    }
    updateSendButtonVisibility();

    // Ensure keyboard stays open if it was open
    const input = document.getElementById('message-input');
    if (document.activeElement === input) {
        input.focus();
    }
}

async function fetchChannels() {
    try {
        const apiUrl = isLocalDev
            ? `${apiBaseUrl}/api/channels`
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
            ? `${apiBaseUrl}/api/emojis`
            : '/api/emojis';
        const response = await fetch(apiUrl);
        customEmojis = await response.json();
    } catch (error) {
        console.error('Error fetching emojis:', error);
    }
}

async function fetchRegisteredUsers() {
    try {
        const apiUrl = isLocalDev
            ? `${apiBaseUrl}/api/users/list?t=${Date.now()}`
            : `/api/users/list?t=${Date.now()}`;
        const response = await fetch(apiUrl);
        allUsers = await response.json();
        renderMembers();
    } catch (error) {
        console.error('Error fetching registered users:', error);
    }
}

function markChannelUnread(channelId) {
    unreadChannels.add(channelId);
    localStorage.setItem('unreadChannels', JSON.stringify(Array.from(unreadChannels)));
    displayChannels();
}

function displayChannels() {

    const channelsContainer = document.getElementById('channels-container');
    if (!channelsContainer) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'mt-2';

    channels.forEach(channel => {
        const isActive = channel.id === currentChannelId;
        const isUnread = unreadChannels.has(channel.id) && !isActive;
        const channelEl = document.createElement('div');
        channelEl.className = `channel-item flex items-center px-2 py-[6px] rounded-[4px] cursor-pointer group mb-[2px] ${isActive ? 'bg-[#404249] text-white' : 'text-[#949BA4] hover:bg-[#35373C] hover:text-[#dbdee1]'}`;
        channelEl.onclick = () => switchChannel(channel.id);

        channelEl.innerHTML = `
            <i data-lucide="hash" class="mr-1.5 w-5 h-5 text-[#80848E] flex-shrink-0"></i>
            <span class="font-medium truncate flex-1 ${isUnread ? 'text-white font-bold' : ''}">${escapeHtml(channel.name)}</span>
            ${isUnread ? '<div class="unread-badge w-2 h-2 bg-white rounded-full ml-1"></div>' : ''}
            ${channel.id !== 1 ? `
                <button class="delete-btn ml-auto opacity-0 group-hover:opacity-100 hover:bg-red-500/20 hover:text-red-400 text-[#949BA4] p-1 rounded cursor-pointer"
                        onclick="event.stopPropagation(); if(confirm('Are you sure you want to delete this channel? All messages in this channel will be deleted.')) deleteChannel(${channel.id})"
                        title="Delete channel">
                    <i data-lucide="trash-2" class="w-[14px] h-[14px]"></i>
                </button>
            ` : ''}
        `;

        // Add animation to unread badge
        if (isUnread) {
            const badge = channelEl.querySelector('.unread-badge');
            if (badge) {
                setTimeout(() => {
                    badge.classList.add('updated');
                    setTimeout(() => badge.classList.remove('updated'), 500);
                }, 10);
            }
        }

        wrapper.appendChild(channelEl);
    });

    channelsContainer.innerHTML = '';
    channelsContainer.appendChild(wrapper);
    lucide.createIcons();
}

function switchChannel(channelId) {
    if (channelId === currentChannelId) return;
    dismissKeyboard();

    unreadChannels.delete(channelId);
    localStorage.setItem('unreadChannels', JSON.stringify(Array.from(unreadChannels)));

    localStorage.setItem('currentChannelId', channelId);
    window.location.reload();
}

let escapeHandler = null;

function openCreateChannelModal() {
    dismissKeyboard();
    const modal = document.getElementById('createChannelModal');
    const input = document.getElementById('newChannelName');
    input.value = '';
    modal.classList.remove('hidden');
    modal.classList.add('visible');
    setTimeout(() => modal.classList.remove('visible'), 300);

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
            ? `${apiBaseUrl}/api/channels`
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
    const dm = dms.find(d => d.id === channelId);
    const channelName = channel ? channel.name : (dm ? 'this DM' : 'this channel');

    if (!confirm(`Are you sure you want to delete ${channel ? '#' + channelName : channelName}? All messages will be permanently deleted.`)) {
        return;
    }

    try {
        const apiUrl = isLocalDev
            ? `${apiBaseUrl}/api/channels/${channelId}`
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
                if (channel) await fetchChannels();
                if (dm) await fetchDMs();
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
    closeAllSidebars();
    dismissKeyboard();
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
    modal.classList.add('visible');
    setTimeout(() => modal.classList.remove('visible'), 300);
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

    searchOffset = 0;
    currentSearchParams = {
        query,
        username: usernameInput,
        channelId,
        startDate,
        endDate,
    };

    const searchResultsEl = document.getElementById('searchResults');
    searchResultsEl.innerHTML = '<div class="p-4 text-[#949BA4]">Searching...</div>';

    try {
        const apiUrl = isLocalDev
            ? `${apiBaseUrl}/api/search`
            : '/api/search';

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                ...currentSearchParams,
                offset: 0,
            }),
        });

        const results = await response.json();
        displaySearchResults(results.results, 0, results.hasMore, results.total);
    } catch (error) {
        console.error('Error searching messages:', error);
        searchResultsEl.innerHTML = '<div class="p-4 text-red-400">Error searching messages</div>';
    }
}

function displaySearchResults(results, offset = 0, hasMore = false, total = 0) {
    const searchResultsEl = document.getElementById('searchResults');

    searchOffset = offset;
    searchHasMore = hasMore;
    searchIsLoading = false;
    searchIsAutoLoading = false;

    if (results.length === 0 && offset === 0) {
        searchResultsEl.innerHTML = '<div class="p-4 text-[#949BA4]">No results found</div>';
        return;
    }

    if (offset === 0) {
        searchResultsEl.innerHTML = '';
    }

    const loadMoreBtn = document.getElementById('search-load-more-button');
    const loadingIndicator = document.getElementById('search-loading-indicator');

    if (loadingIndicator) {
        loadingIndicator.remove();
    }

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
            console.log('Search result clicked:', result);
            localStorage.setItem('searchTargetMessageId', result.id);
            if (result.channel_id !== currentChannelId) {
                localStorage.setItem('currentChannelId', result.channel_id);
                closeSearchModal();
                window.location.reload();
            } else {
                closeSearchModal();
                scrollToMessage(result.id);
            }
        });

        searchResultsEl.appendChild(resultEl);
    });

    lucide.createIcons();

    if (hasMore && !loadMoreBtn && offset >= 0) {
        const loadMoreBtnEl = document.createElement('div');
        loadMoreBtnEl.className = 'text-center py-4';
        loadMoreBtnEl.id = 'search-load-more-button';
        loadMoreBtnEl.innerHTML = `
            <button onclick="loadMoreSearchResults()" class="bg-[#5865F2] hover:bg-[#4752C4] text-white font-medium py-2 px-4 rounded transition-colors">
                Load More Results (${total - offset - results.length} more)
            </button>
        `;
        searchResultsEl.appendChild(loadMoreBtnEl);
    }

    if (!hasMore && loadMoreBtn) {
        loadMoreBtn.remove();
    } else if (hasMore && loadMoreBtn) {
        loadMoreBtn.innerHTML = `
            <button onclick="loadMoreSearchResults()" class="bg-[#5865F2] hover:bg-[#4752C4] text-white font-medium py-2 px-4 rounded transition-colors">
                Load More Results (${total - offset - results.length} more)
            </button>
        `;
    }
}

async function loadMoreSearchResults() {
    if (searchIsLoading) return;

    searchIsLoading = true;
    const newOffset = searchOffset + 25;

    const loadMoreBtn = document.getElementById('search-load-more-button');
    if (loadMoreBtn) {
        loadMoreBtn.innerHTML = '<div class="flex items-center justify-center"><div class="animate-spin rounded-full h-6 w-6 border-2 border-white border-t-transparent mr-2"></div>Loading...</div>';
    }

    try {
        const apiUrl = isLocalDev
            ? `${apiBaseUrl}/api/search`
            : '/api/search';

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                ...currentSearchParams,
                offset: newOffset,
            }),
        });

        const results = await response.json();
        displayMoreSearchResults(results.results, newOffset, results.hasMore, results.total);
    } catch (error) {
        console.error('Error searching messages:', error);
        searchIsLoading = false;

        const loadMoreBtn = document.getElementById('search-load-more-button');
        if (loadMoreBtn) {
            loadMoreBtn.innerHTML = `
                <button onclick="loadMoreSearchResults()" class="bg-[#5865F2] hover:bg-[#4752C4] text-white font-medium py-2 px-4 rounded transition-colors">
                    Load More Results
                </button>
            `;
        }
    }
}

function displayMoreSearchResults(results, newOffset, hasMore, total) {
    const searchResultsEl = document.getElementById('searchResults');
    const loadMoreBtn = document.getElementById('search-load-more-button');
    const loadingIndicator = document.getElementById('search-loading-indicator');

    searchOffset = newOffset;
    searchHasMore = hasMore;
    searchIsLoading = false;
    searchIsAutoLoading = false;

    if (loadingIndicator) {
        loadingIndicator.remove();
    }

    const fragment = document.createDocumentFragment();

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
            console.log('Search result clicked:', result);
            localStorage.setItem('searchTargetMessageId', result.id);
            if (result.channel_id !== currentChannelId) {
                localStorage.setItem('currentChannelId', result.channel_id);
                closeSearchModal();
                window.location.reload();
            } else {
                closeSearchModal();
                scrollToMessage(result.id);
            }
        });

        fragment.appendChild(resultEl);
    });

    if (loadMoreBtn) {
        searchResultsEl.insertBefore(fragment, loadMoreBtn);
    } else {
        searchResultsEl.appendChild(fragment);
    }

    lucide.createIcons();

    if (!hasMore || results.length === 0) {
        if (loadMoreBtn) {
            loadMoreBtn.remove();
        }
    } else if (loadMoreBtn) {
        loadMoreBtn.innerHTML = `
            <button onclick="loadMoreSearchResults()" class="bg-[#5865F2] hover:bg-[#4752C4] text-white font-medium py-2 px-4 rounded transition-colors">
                Load More Results (${total - newOffset - results.length} more)
            </button>
        `;
    }
}

function renderMembers() {
    const membersSidebar = document.getElementById('members-sidebar');
    if (!membersSidebar) return;

    if (!allUsers || allUsers.length === 0) {
        membersSidebar.innerHTML = `
            <div class="p-4 text-center">
                <p class="text-sm text-[#949BA4]">No registered users found</p>
            </div>
        `;
        return;
    }

    membersSidebar.innerHTML = '';

    const onlineUsers = allUsers.filter(u => onlineUsernames.has(u.username));
    const offlineUsers = allUsers.filter(u => !onlineUsernames.has(u.username));

    const renderUser = (user, isOnline) => {
        const displayName = user.display_name || user.username;
        const avatarUrl = user.avatar_key
            ? (isLocalDev ? `${apiBaseUrl}/api/file/${user.avatar_key}` : `/api/file/${user.avatar_key}`)
            : `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=random`;

        return `
            <div class="flex items-center px-2 py-1.5 rounded hover:bg-[#35373C] cursor-pointer group ${isOnline ? 'opacity-100' : 'opacity-40 hover:opacity-100'}" onclick="openUserDetailModal('${escapeHtml(user.username)}')">
                <div class="relative mr-3">
                    <img src="${avatarUrl}" alt="${escapeHtml(displayName)}" class="w-8 h-8 rounded-full object-cover">
                    <div class="absolute bottom-0 right-0 w-3.5 h-3.5 border-[3px] border-[#2B2D31] rounded-full ${isOnline ? 'bg-green-500' : 'bg-[#949BA4]'}"></div>
                </div>
                <div class="flex-1 min-w-0">
                    <div class="flex items-center justify-between">
                        <div class="text-[15px] font-medium leading-4 text-[#dbdee1] truncate">
                            ${escapeHtml(displayName)}
                        </div>
                        ${user.username !== username ? `
                        <button class="opacity-0 group-hover:opacity-100 text-[#B5BAC1] hover:text-[#dbdee1] p-1 rounded transition-opacity" title="Message" onclick="event.stopPropagation(); startDM('${escapeHtml(user.username)}', true)">
                            <i data-lucide="message-square" class="w-4 h-4"></i>
                        </button>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
    };

    if (onlineUsers.length > 0) {
        const onlineGroup = document.createElement('div');
        onlineGroup.className = 'mb-6';
        onlineGroup.innerHTML = `
            <h3 class="text-[#949BA4] text-xs font-bold uppercase mb-2 px-2">Online — ${onlineUsers.length}</h3>
            ${onlineUsers.map(u => renderUser(u, true)).join('')}
        `;
        membersSidebar.appendChild(onlineGroup);
    }

    if (offlineUsers.length > 0) {
        const offlineGroup = document.createElement('div');
        offlineGroup.className = 'mb-6';
        offlineGroup.innerHTML = `
            <h3 class="text-[#949BA4] text-xs font-bold uppercase mb-2 px-2">Offline — ${offlineUsers.length}</h3>
            ${offlineUsers.map(u => renderUser(u, false)).join('')}
        `;
        membersSidebar.appendChild(offlineGroup);
    }
}


async function openUserSettings() {
    if (confirm('Do you want to logout?')) {
        const token = localStorage.getItem('fcmToken');
        if (token && username) {
            try {
                await fetch('/api/push/unregister', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, token })
                });
            } catch (e) { console.error('Failed to unregister push token', e); }
        }
        localStorage.removeItem('chatUsername');
        localStorage.removeItem('displayName');
        localStorage.removeItem('avatarKey');
        localStorage.removeItem('fcmToken');
        window.location.replace('/');
    }
}

async function togglePushNotifications(enabled) {
    if (enabled) {
        if (typeof window.requestPushPermission === 'function') {
            await window.requestPushPermission();
        }
    } else {
        const token = localStorage.getItem('fcmToken');
        if (token && username) {
            try {
                await fetch('/api/push/unregister', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, token })
                });
                localStorage.removeItem('fcmToken');
            } catch (e) { console.error('Failed to unregister push token', e); }
        }
    }
}

function openEmojiModal() {
    const modal = document.getElementById('emojiUploadModal');
    modal.classList.remove('hidden');
    modal.classList.add('visible');
    setTimeout(() => modal.classList.remove('visible'), 400);
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
            const apiUrl = isLocalDev ? `${apiBaseUrl}/api/emojis` : '/api/emojis';
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
    closeAllSidebars();
    dismissKeyboard();
    const modal = document.getElementById('profileModal');
    const nameInput = document.getElementById('displayNameInput');
    const preview = document.getElementById('profilePreview');

    nameInput.value = displayName;
    preview.src = avatarKey
        ? (isLocalDev ? `${apiBaseUrl}/api/file/${avatarKey}` : `/api/file/${avatarKey}`)
        : `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=random`;

    const pushToggle = document.getElementById('pushToggle');
    if (pushToggle) {
        pushToggle.checked = !!localStorage.getItem('fcmToken') && Notification.permission === 'granted';
    }

    modal.classList.remove('hidden');
    modal.classList.add('visible');
    setTimeout(() => modal.classList.remove('visible'), 300);
}

function closeProfileModal() {
    document.getElementById('profileModal').classList.add('hidden');
}

let userDetailModalUsername = null;

function openUserDetailModal(targetUsername) {
    if (!targetUsername) return;

    const user = allUsers.find(u => u.username === targetUsername);
    if (!user) return;

    userDetailModalUsername = targetUsername;
    const modal = document.getElementById('userDetailModal');
    const avatar = document.getElementById('userDetailAvatar');
    const displayNameEl = document.getElementById('userDetailDisplayName');
    const usernameEl = document.getElementById('userDetailUsername');
    const statusDot = document.getElementById('userDetailStatusDot');
    const statusText = document.getElementById('userDetailStatusText');
    const dmBtn = document.getElementById('userDetailDMBtn');

    const dName = user.display_name || user.username;
    displayNameEl.textContent = dName;
    usernameEl.textContent = `@${user.username}`;

    avatar.src = user.avatar_key
        ? (isLocalDev ? `${apiBaseUrl}/api/file/${user.avatar_key}` : `/api/file/${user.avatar_key}`)
        : `https://ui-avatars.com/api/?name=${encodeURIComponent(dName)}&background=random`;

    const isOnline = onlineUsernames.has(targetUsername);
    statusDot.style.backgroundColor = isOnline ? '#23a55a' : '#80848e';
    statusText.textContent = isOnline ? 'Online' : 'Offline';

    // Hide DM button if it's the current user
    if (targetUsername === username) {
        dmBtn.classList.add('hidden');
    } else {
        dmBtn.classList.remove('hidden');
    }

    modal.classList.remove('hidden');
    lucide.createIcons();
}

function closeUserDetailModal() {
    document.getElementById('userDetailModal').classList.add('hidden');
    userDetailModalUsername = null;
}

function handleUserDetailDM() {
    if (userDetailModalUsername) {
        startDM(userDetailModalUsername, true);
        closeUserDetailModal();
    }
}

function viewUserDetailAvatar() {
    const avatar = document.getElementById('userDetailAvatar');
    if (avatar && avatar.src) {
        openImageModal(avatar.src);
    }
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
        const apiUrl = isLocalDev ? `${apiBaseUrl}/api/user/profile` : '/api/user/profile';
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
            const avatarInitial = document.getElementById('user-avatar-initial');
            if (avatarInitial) {
                avatarInitial.textContent = displayName.charAt(0).toUpperCase();
            }

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

function handleMentionAutocomplete(e) {
    const input = e.target;
    const value = input.value;
    const selectionStart = input.selectionStart;

    // Find the word before the cursor
    const beforeCursor = value.slice(0, selectionStart);
    const lastAt = beforeCursor.lastIndexOf('@');

    if (lastAt !== -1) {
        const query = beforeCursor.slice(lastAt + 1);
        // Only trigger if @ is at start of word or start of input
        const charBeforeAt = beforeCursor[lastAt - 1];
        if (!charBeforeAt || /\s/.test(charBeforeAt)) {
            showAutocomplete(query, lastAt);
            return;
        }
    }

    hideAutocomplete();
}

function showAutocomplete(query, atIndex) {
    const autocomplete = document.getElementById('mentionAutocomplete');
    filteredUsers = allUsers.filter(u =>
        u.username.toLowerCase().includes(query.toLowerCase()) ||
        (u.display_name && u.display_name.toLowerCase().includes(query.toLowerCase()))
    ).slice(0, 8); // Limit to 8 results

    if (filteredUsers.length === 0) {
        hideAutocomplete();
        return;
    }

    selectedAutocompleteIndex = 0;
    renderAutocomplete(filteredUsers, atIndex);
    autocomplete.classList.remove('hidden');
}

function renderAutocomplete(users, atIndex) {
    const autocomplete = document.getElementById('mentionAutocomplete');
    autocomplete.innerHTML = users.map((user, index) => {
        const displayName = user.display_name || user.username;
        const avatarUrl = user.avatar_key
            ? (isLocalDev ? `${apiBaseUrl}/api/file/${user.avatar_key}` : `/api/file/${user.avatar_key}`)
            : `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=random`;

        return `
            <div class="autocomplete-item ${index === selectedAutocompleteIndex ? 'selected' : ''}" onclick="selectMention(${JSON.stringify(user).replace(/"/g, '&quot;')}, ${atIndex})">
                <img src="${avatarUrl}" class="w-6 h-6 rounded-full mr-2 object-cover">
                <div class="flex flex-col">
                    <span class="text-sm font-medium text-[#dbdee1]">${escapeHtml(displayName)}</span>
                    <span class="text-xs text-[#949BA4]">@${escapeHtml(user.username)}</span>
                </div>
            </div>
        `;
    }).join('');
}

function hideAutocomplete() {
    const autocomplete = document.getElementById('mentionAutocomplete');
    if (autocomplete) autocomplete.classList.add('hidden');
}

function selectMention(user, atIndex) {
    if (!user) return;
    const input = document.getElementById('message-input');
    const value = input.value;
    const selectionStart = input.selectionStart;
    const beforeCursor = value.slice(0, selectionStart);

    // If atIndex not provided, find it again
    if (atIndex === undefined) {
        atIndex = beforeCursor.lastIndexOf('@');
    }

    const afterMention = value.slice(selectionStart);
    const newValue = value.slice(0, atIndex) + '@' + user.username + ' ' + afterMention;

    input.value = newValue;
    const newCursorPos = atIndex + user.username.length + 2;
    input.setSelectionRange(newCursorPos, newCursorPos);
    input.focus();
    hideAutocomplete();
}

function handleAutocompleteKeydown(e) {
    const autocomplete = document.getElementById('mentionAutocomplete');
    if (autocomplete.classList.contains('hidden')) return;

    if (e.key === 'ArrowUp') {
        e.preventDefault();
        selectedAutocompleteIndex = (selectedAutocompleteIndex - 1 + filteredUsers.length) % filteredUsers.length;
        renderAutocomplete(filteredUsers);
    } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        selectedAutocompleteIndex = (selectedAutocompleteIndex + 1) % filteredUsers.length;
        renderAutocomplete(filteredUsers);
    } else if (e.key === 'Escape') {
        hideAutocomplete();
    } else if (e.key === 'Tab') {
        e.preventDefault();
        selectMention(filteredUsers[selectedAutocompleteIndex]);
    }
}

async function regenerateRecoveryKey() {
    if (!confirm('This will invalidate your old recovery key. Are you sure?')) return;

    try {
        const apiUrl = isLocalDev ? `${apiBaseUrl}/api/user/profile` : '/api/user/profile';
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username,
                displayName,
                generateNewRecoveryKey: true
            })
        });

        if (response.ok) {
            const result = await response.json();
            const container = document.getElementById('newRecoveryKeyContainer');
            const display = document.getElementById('newRecoveryKeyDisplay');
            display.textContent = result.newRecoveryKey;
            container.classList.remove('hidden');
            lucide.createIcons();
            alert('New recovery key generated! Please save it safely.');
        }
    } catch (error) {
        console.error('Regenerate key error:', error);
    }
}

function copyNewRecoveryKey() {
    const key = document.getElementById('newRecoveryKeyDisplay').textContent;
    navigator.clipboard.writeText(key);
    alert('Copied to clipboard!');
}

function toggleReactionPicker(event, messageId) {
    event.preventDefault();
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
    picker.classList.add('visible');
    setTimeout(() => picker.classList.remove('visible'), 400);

    // Add custom emojis to picker
    const customSection = document.getElementById('customEmojisInPicker');
    if (customSection) {
        if (customEmojis.length === 0) {
            customSection.innerHTML = '<div class="text-[10px] text-[#949BA4] w-full text-center py-2">No custom emojis</div>';
        } else {
            customSection.innerHTML = customEmojis.map(emoji => `
                <button class="hover:bg-[#35373C] p-1 rounded transition-colors" onclick="sendReaction(':${emoji.name}:')" title=":${emoji.name}:">
                    <img src="${isLocalDev ? `${apiBaseUrl}/api/file/` : '/api/file/'}${emoji.file_key}" class="w-6 h-6 object-contain pointer-events-none">
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

    // Keep focus on input if we are using the picker for the main message input
    if (messageId === null) {
        document.getElementById('message-input').focus();
    }

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
        document.getElementById('reactionPicker').classList.add('hidden');
    } else {
        const input = document.getElementById('message-input');
        const space = (input.value.length > 0 && !input.value.endsWith(' ')) ? ' ' : '';
        input.value += space + emoji + ' ';
        input.focus();
        // Do NOT hide the picker here so user can add multiple emojis
    }
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
                emojiDisplay = `<img src="${isLocalDev ? `${apiBaseUrl}/api/file/` : '/api/file/'}${customEmoji.file_key}" class="w-4 h-4 inline-block">`;
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

    // Add animation to all reaction badges
    setTimeout(() => {
        const badges = container.querySelectorAll('.reaction-badge');
        badges.forEach(badge => {
            badge.classList.add('updated');
            setTimeout(() => badge.classList.remove('updated'), 300);
        });
    }, 10);
}

// Close picker when clicking outside
document.addEventListener('click', (e) => {
    const picker = document.getElementById('reactionPicker');
    const emojiBtn = document.getElementById('emoji-trigger-btn');
    if (picker && !picker.contains(e.target) && (!emojiBtn || !emojiBtn.contains(e.target))) {
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

function closeAllSidebars() {
    if (window.innerWidth >= 1024) return;
    dismissKeyboard();

    const channelSidebar = document.getElementById('channel-sidebar');
    const membersSidebar = document.getElementById('members-sidebar');
    const overlay = document.getElementById('sidebar-overlay');

    channelSidebar.classList.remove('active');
    membersSidebar.classList.remove('active');
    overlay.classList.remove('visible');
}

function toggleSidebar(id) {
    if (window.innerWidth >= 1024) return;
    dismissKeyboard();

    const sidebar = document.getElementById(id);
    const otherId = id === 'channel-sidebar' ? 'members-sidebar' : 'channel-sidebar';
    const otherSidebar = document.getElementById(otherId);
    const overlay = document.getElementById('sidebar-overlay');

    // Clear any inline styles from drag
    sidebar.style.transform = '';
    sidebar.style.opacity = '';
    overlay.style.opacity = '';
    overlay.style.display = '';

    const isActive = sidebar.classList.contains('active');

    if (!isActive) {
        otherSidebar.classList.remove('active');
        sidebar.classList.add('active');
        overlay.classList.add('visible');
    } else {
        sidebar.classList.remove('active');
        overlay.classList.remove('visible');
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    console.log(`Connecting as: ${username} to channel ${currentChannelId}`);

    // Clear unread for current channel
    if (unreadChannels.has(currentChannelId)) {
        unreadChannels.delete(currentChannelId);
        localStorage.setItem('unreadChannels', JSON.stringify(Array.from(unreadChannels)));
    }

    document.getElementById('display-username').textContent = displayName;
    document.getElementById('user-avatar-initial').textContent = displayName.charAt(0).toUpperCase();

    const avatarDisplay = document.querySelector('#user-avatar-initial').parentElement;
    if (avatarKey) {
        const url = isLocalDev ? `${apiBaseUrl}/api/file/${avatarKey}` : `/api/file/${avatarKey}`;
        avatarDisplay.innerHTML = `<img src="${url}" class="w-8 h-8 rounded-full object-cover">`;
    }

    fetchCustomEmojis();

    // Initial placeholder
    const membersSidebar = document.getElementById('members-sidebar');
    if (membersSidebar) {
        membersSidebar.innerHTML = '<div class="p-4 text-sm text-[#949BA4] text-center">Loading users...</div>';
    }

    await Promise.all([
        fetchRegisteredUsers(),
        fetchChannels(),
        fetchDMs()
    ]);
    renderMembers();
    connect();



    const messagesContainerEl = document.getElementById('messages-container');
    if (messagesContainerEl) {
        messagesContainerEl.addEventListener('click', (e) => {
            // Dismiss keyboard if clicking background or message area (but not buttons/links)
            if (e.target.id === 'messages-container' || e.target.closest('.message-group')) {
                // If it's a message group, check if they clicked an interactive element
                if (e.target.closest('button') || e.target.closest('a') || e.target.closest('.reaction-badge')) {
                    return;
                }
                dismissKeyboard();
            }
        });
    }

    const fileInputEl = document.getElementById('fileInput');
    if (fileInputEl) {
        fileInputEl.addEventListener('change', handleFileSelect);
    }

    // Set up drag and drop on entire app
    const appEl = document.getElementById('app');
    if (appEl) {
        appEl.addEventListener('dragenter', handleDragEnter);
        appEl.addEventListener('dragover', handleDragOver);
        appEl.addEventListener('dragleave', handleDragLeave);
        appEl.addEventListener('drop', handleDrop);
    }

    // Prevent browser default drag/drop behavior on entire document
    document.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
    });
    document.addEventListener('drop', (e) => e.preventDefault());

    const sendBtn = document.getElementById('send-message-btn');
    if (sendBtn) {
        sendBtn.addEventListener('pointerdown', (e) => {
            // Prevent the button from taking focus away from the input
            // This stops the keyboard from flickering on mobile
            e.preventDefault();
        });
    }

    const emojiBtn = document.getElementById('emoji-trigger-btn');
    if (emojiBtn) {
        emojiBtn.addEventListener('pointerdown', (e) => {
            e.preventDefault();
        });
    }

    const messageFormEl = document.getElementById('message-form');
    let isSending = false;

    if (messageFormEl) {
        messageFormEl.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (isSending) return;

            const input = document.getElementById('message-input');
            const message = input.value.trim();
            const sendBtn = document.getElementById('send-message-btn');

            if (!message && selectedFiles.length === 0) return;

            // Keep focus synchronously at the start to prevent keyboard dismissal
            if (window.innerWidth < 1024) {
                input.focus();
                setTimeout(() => input.focus(), 0);
            }

            if (isConnected) {
                isSending = true;
                const originalBtnContent = sendBtn.innerHTML;
                sendBtn.innerHTML = '<div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>';
                sendBtn.disabled = true;

                lastSendMessageTime = Date.now();
                const filesToSend = [...selectedFiles];

                try {
                    // 1. Upload files first via HTTP with progress tracking
                    const uploadedFiles = [];
                    for (let i = 0; i < filesToSend.length; i++) {
                        sendBtn.innerHTML = `<span class="text-[10px] font-bold">${i + 1}/${filesToSend.length}</span>`;
                        const uploadResult = await uploadFileWithProgress(filesToSend[i], i);
                        uploadedFiles.push(uploadResult);
                    }

                    sendBtn.innerHTML = '<div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>';

                    // 2. Send message over WebSocket
                    if (message) {
                        ws.send(JSON.stringify({
                            type: 'chat',
                            message,
                            replyTo: replyingTo?.messageId,
                        }));
                        input.value = '';
                        document.getElementById('reactionPicker').classList.add('hidden');
                    }

                    // 3. Send file messages over WebSocket (only metadata)
                    for (const uploadedFile of uploadedFiles) {
                        ws.send(JSON.stringify({
                            type: 'chat',
                            message: '',
                            file: uploadedFile,
                            replyTo: replyingTo?.messageId,
                        }));
                    }

                    // Cleanup
                    filesToSend.forEach(f => {
                        if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
                    });
                    selectedFiles = [];
                    const fileInput = document.getElementById('fileInput');
                    if (fileInput) fileInput.value = '';
                    hideFilePreview();
                    cancelReply();
                    sendTypingStatus(false);
                } catch (err) {
                    console.error('Send error:', err);
                    alert('Failed to send message or upload files. Please try again.');
                } finally {
                    isSending = false;
                    sendBtn.innerHTML = originalBtnContent;
                    sendBtn.disabled = false;
                    updateSendButtonVisibility();
                }

                // Final check to maintain focus after all async operations
                if (window.innerWidth < 1024) {
                    input.focus();
                }
            }
        });
    }

    const messageInputEl = document.getElementById('message-input');
    if (messageInputEl) {
        messageInputEl.addEventListener('paste', handlePaste);
        messageInputEl.addEventListener('input', (e) => {
            handleTyping();
            handleMentionAutocomplete(e);
            updateSendButtonVisibility();
        });
        messageInputEl.addEventListener('keydown', handleAutocompleteKeydown);
        messageInputEl.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                const autocomplete = document.getElementById('mentionAutocomplete');
                if (!autocomplete.classList.contains('hidden')) {
                    e.preventDefault();
                    selectMention(filteredUsers[selectedAutocompleteIndex]);
                    return;
                }
                e.preventDefault();
                const form = document.getElementById('message-form');
                if (form) form.dispatchEvent(new Event('submit'));
            }
        });

        // Fix for mobile keyboard covering input
        messageInputEl.addEventListener('focus', () => {
            // Browser usually handles this better than manual scrollIntoView
            // which can cause focus loss on some Android versions
        });
    }

    // Handle Visual Viewport for mobile keyboard
    if (window.visualViewport) {
        const handleViewportChange = () => {
            const container = document.getElementById('messages-container');
            const oldHeight = container ? container.clientHeight : 0;
            const oldScrollTop = container ? container.scrollTop : 0;

            lastResizeTime = Date.now();
            const app = document.getElementById('app');
            if (!app) return;

            const height = window.visualViewport.height;
            const offsetTop = window.visualViewport.offsetTop;

            // Adjust app height to match visual viewport
            app.style.height = `${height}px`;

            // On iOS, the viewport can be scrolled/offset when the keyboard is open.
            // We use transform to pin the app to the current visible top.
            if (isIOS) {
                app.style.transform = `translateY(${offsetTop}px)`;
                window.scrollTo(0, 0);
            }

            // Update lastScrollTop after resize to prevent large scrollDistance
            // when the keyboard opens and shifts the container
            if (container) {
                const newHeight = container.clientHeight;
                // Preserve scroll position relative to the bottom
                // This keeps whatever was at the bottom of the screen visible
                container.scrollTop = oldScrollTop + (oldHeight - newHeight);
                lastScrollTop = container.scrollTop;
            }

            // On resize (keyboard opening), ensure the active element is visible
            // but use a slight delay and only if needed to avoid focus loss
            if (document.activeElement && document.activeElement.id === 'message-input') {
                setTimeout(() => {
                    document.activeElement.scrollIntoView({ behavior: 'auto', block: 'end' });
                }, 100);
            }
        };

        window.visualViewport.addEventListener('resize', handleViewportChange);
        window.visualViewport.addEventListener('scroll', handleViewportChange);
    }


    const toggleChannelsBtnEl = document.getElementById('toggle-channels-btn');
    if (toggleChannelsBtnEl) {
        toggleChannelsBtnEl.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleSidebar('channel-sidebar');
        });
    }

    const toggleMembersBtnEl = document.getElementById('toggle-members-btn');
    if (toggleMembersBtnEl) {
        toggleMembersBtnEl.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleSidebar('members-sidebar');
        });
    }

    // Swipe gesture detection for mobile sidebars
    let touchStartX = 0;
    let touchStartY = 0;
    let touchEndX = 0;
    let touchEndY = 0;
    let messageSwiped = false;
    const edgeThreshold = 40;
    const swipeThreshold = 60;
    let sidebarDragStartX = 0;
    let isDraggingSidebar = false;
    let activeDraggingSidebar = null;

    const app = document.getElementById('app');
    if (app) {
        app.addEventListener('touchstart', (e) => {
            if (window.innerWidth >= 1024) return;

            messageSwiped = false;
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;

            const channelSidebar = document.getElementById('channel-sidebar');
            const membersSidebar = document.getElementById('members-sidebar');
            const overlay = document.getElementById('sidebar-overlay');

            const isChannelOpen = channelSidebar.classList.contains('active');
            const isMembersOpen = membersSidebar.classList.contains('active');

            // 1. Check if starting from edge to OPEN
            const isLeftEdge = !isChannelOpen && !isMembersOpen && touchStartX < edgeThreshold;
            const isRightEdge = !isChannelOpen && !isMembersOpen && touchStartX > window.innerWidth - edgeThreshold;

            // 2. Check if starting on an OPEN sidebar to CLOSE
            const isOnOpenChannel = isChannelOpen && touchStartX < 240;
            const isOnOpenMembers = isMembersOpen && touchStartX > window.innerWidth - 240;

            if (isLeftEdge || isOnOpenChannel) {
                activeDraggingSidebar = channelSidebar;
                isDraggingSidebar = true;
                sidebarDragStartX = touchStartX;
                channelSidebar.classList.add('dragging');
                overlay.classList.remove('hidden');
                overlay.classList.add('dragging');
            } else if (isRightEdge || isOnOpenMembers) {
                activeDraggingSidebar = membersSidebar;
                isDraggingSidebar = true;
                sidebarDragStartX = touchStartX;
                membersSidebar.classList.add('dragging');
                overlay.classList.remove('hidden');
                overlay.classList.add('dragging');
            }
        }, { passive: true });

        app.addEventListener('touchmove', (e) => {
            if (!isDraggingSidebar || !activeDraggingSidebar) return;

            const currentX = e.touches[0].clientX;
            const currentY = e.touches[0].clientY;

            // Prevent dragging if user is scrolling vertically
            if (Math.abs(currentY - touchStartY) > 50 && Math.abs(currentX - touchStartX) < 20) {
                isDraggingSidebar = false;
                return;
            }

            const isChannel = activeDraggingSidebar.id === 'channel-sidebar';
            const sidebarWidth = 240;
            const overlay = document.getElementById('sidebar-overlay');

            if (isChannel) {
                // Channel Sidebar (From Left)
                const isAlreadyOpen = activeDraggingSidebar.classList.contains('active');
                // If opening: currentX is the edge of the sidebar
                // If closing: sidebar starts at 240, currentX - touchStartX is the movement
                let offset = isAlreadyOpen ? (240 + (currentX - touchStartX)) : currentX;
                offset = Math.min(Math.max(offset, 0), sidebarWidth);

                const percent = offset / sidebarWidth;
                activeDraggingSidebar.style.transform = `translateX(${offset - sidebarWidth}px)`;
                activeDraggingSidebar.style.opacity = '1'; // Keep sidebar opaque
                if (overlay) {
                    overlay.style.display = 'block';
                    overlay.style.opacity = percent;
                }
            } else {
                // Members Sidebar (From Right)
                const isAlreadyOpen = activeDraggingSidebar.classList.contains('active');
                const screenWidth = window.innerWidth;
                let offset = isAlreadyOpen ? (240 + (touchStartX - currentX)) : (screenWidth - currentX);
                offset = Math.min(Math.max(offset, 0), sidebarWidth);

                const percent = offset / sidebarWidth;
                activeDraggingSidebar.style.transform = `translateX(${sidebarWidth - offset}px)`;
                activeDraggingSidebar.style.opacity = '1'; // Keep sidebar opaque
                if (overlay) {
                    overlay.style.display = 'block';
                    overlay.style.opacity = percent;
                }
            }
        }, { passive: true });

        app.addEventListener('touchend', (e) => {
            if (!isDraggingSidebar || !activeDraggingSidebar) {
                isDraggingSidebar = false;
                activeDraggingSidebar = null;
                return;
            }

            const currentX = e.changedTouches[0].clientX;
            const diffX = currentX - touchStartX;
            const isChannel = activeDraggingSidebar.id === 'channel-sidebar';
            const isAlreadyOpen = activeDraggingSidebar.classList.contains('active');
            const overlay = document.getElementById('sidebar-overlay');

            // Threshold logic: Open if dragged > 30% or fast swipe
            let shouldBeOpen = false;
            const dragDistance = isChannel ?
                (isAlreadyOpen ? 240 + diffX : diffX) :
                (isAlreadyOpen ? 240 - diffX : -diffX);

            if (dragDistance > 80) {
                shouldBeOpen = true;
            }

            // Apply state
            activeDraggingSidebar.classList.remove('dragging');
            overlay.classList.remove('dragging');

            // Important: Clear inline styles so CSS transitions can take over
            activeDraggingSidebar.style.transform = '';
            activeDraggingSidebar.style.opacity = '';
            overlay.style.opacity = '';
            overlay.style.display = '';

            const sidebarToClose = activeDraggingSidebar;
            if (shouldBeOpen) {
                sidebarToClose.classList.add('active');
                overlay.classList.add('visible');
            } else {
                sidebarToClose.classList.remove('active');
                overlay.classList.remove('visible');
                setTimeout(() => {
                    if (!sidebarToClose.classList.contains('active')) {
                        overlay.classList.add('hidden');
                    }
                }, 300);
            }

            isDraggingSidebar = false;
            activeDraggingSidebar = null;
        }, { passive: true });
    }

    // Swipe-to-reply functionality for messages
    const messageSwipeThreshold = 100;
    const messageSwipeVelocity = 0.3;

    function setupMessageSwipeHandlers() {
        const messagesContainer = document.getElementById('messages-container');
        if (!messagesContainer) return;

        // Use MutationObserver to attach handlers to new messages
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === 1 && node.classList && node.classList.contains('message-group')) {
                        attachSwipeHandler(node);
                    }
                });
            });
        });

        observer.observe(messagesContainer, { childList: true });

        // Also attach to existing messages
        messagesContainer.querySelectorAll('.message-group').forEach((msg) => {
            attachSwipeHandler(msg);
        });
    }

    function attachSwipeHandler(messageEl) {
        let msgTouchStartX = 0;
        let msgTouchStartY = 0;
        let msgCurrentX = 0;
        let msgTouchStartTime = 0;
        let isHorizontalSwipe = false;
        let isVerticalScroll = false;
        let hasDeterminedDirection = false;

        // Check if mobile view
        if (window.innerWidth >= 1024) return;

        messageEl.addEventListener('touchstart', (e) => {
            msgTouchStartX = e.touches[0].clientX;
            msgTouchStartY = e.touches[0].clientY;
            msgCurrentX = msgTouchStartX;
            msgTouchStartTime = Date.now();
            isHorizontalSwipe = false;
            isVerticalScroll = false;
            hasDeterminedDirection = false;
        }, { passive: true });

        messageEl.addEventListener('touchmove', (e) => {
            const currentX = e.touches[0].clientX;
            const currentY = e.touches[0].clientY;
            const deltaX = currentX - msgTouchStartX;
            const deltaY = currentY - msgTouchStartY;
            const absX = Math.abs(deltaX);
            const absY = Math.abs(deltaY);

            // 1. Determine direction once
            if (!hasDeterminedDirection) {
                if (absX > 10 || absY > 10) {
                    hasDeterminedDirection = true;
                    if (absX > absY * 1.5 && deltaX < 0) {
                        isHorizontalSwipe = true;
                    } else {
                        isVerticalScroll = true;
                    }
                }
                return;
            }

            // 2. Only proceed if we're sure it's a horizontal swipe to the left
            if (isHorizontalSwipe) {
                msgCurrentX = currentX;
                const swipeDistance = msgTouchStartX - msgCurrentX;

                // Apply visual feedback
                const clampedSwipe = Math.min(swipeDistance, messageSwipeThreshold);
                messageEl.style.transform = `translateX(-${clampedSwipe}px)`;
                messageEl.classList.add('swiping');

                // Show/hide reply indicator
                const indicator = messageEl.querySelector('.reply-swipe-indicator');
                if (indicator) {
                    const opacity = Math.min(clampedSwipe / 50, 1);
                    const translate = Math.max(0, messageSwipeThreshold - clampedSwipe);
                    indicator.style.opacity = opacity;
                    indicator.style.transform = `translateY(-50%) translateX(${translate}px)`;
                }
            }
        }, { passive: true });

        messageEl.addEventListener('touchend', (e) => {
            const currentX = e.changedTouches[0].clientX;
            const deltaX = currentX - msgTouchStartX;
            const deltaTime = Date.now() - msgTouchStartTime;
            const velocity = Math.abs(deltaX) / deltaTime;

            messageEl.style.transform = '';
            messageEl.classList.remove('swiping');

            // Reset indicator
            const indicator = messageEl.querySelector('.reply-swipe-indicator');
            if (indicator) {
                indicator.style.opacity = '0';
                indicator.style.transform = 'translateY(-50%) translateX(100%)';
            }

            // Trigger reply if swipe is complete AND it was recognized as horizontal
            if (isHorizontalSwipe) {
                const swipeDistance = Math.abs(deltaX);
                // Trigger if dragged far enough OR fast swipe (with minimum distance)
                if (swipeDistance > messageSwipeThreshold || (velocity > messageSwipeVelocity && swipeDistance > 30)) {
                    const messageId = messageEl.dataset.messageId;
                    if (messageId) {
                        messageSwiped = true;
                        startReply(parseInt(messageId));
                    }
                }
            }

            isHorizontalSwipe = false;
            isVerticalScroll = false;
            hasDeterminedDirection = false;
        }, { passive: true });

        messageEl.addEventListener('touchcancel', () => {
            messageEl.style.transform = '';
            messageEl.classList.remove('swiping');

            const indicator = messageEl.querySelector('.reply-swipe-indicator');
            if (indicator) {
                indicator.style.opacity = '0';
                indicator.style.transform = 'translateY(-50%) translateX(100%)';
            }
        }, { passive: true });

        messageEl.addEventListener('touchcancel', () => {
            messageEl.style.transform = '';
            messageEl.classList.remove('swiping');

            const indicator = messageEl.querySelector('.reply-swipe-indicator');
            if (indicator) {
                indicator.style.opacity = '0';
                indicator.style.transform = 'translateY(-50%) translateX(100%)';
            }
        }, { passive: true });
    }

    // Initialize message swipe handlers
    setupMessageSwipeHandlers();

    // Add scroll listener to search results for auto-loading
    const searchResultsContainer = document.getElementById('searchResults');
    if (searchResultsContainer) {
        searchResultsContainer.addEventListener('scroll', () => {
            const isNearBottom = searchResultsContainer.scrollHeight - searchResultsContainer.scrollTop - searchResultsContainer.clientHeight < 100;

            if (isNearBottom && searchHasMore && !searchIsLoading && searchOffset >= 0 && !searchIsAutoLoading) {
                searchIsAutoLoading = true;
                loadMoreSearchResults();

                const loadingIndicator = document.createElement('div');
                loadingIndicator.className = 'text-center py-4';
                loadingIndicator.id = 'search-loading-indicator';
                loadingIndicator.innerHTML = '<div class="flex items-center justify-center"><div class="animate-spin rounded-full h-6 w-6 border-2 border-white border-t-transparent"></div>Loading more results...</div>';
                searchResultsContainer.appendChild(loadingIndicator);
            }
        });
    }
});

async function fetchDMs() {
    try {
        const apiUrl = isLocalDev
            ? `${apiBaseUrl}/api/dms?username=${encodeURIComponent(username)}`
            : `/api/dms?username=${encodeURIComponent(username)}`;
        const response = await fetch(apiUrl);
        dms = await response.json();
        displayDMs();
    } catch (error) {
        console.error('Error fetching DMs:', error);
    }
}

function displayDMs() {
    const dmsContainer = document.getElementById('dms-container');
    if (!dmsContainer) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'mt-1';

    dms.forEach(dm => {
        const isActive = dm.id === currentChannelId;
        const isUnread = unreadChannels.has(dm.id) && !isActive;
        const dmEl = document.createElement('div');
        dmEl.className = `channel-item flex items-center px-2 py-[6px] rounded-[4px] cursor-pointer group mb-[2px] ${isActive ? 'bg-[#404249] text-white' : 'text-[#949BA4] hover:bg-[#35373C] hover:text-[#dbdee1]'}`;
        dmEl.onclick = () => switchChannel(dm.id);

        const otherAvatarKey = dm.other_avatar_key;
        const otherDisplayName = dm.other_display_name || dm.other_username;
        const avatarUrl = otherAvatarKey
            ? (isLocalDev ? `${apiBaseUrl}/api/file/${otherAvatarKey}` : `/api/file/${otherAvatarKey}`)
            : `https://ui-avatars.com/api/?name=${encodeURIComponent(otherDisplayName)}&background=random`;

        dmEl.innerHTML = `
            <img src="${avatarUrl}" class="w-6 h-6 rounded-full mr-2 object-cover">
            <span class="font-medium truncate flex-1 ${isUnread ? 'text-white font-bold' : ''}">${escapeHtml(otherDisplayName)}</span>
            ${isUnread ? '<div class="unread-badge w-2 h-2 bg-white rounded-full ml-1"></div>' : ''}
            <button class="delete-btn ml-auto opacity-0 group-hover:opacity-100 hover:bg-red-500/20 hover:text-red-400 text-[#949BA4] p-1 rounded cursor-pointer"
                    onclick="event.stopPropagation(); if(confirm('Close this DM?')) deleteChannel(${dm.id})"
                    title="Close DM">
                <i data-lucide="x" class="w-[14px] h-[14px]"></i>
            </button>
        `;

        wrapper.appendChild(dmEl);
    });

    dmsContainer.innerHTML = '';
    dmsContainer.appendChild(wrapper);
    lucide.createIcons();
}

function openStartDMModal() {
    closeAllSidebars();
    dismissKeyboard();
    const modal = document.getElementById('startDMModal');
    const input = document.getElementById('dmSearchInput');
    const list = document.getElementById('dmUserList');

    input.value = '';

    // Render user list excluding self
    const users = allUsers.filter(u => u.username !== username);

    const renderList = (filter = '') => {
        const filtered = users.filter(u =>
            u.username.toLowerCase().includes(filter.toLowerCase()) ||
            (u.display_name && u.display_name.toLowerCase().includes(filter.toLowerCase()))
        );

        if (filtered.length === 0) {
            list.innerHTML = '<div class="p-4 text-center text-[#949BA4]">No friends found</div>';
            return;
        }

        list.innerHTML = filtered.map(u => {
            const displayName = u.display_name || u.username;
            const avatarUrl = u.avatar_key
                ? (isLocalDev ? `${apiBaseUrl}/api/file/${u.avatar_key}` : `/api/file/${u.avatar_key}`)
                : `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=random`;

            return `
                <div class="flex items-center p-2 hover:bg-[#35373C] rounded cursor-pointer transition-colors" onclick="startDM('${escapeHtml(u.username)}', true)">
                    <img src="${avatarUrl}" class="w-8 h-8 rounded-full mr-3 object-cover">
                    <div>
                        <div class="font-medium text-[#dbdee1]">${escapeHtml(displayName)}</div>
                        <div class="text-xs text-[#949BA4]">@${escapeHtml(u.username)}</div>
                    </div>
                </div>
            `;
        }).join('');
    };

    renderList();

    input.oninput = (e) => renderList(e.target.value);

    modal.classList.remove('hidden');
    modal.classList.add('visible');
    setTimeout(() => modal.classList.remove('visible'), 300);
    input.focus();
}

function closeStartDMModal() {
    document.getElementById('startDMModal').classList.add('hidden');
}

async function startDM(targetUsername, closeModals = false) {
    if (targetUsername === username) return;
    if (closeModals) {
        closeStartDMModal();
        closeAllSidebars();
    }

    try {
        const apiUrl = isLocalDev ? `${apiBaseUrl}/api/dm` : '/api/dm';
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, targetUsername })
        });

        if (response.ok) {
            const { id } = await response.json();
            await fetchDMs();
            switchChannel(id);
        } else {
            alert('Failed to start DM');
        }
    } catch (error) {
        console.error('Error starting DM:', error);
    }
}

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
window.closeAllSidebars = closeAllSidebars;
window.selectMention = selectMention;
window.regenerateRecoveryKey = regenerateRecoveryKey;
window.copyNewRecoveryKey = copyNewRecoveryKey;
window.openStartDMModal = openStartDMModal;
window.closeStartDMModal = closeStartDMModal;
window.startDM = startDM;


