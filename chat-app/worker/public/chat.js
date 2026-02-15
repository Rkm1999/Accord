import { state, updateState, markChannelUnread } from './js/modules/state.js';
import { api } from './js/modules/api.js';
import { connect, send, addSocketListener } from './js/modules/socket.js';
import { 
    displayHistory, displayMessage, displayMoreMessages, 
    recalculateAllGrouping, scrollToBottom,
    updateMessageEdit, removeMessageElement
} from './js/modules/ui/messages.js';
import { 
    displayChannels, displayDMs, renderMembers, renderUserProfile
} from './js/modules/ui/sidebars.js';
import { 
    openSearchModal, openProfileModal, openCreateChannelModal, openStartDMModal,
    openNotificationSettingsModal, performSearch, createChannel, updateProfile,
    regenerateRecoveryKey, copyNewRecoveryKey
} from './js/modules/ui/modals.js';
import { 
    handleMentionAutocomplete, handleAutocompleteKeydown, handleTextSelection, initInputListeners 
} from './js/modules/ui/input.js';
import { 
    handleFileSelect, handlePaste, handleDragEnter, handleDragOver, handleDragLeave, handleDrop,
    uploadFileWithProgress, updateSendButtonVisibility, hideFilePreview
} from './js/modules/ui/upload.js';
import { 
    updateMessageReactions, toggleReactionPicker, initReactionListeners,
    sendReaction, toggleReaction
} from './js/modules/ui/reactions.js';
import { initAuthUI, logout } from './js/modules/ui/auth.js';
import { 
    registerServiceWorker, initPwaInstallation 
} from './js/modules/pwa/sw-manager.js';
import { initPushSync, togglePushNotifications } from './js/modules/pwa/push.js';
import { initBadging, updateAppBadge } from './js/modules/pwa/badging.js';
import { setupViewportHandlers } from './js/modules/gestures/viewport.js';
import { 
    setupMessageSwipeHandlers, closeAllSidebars, toggleSidebar, dismissKeyboard, initMobileListeners 
} from './js/modules/gestures/mobile.js';
import { setupImageZoomHandlers } from './js/modules/gestures/zoom.js';
import { initModalListeners } from './js/modules/ui/modals.js';
import { downloadFile } from './js/modules/utils/downloader.js';

/**
 * Main Chat Application Orchestrator
 */

async function initApp() {
    // 1. PWA & Background
    registerServiceWorker();
    initPwaInstallation();
    initPushSync();
    initBadging();

    // 2. Initial Data Load
    try {
        const [users, channels, dms, notifications] = await Promise.all([
            api.fetchRegisteredUsers(),
            api.fetchChannels(),
            api.fetchDMs(state.username),
            api.fetchNotificationSettings(state.username)
        ]);

        updateState({
            allUsers: users,
            channels: channels,
            dms: dms,
            notificationSettings: notifications
        });

        displayChannels();
        displayDMs();
        renderMembers();
        renderUserProfile();
    } catch (e) {
        console.error('Failed to load initial data:', e);
    }

    // 3. Socket Logic
    addSocketListener((data) => {
        switch (data.type) {
            case 'connected':
                state.onlineUsernames.add(state.username);
                renderMembers();
                break;
            case 'history':
                if (data.before) displayMoreMessages(data.messages, data.before, data.hasMore);
                else displayHistory(data.messages, data.lastReadMessageId, data.before, data.hasMore);
                break;
            case 'chat':
                if (data.channelId === state.currentChannelId) displayMessage(data, false);
                else {
                    markChannelUnread(data.channelId);
                    displayChannels();
                    displayDMs();
                    updateAppBadge();
                }
                break;
            case 'online_list':
                updateState({ onlineUsernames: new Set(data.usernames) });
                data.usernames.forEach(u => state.joinedUsers.add(u));
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
                if (data.event === 'user_joined') state.onlineUsernames.add(data.username);
                else state.onlineUsernames.delete(data.username);
                renderMembers();
                break;
            case 'typing':
                if (data.username === state.username) return;
                if (data.isTyping) state.typingUsers.add(data.username);
                else state.typingUsers.delete(data.username);
                // Simple typing UI update
                const indicator = document.getElementById('typingIndicator');
                if (indicator) {
                    indicator.classList.toggle('hidden', state.typingUsers.size === 0);
                    const text = document.getElementById('typing-text');
                    if (text) text.textContent = state.typingUsers.size === 1 
                        ? `${Array.from(state.typingUsers)[0]} is typing...` 
                        : `${state.typingUsers.size} people are typing...`;
                }
                break;
            case 'refresh_channels':
                api.fetchChannels().then(c => { updateState({ channels: c }); displayChannels(); });
                break;
            case 'refresh_users':
                api.fetchRegisteredUsers().then(u => { updateState({ allUsers: u }); renderMembers(); });
                break;
        }
    });

    connect(state.username, state.currentChannelId);

    // 4. Gesture & Viewport Initialization
    setupViewportHandlers();
    setupMessageSwipeHandlers();
    setupImageZoomHandlers();

    // 5. Global Event Listeners & Module Listeners
    initModalListeners();
    initReactionListeners();
    initMobileListeners();
    initInputListeners();
    setupEventListeners();
}

