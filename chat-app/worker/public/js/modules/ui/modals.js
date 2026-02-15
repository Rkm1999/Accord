import { state, updateState, setUserIdentity, clearChannelUnread } from '../state.js';
import { api } from '../api.js';
import { isIOS, apiBaseUrl, isLocalDev } from '../config.js';
import { basicEscapeHtml } from '../utils/helpers.js';
import { displayChannels, displayDMs, renderMembers, switchChannel } from './sidebars.js';
import { scrollToMessage } from './messages.js';

export function openEmojiUploadModal() {
    const modal = document.getElementById('emojiUploadModal');
    if (modal) {
        syncModalViewport(modal);
        modal.classList.remove('hidden');
        if (window.lucide) window.lucide.createIcons();
    }
}

/**
 * Initializes listeners for static modal elements.
 */
export function initModalListeners() {
    const modals = [
        { id: 'createChannelModal', close: closeCreateChannelModal },
        { id: 'startDMModal', close: closeStartDMModal },
        { id: 'searchModal', close: closeSearchModal },
        { id: 'profileModal', close: closeProfileModal },
        { id: 'userDetailModal', close: closeUserDetailModal },
        { id: 'notificationSettingsModal', close: closeNotificationSettingsModal },
        { id: 'emojiUploadModal', close: () => document.getElementById('emojiUploadModal')?.classList.add('hidden') }
    ];

    modals.forEach(m => {
        document.getElementById(m.id)?.addEventListener('click', (e) => {
            if (e.target.id === m.id) m.close();
        });
    });

    document.getElementById('dmSearchInput')?.addEventListener('input', (e) => {
        renderDMUserList(e.target.value);
    });

    document.getElementById('openEmojiModalBtn')?.addEventListener('click', openEmojiUploadModal);

    document.getElementById('closeEmojiModalBtn1')?.addEventListener('click', () => {
        document.getElementById('emojiUploadModal')?.classList.add('hidden');
    });

    document.getElementById('uploadEmojiBtn')?.addEventListener('click', () => {
        window.uploadEmoji();
    });

    document.getElementById('avatarInputGroup')?.addEventListener('click', () => {
        document.getElementById('avatarInput')?.click();
    });

    document.getElementById('avatarInput')?.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (ev) => {
                document.getElementById('profilePreview').src = ev.target.result;
            };
            reader.readAsDataURL(file);
        }
    });

    document.getElementById('openNotificationSettingsBtn')?.addEventListener('click', openNotificationSettingsModal);
    document.getElementById('copyNewRecoveryKeyBtn')?.addEventListener('click', copyNewRecoveryKey);

    document.getElementById('regenerateRecoveryKeyBtn')?.addEventListener('click', regenerateRecoveryKey);
    document.getElementById('logoutBtn')?.addEventListener('click', () => {
        if (window.logout) window.logout();
    });
    document.getElementById('updateProfileBtn')?.addEventListener('click', updateProfile);
    document.getElementById('closeProfileModalBtn')?.addEventListener('click', closeProfileModal);

    document.getElementById('userDetailAvatarContainer')?.addEventListener('click', () => {
        const avatar = document.getElementById('userDetailAvatar');
        if (avatar?.src) window.openImageModal(avatar.src);
    });

    document.getElementById('userDetailDMBtn')?.addEventListener('click', () => {
        if (state.userDetailModalUsername) {
            window.startDM(state.userDetailModalUsername, true);
            closeUserDetailModal();
        }
    });

    document.getElementById('showNotificationHelpBtn')?.addEventListener('click', () => {
        alert("Notification Levels:\n\n• SIMPLE (Default): A single generic alert (\"New Message\") per channel until you read it.\n• ALL: Detailed alerts for every single message.\n• MENTIONS: Only notify if you are specifically tagged.\n• NOTHING: Mute all push notifications.");
    });

    document.getElementById('closeNotificationSettingsBtn1')?.addEventListener('click', closeNotificationSettingsModal);
    document.getElementById('closeNotificationSettingsBtn2')?.addEventListener('click', closeNotificationSettingsModal);
    document.getElementById('globalPushToggle')?.addEventListener('change', (e) => {
        if (window.togglePushNotifications) window.togglePushNotifications(e.target.checked);
    });
}