function setupEventListeners() {
    const input = document.getElementById('message-input');
    const form = document.getElementById('message-form');
    const fileInput = document.getElementById('fileInput');

    // Input area
    if (input) {
        input.addEventListener('input', (e) => {
            // Auto-expand height
            input.style.height = 'auto';
            input.style.height = (input.scrollHeight) + 'px';
            
            send({ type: 'typing', isTyping: true });
            handleMentionAutocomplete(e);
            updateSendButtonVisibility();
        });
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                form.dispatchEvent(new Event('submit'));
            } else {
                handleAutocompleteKeydown(e);
            }
        });
        input.addEventListener('select', handleTextSelection);
        input.addEventListener('mouseup', handleTextSelection);
        input.addEventListener('keyup', (e) => {
            if (!['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) handleTextSelection();
        });
        input.addEventListener('paste', handlePaste);

        // Ensure tap on input restores keyboard even if already "focused"
        input.addEventListener('touchstart', (e) => {
            const spacer = document.getElementById('mobile-emoji-spacer');
            const isEmojiKeyboardOpen = spacer && !spacer.classList.contains('hidden');
            
            if (isEmojiKeyboardOpen) {
                // If we're in emoji mode, a tap on the input should switch to the native keyboard
                input.inputMode = 'text';
                if (window.closeMobileEmojiModal) window.closeMobileEmojiModal(true);
                
                input.focus();
                setTimeout(() => input.focus(), 50);
            } else {
                input.inputMode = 'text';
            }
        });
    }

    const sendBtn = document.getElementById('send-message-btn');
    if (sendBtn) {
        sendBtn.addEventListener('pointerdown', (e) => {
            // Prevent the button from taking focus away from the input
            e.preventDefault();
        });
    }

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const message = input.value.trim();
            if (!message && state.selectedFiles.length === 0) return;

            const sendBtn = document.getElementById('send-message-btn');
            const originalContent = sendBtn.innerHTML;
            sendBtn.disabled = true;

            try {
                const uploadedFiles = [];
                for (let i = 0; i < state.selectedFiles.length; i++) {
                    const res = await uploadFileWithProgress(state.selectedFiles[i], i);
                    uploadedFiles.push(res);
                }

                if (uploadedFiles.length > 0) {
                    send({ type: 'chat', message, file: uploadedFiles[0], replyTo: state.replyingTo?.messageId });
                    for (let i = 1; i < uploadedFiles.length; i++) {
                        send({ type: 'chat', message: '', file: uploadedFiles[i], replyTo: state.replyingTo?.messageId });
                    }
                } else if (message) {
                    send({ type: 'chat', message, replyTo: state.replyingTo?.messageId });
                }

                input.value = '';
                input.style.height = 'auto';
                state.selectedFiles = [];
                hideFilePreview();
                if (window.cancelReply) window.cancelReply();
                send({ type: 'typing', isTyping: false });
            } catch (err) {
                alert('Failed to send message.');
            } finally {
                sendBtn.disabled = false;
                sendBtn.innerHTML = originalContent;
                updateSendButtonVisibility();
            }
        });
    }

    const messagesContainerEl = document.getElementById('messages-container');
    if (messagesContainerEl) {
        // Event delegation for dynamic message actions
        messagesContainerEl.addEventListener('click', (e) => {
            const trigger = e.target.closest('.action-trigger');
            if (trigger) {
                const action = trigger.dataset.action;
                const id = parseInt(trigger.dataset.id);
                
                switch (action) {
                    case 'reaction': toggleReactionPicker(e, id); break;
                    case 'reply': window.startReply(id); break;
                    case 'edit': window.openEditModal(id); break;
                    case 'delete': window.deleteMessage(id); break;
                }
                return;
            }

            // Dismiss keyboard if clicking background or message area (but not buttons/links)
            if (e.target.id === 'messages-container' || e.target.closest('.message-group')) {
                // If it's a message group, check if they clicked an interactive element
                if (e.target.closest('button') || e.target.closest('a') || e.target.closest('.reaction-badge')) {
                    return;
                }
                dismissKeyboard();
            }
        });

        messagesContainerEl.addEventListener('scroll', () => {
            const container = messagesContainerEl;
            const banner = document.getElementById('unread-banner');
            const scrollBottomBtn = document.getElementById('scroll-bottom-btn');

            // Scroll to bottom button visibility
            const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 200;
            if (scrollBottomBtn) {
                scrollBottomBtn.classList.toggle('visible', !isNearBottom);
                scrollBottomBtn.classList.toggle('opacity-0', isNearBottom);
                scrollBottomBtn.classList.toggle('pointer-events-none', isNearBottom);
            }

            // Auto-load more messages
            if (container.scrollTop < 100 && state.hasMoreMessages && !state.isLoadingMore && !state.isAutoLoading) {
                loadMoreMessages(false);
            }
        });
    }

    // Drag & Drop
    const app = document.getElementById('app');
    if (app) {
        app.addEventListener('dragenter', handleDragEnter);
        app.addEventListener('dragover', handleDragOver);
        app.addEventListener('dragleave', handleDragLeave);
        app.addEventListener('drop', handleDrop);
    }

    // Sidebars
    document.getElementById('toggle-channels-btn')?.addEventListener('click', () => toggleSidebar('channel-sidebar'));
    document.getElementById('toggle-members-btn')?.addEventListener('click', () => toggleSidebar('members-sidebar'));
    document.getElementById('sidebar-overlay')?.addEventListener('click', closeAllSidebars);
    document.getElementById('server-header')?.addEventListener('click', closeAllSidebars);

    // Modal Openers
    document.getElementById('openCreateChannelBtn')?.addEventListener('click', openCreateChannelModal);
    document.getElementById('openStartDMBtn')?.addEventListener('click', openStartDMModal);
    document.getElementById('user-profile-panel')?.addEventListener('click', openProfileModal);
    document.getElementById('open-settings-btn')?.addEventListener('click', openProfileModal);
    document.getElementById('open-search-btn')?.addEventListener('click', openSearchModal);
    
    // Other UI
    document.getElementById('unread-banner')?.addEventListener('click', () => {
        const div = document.getElementById('unread-divider');
        if (div) div.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    document.getElementById('scroll-bottom-btn')?.addEventListener('click', scrollToBottom);
    document.getElementById('cancel-reply-btn')?.addEventListener('click', () => {
        if (window.cancelReply) window.cancelReply();
    });
    document.getElementById('emoji-trigger-btn')?.addEventListener('click', (e) => toggleReactionPicker(e, null));

    // Modal Specifics (Cancel/Close/Submit)
    document.getElementById('closeCreateChannelBtn1')?.addEventListener('click', () => {
        document.getElementById('createChannelModal')?.classList.add('hidden');
    });
    document.getElementById('closeCreateChannelBtn2')?.addEventListener('click', () => {
        document.getElementById('createChannelModal')?.classList.add('hidden');
    });
    document.getElementById('createChannelBtn')?.addEventListener('click', createChannel);
    document.getElementById('newChannelName')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') createChannel();
    });

    document.getElementById('closeStartDMBtn1')?.addEventListener('click', () => {
        document.getElementById('startDMModal')?.classList.add('hidden');
    });
    document.getElementById('closeStartDMBtn2')?.addEventListener('click', () => {
        document.getElementById('startDMModal')?.classList.add('hidden');
    });
    document.getElementById('dmSearchInput')?.addEventListener('input', (e) => {
        // This needs to call renderDMUserList which is in modals.js
        // For now, I'll let the module handle its own internal listeners if possible
    });

    document.getElementById('closeSearchBtn')?.addEventListener('click', () => {
        document.getElementById('searchModal')?.classList.add('hidden');
    });
    document.getElementById('performSearchBtn')?.addEventListener('click', performSearch);

    document.getElementById('imageModalOverlay')?.addEventListener('click', () => {
        document.getElementById('imageModal')?.classList.add('hidden');
    });
    document.getElementById('closeImageModalBtn')?.addEventListener('click', () => {
        document.getElementById('imageModal')?.classList.add('hidden');
    });

    // General clicks
    document.addEventListener('click', (e) => {
        // Dismiss picker if clicking outside
        const picker = document.getElementById('reactionPicker');
        if (picker && !picker.contains(e.target) && !e.target.closest('#emoji-trigger-btn')) {
            picker.classList.add('hidden');
        }
        
        // Dismiss keyboard when clicking chat background
        if (e.target.id === 'messages-container') dismissKeyboard();
    });
}

// Start the app
if (state.username) {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    window.location.replace('/');
}

// Global exposes for legacy HTML support (Phase 6 cleanup)
window.dismissKeyboard = dismissKeyboard;
window.downloadFile = downloadFile;
window.toggleReactionPicker = toggleReactionPicker;
window.sendReaction = sendReaction;
window.toggleReaction = toggleReaction;
window.openSearchModal = openSearchModal;
window.openProfileModal = openProfileModal;
window.openCreateChannelModal = openCreateChannelModal;
window.openStartDMModal = openStartDMModal;
window.openNotificationSettingsModal = openNotificationSettingsModal;
window.performSearch = performSearch;
window.createChannel = createChannel;
window.updateProfile = updateProfile;
window.regenerateRecoveryKey = regenerateRecoveryKey;
window.copyNewRecoveryKey = copyNewRecoveryKey;
window.togglePushNotifications = togglePushNotifications;
window.openUserSettings = logout;
window.logout = logout;