export async function regenerateRecoveryKey() {
    if (!confirm('This will invalidate your old recovery key. Are you sure?')) return;

    try {
        const result = await api.updateProfile({
            username: state.username,
            displayName: state.displayName,
            generateNewRecoveryKey: true
        });

        const container = document.getElementById('newRecoveryKeyContainer');
        const display = document.getElementById('newRecoveryKeyDisplay');
        if (container && display) {
            display.textContent = result.newRecoveryKey;
            container.classList.remove('hidden');
            if (window.lucide) lucide.createIcons();
            alert('New recovery key generated! Please save it safely.');
        }
    } catch (error) {
        console.error('Regenerate key error:', error);
        alert('Failed to regenerate recovery key');
    }
}

export function copyNewRecoveryKey() {
    const display = document.getElementById('newRecoveryKeyDisplay');
    const key = display?.textContent;
    if (key) {
        navigator.clipboard.writeText(key);
        alert('Copied to clipboard!');
    }
}

export async function uploadEmoji() {
    const nameInput = document.getElementById('emojiNameInput');
    const fileInput = document.getElementById('emojiFileInput');
    const name = nameInput?.value.trim();
    const file = fileInput?.files[0];

    if (!name || !file) {
        alert('Please provide both a name and an image.');
        return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
        const image = e.target.result;
        try {
            await api.uploadEmoji({ name, image, username: state.username });
            alert('Emoji uploaded!');
            document.getElementById('emojiUploadModal')?.classList.add('hidden');
            // Refresh emojis list
            const updated = await api.fetchEmojis();
            updateState({ customEmojis: updated });
            if (nameInput) nameInput.value = '';
            if (fileInput) fileInput.value = '';
        } catch (error) {
            console.error('Emoji upload error:', error);
            alert('Upload failed: ' + error.message);
        }
    };
    reader.readAsDataURL(file);
}

window.uploadEmoji = uploadEmoji;

/**
 * Syncs modal height and position with the visual viewport (fixes mobile keyboard issues).
 */
export function syncModalViewport(modal) {
    if (!window.visualViewport) return;
    const height = window.visualViewport.height;
    const offsetTop = window.visualViewport.offsetTop;
    modal.style.height = `${height}px`;
    if (isIOS) {
        modal.style.transform = `translateY(${offsetTop}px)`;
    }
}

/**
 * Profile Modal Logic
 */
export function openProfileModal() {
    if (window.closeAllSidebars) window.closeAllSidebars();
    if (window.dismissKeyboard) window.dismissKeyboard();
    
    const modal = document.getElementById('profileModal');
    syncModalViewport(modal);
    
    const nameInput = document.getElementById('displayNameInput');
    const preview = document.getElementById('profilePreview');

    if (nameInput) nameInput.value = state.displayName;
    if (preview) {
        preview.src = state.avatarKey
            ? (isLocalDev ? `${apiBaseUrl}/api/file/${state.avatarKey}` : `/api/file/${state.avatarKey}`)
            : `https://ui-avatars.com/api/?name=${encodeURIComponent(state.displayName)}&background=random`;
    }

    modal.classList.remove('hidden');
}

export function closeProfileModal() {
    document.getElementById('profileModal').classList.add('hidden');
}

export async function updateProfile() {
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
        const result = await api.updateProfile({
            username: state.username,
            displayName: newDisplayName,
            avatarImage
        });

        setUserIdentity({
            username: state.username,
            displayName: newDisplayName,
            avatarKey: result.avatarKey || state.avatarKey
        });

        alert('Profile updated! Refresh to see changes in old messages.');
        closeProfileModal();
        window.location.reload();
    } catch (error) {
        console.error('Update profile error:', error);
        alert('Failed to update profile');
    }
}

/**
 * User Detail Modal (When clicking a member or avatar)
 */
export function openUserDetailModal(targetUsername) {
    if (!targetUsername) return;

    const user = state.allUsers.find(u => u.username === targetUsername);
    if (!user) return;

    updateState({ userDetailModalUsername: targetUsername });
    
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

    const isOnline = state.onlineUsernames.has(targetUsername);
    statusDot.style.backgroundColor = isOnline ? '#23a55a' : '#80848e';
    statusText.textContent = isOnline ? 'Online' : 'Offline';

    if (targetUsername === state.username) dmBtn.classList.add('hidden');
    else dmBtn.classList.remove('hidden');

    modal.classList.remove('hidden');
}

export function closeUserDetailModal() {
    document.getElementById('userDetailModal').classList.add('hidden');
}

/**
 * Channel Creation Logic
 */
export function openCreateChannelModal() {
    if (window.dismissKeyboard) window.dismissKeyboard();
    const modal = document.getElementById('createChannelModal');
    syncModalViewport(modal);
    const input = document.getElementById('newChannelName');
    if (input) {
        input.value = '';
        input.classList.remove('ring-2', 'ring-red-500');
    }
    modal.classList.remove('hidden');
    setTimeout(() => input?.focus(), 100);
}

export function closeCreateChannelModal() {
    document.getElementById('createChannelModal').classList.add('hidden');
}

export async function createChannel() {
    const input = document.getElementById('newChannelName');
    const channelName = input.value.trim();
    if (!channelName || channelName.length < 2) return;

    try {
        const newChannel = await api.createChannel(channelName, state.username);
        closeCreateChannelModal();
        const updatedChannels = await api.fetchChannels();
        updateState({ channels: updatedChannels });
        displayChannels();
        switchChannel(newChannel.id);
    } catch (error) {
        console.error('Error creating channel:', error);
        alert('Failed to create channel');
    }
}

/**
 * Start DM Modal
 */
export function openStartDMModal() {
    if (window.closeAllSidebars) window.closeAllSidebars();
    if (window.dismissKeyboard) window.dismissKeyboard();
    const modal = document.getElementById('startDMModal');
    const input = document.getElementById('dmSearchInput');
    const list = document.getElementById('dmUserList');

    if (input) input.value = '';
    renderDMUserList();
    modal.classList.remove('hidden');
    setTimeout(() => input?.focus(), 100);
}

export function closeStartDMModal() {
    document.getElementById('startDMModal').classList.add('hidden');
}

function renderDMUserList(filter = '') {
    const list = document.getElementById('dmUserList');
    const users = state.allUsers.filter(u => u.username !== state.username);
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
            <div class="flex items-center p-2 hover:bg-[#35373C] rounded cursor-pointer transition-colors" onclick="window.startDM('${basicEscapeHtml(u.username)}', true)">
                <img src="${avatarUrl}" class="w-8 h-8 rounded-full mr-3 object-cover">
                <div>
                    <div class="font-medium text-[#dbdee1]">${basicEscapeHtml(displayName)}</div>
                    <div class="text-xs text-[#949BA4]">@${basicEscapeHtml(u.username)}</div>
                </div>
            </div>`;
    }).join('');
}

/**
 * Search Modal Logic
 */
export function openSearchModal() {
    if (window.closeAllSidebars) window.closeAllSidebars();
    if (window.dismissKeyboard) window.dismissKeyboard();
    const modal = document.getElementById('searchModal');
    syncModalViewport(modal);
    
    const channelSelect = document.getElementById('searchChannelId');
    channelSelect.innerHTML = '<option value="all">All Channels</option>' + 
        state.channels.map(c => `<option value="${c.id}">${basicEscapeHtml(c.name)}</option>`).join('');

    document.getElementById('searchResults').innerHTML = '';
    modal.classList.remove('hidden');
    document.getElementById('searchQuery').focus();
}

export function closeSearchModal() {
    document.getElementById('searchModal').classList.add('hidden');
}

export async function performSearch() {
    const params = {
        query: document.getElementById('searchQuery').value.trim(),
        username: document.getElementById('searchUsername').value.trim(),
        channelId: document.getElementById('searchChannelId').value,
        startDate: document.getElementById('searchStartDate').value,
        endDate: document.getElementById('searchEndDate').value,
        offset: 0
    };

    updateState({ currentSearchParams: params, searchOffset: 0 });
    const resultsEl = document.getElementById('searchResults');
    resultsEl.innerHTML = '<div class="p-4 text-[#949BA4]">Searching...</div>';

    try {
        const results = await api.searchMessages(params);
        displaySearchResults(results.results, 0, results.hasMore, results.total);
    } catch (error) {
        console.error('Search error:', error);
        resultsEl.innerHTML = '<div class="p-4 text-red-400">Error searching messages</div>';
    }
}

function displaySearchResults(results, offset, hasMore, total) {
    const container = document.getElementById('searchResults');
    updateState({ searchOffset: offset, searchHasMore: hasMore, searchIsLoading: false });

    if (results.length === 0 && offset === 0) {
        container.innerHTML = '<div class="p-4 text-[#949BA4]">No results found</div>';
        return;
    }

    if (offset === 0) container.innerHTML = '';

    results.forEach(result => {
        const resultEl = document.createElement('div');
        resultEl.className = 'px-4 py-3 hover:bg-[#2e3035] cursor-pointer border-b border-[#26272D]';
        resultEl.innerHTML = `
            <div class="flex items-center mb-2">
                <span class="font-medium text-[#dbdee1] mr-2">${basicEscapeHtml(result.username)}</span>
                <span class="text-xs text-[#949BA4] bg-[#2B2D31] px-2 py-0.5 rounded">#${basicEscapeHtml(result.channel_name)}</span>
                <span class="text-xs text-[#949BA4] ml-auto">${new Date(result.timestamp).toLocaleString()}</span>
            </div>
            <div class="text-sm text-[#dbdee1]">${basicEscapeHtml(result.message || 'File attachment')}</div>`;
        
        resultEl.onclick = () => {
            localStorage.setItem('searchTargetMessageId', result.id);
            if (result.channel_id !== state.currentChannelId) {
                localStorage.setItem('currentChannelId', result.channel_id);
                window.location.reload();
            } else {
                closeSearchModal();
                scrollToMessage(result.id);
            }
        };
        container.appendChild(resultEl);
    });
}

/**
 * Notification Settings Modal
 */
export function openNotificationSettingsModal() {
    const modal = document.getElementById('notificationSettingsModal');
    const globalToggle = document.getElementById('globalPushToggle');
    
    if (globalToggle) {
        const isEnabled = localStorage.getItem('pushEnabled') !== 'false' && !!localStorage.getItem('fcmToken');
        globalToggle.checked = isEnabled && Notification.permission === 'granted';
    }
    
    renderChannelNotificationSettings();
    modal.classList.remove('hidden');
}

export function closeNotificationSettingsModal() {
    document.getElementById('notificationSettingsModal').classList.add('hidden');
}

function renderChannelNotificationSettings() {
    const list = document.getElementById('channelNotificationList');
    if (!list) return;
    
    list.innerHTML = state.channels.map(channel => {
        const setting = state.notificationSettings.find(s => s.channel_id === channel.id);
        const level = setting?.level || 'simple';
        
        return `
            <div class="p-3 bg-[#2B2D31] rounded-lg border border-[#404249] mb-2">
                <div class="flex items-center justify-between mb-3">
                    <div class="flex items-center gap-2">
                        <i data-lucide="hash" class="w-4 h-4 text-[#80848E]"></i>
                        <span class="font-bold text-white text-sm">${basicEscapeHtml(channel.name)}</span>
                    </div>
                </div>
                <div class="flex gap-1 bg-[#1E1F22] p-1 rounded-md">
                    ${['all', 'simple', 'mentions', 'none'].map(l => `
                        <button onclick="window.updateChannelNotificationLevel(${channel.id}, '${l}')" 
                            class="flex-1 text-[10px] font-bold py-1.5 rounded transition-all ${level === l ? 'bg-[#5865F2] text-white' : 'text-[#949BA4] hover:bg-[#35373C]'}">
                            ${l.toUpperCase()}
                        </button>
                    `).join('')}
                </div>
            </div>`;
    }).join('');
    if (window.lucide) lucide.createIcons();
}

/**
 * Global exposes for generated HTML
 */
window.openUserDetailModal = openUserDetailModal;
window.startDM = async (targetUsername, closeModals) => {
    if (closeModals) closeStartDMModal();
    try {
        const { id } = await api.startDM(state.username, targetUsername);
        const updatedDMs = await api.fetchDMs(state.username);
        updateState({ dms: updatedDMs });
        displayDMs();
        switchChannel(id);
    } catch (e) { alert('Failed to start DM'); }
};
window.updateChannelNotificationLevel = async (channelId, level) => {
    try {
        await api.updateNotificationSettings(state.username, channelId, level);
        const updated = await api.fetchNotificationSettings(state.username);
        updateState({ notificationSettings: updated });
        renderChannelNotificationSettings();
    } catch (e) { console.error('Failed to update notification level'); }
};
window.deleteChannel = async (channelId) => {
    if (!confirm('Are you sure?')) return;
    try {
        await api.deleteChannel(channelId);
        window.location.reload();
    } catch (e) { alert('Failed to delete channel'); }
};
window.openImageModal = (url, name = 'image.png') => {
    const modal = document.getElementById('imageModal');
    const img = document.getElementById('imageModalImg');
    const downloadBtn = document.getElementById('imageModalDownloadBtn');
    if (modal && img) {
        img.src = url;
        if (downloadBtn) {
            downloadBtn.onclick = () => {
                if (window.downloadFile) window.downloadFile(url, name);
            };
        }
        modal.classList.remove('hidden');
        if (window.resetImageZoom) window.resetImageZoom();
    }
};
