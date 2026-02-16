import { state, updateState, clearChannelUnread } from '../state.js';
import { api } from '../api.js';
import { basicEscapeHtml } from '../utils/helpers.js';
import { apiBaseUrl, isLocalDev } from '../config.js';

/**
 * Renders the public channels list in the sidebar.
 */
export function displayChannels() {
    const container = document.getElementById('channels-container');
    if (!container) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'mt-2';

    state.channels.forEach(channel => {
        const isActive = channel.id === state.currentChannelId;
        const isUnread = state.unreadChannels.has(channel.id) && !isActive;

        const channelEl = document.createElement('div');
        channelEl.className = `channel-item flex items-center px-2 py-[6px] rounded-[4px] cursor-pointer group mb-[2px] ${isActive ? 'bg-[#404249] text-white' : 'text-[#949BA4] hover:bg-[#35373C] hover:text-[#dbdee1]'}`;
        channelEl.onclick = () => switchChannel(channel.id);

        channelEl.innerHTML = `
            <i data-lucide="hash" class="mr-1.5 w-5 h-5 text-[#80848E] flex-shrink-0"></i>
            <span class="font-medium truncate flex-1 ${isUnread ? 'text-white font-bold' : ''}">${basicEscapeHtml(channel.name)}</span>
            ${isUnread ? '<div class="unread-badge w-2 h-2 bg-white rounded-full ml-1"></div>' : ''}
            ${channel.id !== 1 ? `
                <button class="delete-btn ml-auto opacity-0 group-hover:opacity-100 hover:bg-red-500/20 hover:text-red-400 text-[#949BA4] p-1 rounded cursor-pointer"
                        onclick="event.stopPropagation(); window.deleteChannel(${channel.id})"
                        title="Delete channel">
                    <i data-lucide="trash-2" class="w-[14px] h-[14px]"></i>
                </button>
            ` : ''}
        `;

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

    container.innerHTML = '';
    container.appendChild(wrapper);
    if (window.lucide) lucide.createIcons();
}

/**
 * Renders the DM list in the sidebar.
 */
export function displayDMs() {
    const container = document.getElementById('dms-container');
    if (!container) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'mt-1';

    state.dms.forEach(dm => {
        const isActive = dm.id === state.currentChannelId;
        const isUnread = state.unreadChannels.has(dm.id) && !isActive;

        const dmEl = document.createElement('div');
        dmEl.className = `channel-item flex items-center px-2 py-[6px] rounded-[4px] cursor-pointer group mb-[2px] ${isActive ? 'bg-[#404249] text-white' : 'text-[#949BA4] hover:bg-[#35373C] hover:text-[#dbdee1]'}`;
        dmEl.onclick = () => switchChannel(dm.id);

        const otherAvatarKey = dm.other_avatar_key;
        const otherDisplayName = dm.other_display_name || dm.other_username;
        const avatarUrl = otherAvatarKey
            ? (isLocalDev ? `${apiBaseUrl}/api/file/${otherAvatarKey}` : `/api/file/${otherAvatarKey}`)
            : `https://ui-avatars.com/api/?name=${encodeURIComponent(otherDisplayName)}&background=random`;

        dmEl.innerHTML = `
            <img src="${avatarUrl}" class="w-6 h-6 rounded-full mr-2 object-cover" oncontextmenu="return false;">
            <span class="font-medium truncate flex-1 ${isUnread ? 'text-white font-bold' : ''}">${basicEscapeHtml(otherDisplayName)}</span>
            ${isUnread ? '<div class="unread-badge w-2 h-2 bg-white rounded-full ml-1"></div>' : ''}
            <button class="delete-btn ml-auto opacity-0 group-hover:opacity-100 hover:bg-red-500/20 hover:text-red-400 text-[#949BA4] p-1 rounded cursor-pointer"
                    onclick="event.stopPropagation(); window.deleteChannel(${dm.id})"
                    title="Close DM">
                <i data-lucide="x" class="w-[14px] h-[14px]"></i>
            </button>
        `;

        wrapper.appendChild(dmEl);
    });

    container.innerHTML = '';
    container.appendChild(wrapper);
    if (window.lucide) lucide.createIcons();
}

/**
 * Navigates to a different channel or DM.
 */
export function switchChannel(channelId) {
    if (channelId === state.currentChannelId) return;
    if (window.dismissKeyboard) window.dismissKeyboard();

    clearChannelUnread(channelId);
    localStorage.setItem('currentChannelId', channelId);
    window.location.reload();
}

/**
 * Renders the members list sidebar.
 */
export function renderMembers() {
    const container = document.getElementById('members-sidebar');
    if (!container) return;

    if (!state.allUsers || state.allUsers.length === 0) {
        container.innerHTML = `<div class="p-4 text-center"><p class="text-sm text-[#949BA4]">No registered users found</p></div>`;
        return;
    }

    container.innerHTML = '';

    const onlineUsers = state.allUsers.filter(u => state.onlineUsernames.has(u.username));
    const offlineUsers = state.allUsers.filter(u => !state.onlineUsernames.has(u.username));

    const renderUser = (user, isOnline) => {
        const displayName = user.display_name || user.username;
        const avatarUrl = user.avatar_key
            ? (isLocalDev ? `${apiBaseUrl}/api/file/${user.avatar_key}` : `/api/file/${user.avatar_key}`)
            : `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=random`;

        return `
            <div class="flex items-center px-2 py-1.5 rounded hover:bg-[#35373C] cursor-pointer group member-item ${isOnline ? '' : 'grayscale-[0.8] contrast-[0.8]'}" onclick="window.openUserDetailModal('${basicEscapeHtml(user.username)}')" oncontextmenu="return false;">
                <div class="relative mr-3">
                    <img src="${avatarUrl}" alt="${basicEscapeHtml(displayName)}" class="w-8 h-8 rounded-full object-cover">
                    <div class="absolute bottom-0 right-0 w-3.5 h-3.5 border-[3px] border-[#2B2D31] rounded-full ${isOnline ? 'bg-green-500' : 'bg-[#949BA4]'}"></div>
                </div>
                <div class="flex-1 min-w-0">
                    <div class="flex items-center justify-between">
                        <div class="text-[15px] font-medium leading-4 text-[#dbdee1] truncate">${basicEscapeHtml(displayName)}</div>
                        ${user.username !== state.username ? `
                        <button class="hidden group-hover:flex text-[#B5BAC1] hover:text-[#dbdee1] p-1 rounded transition-all" title="Message" onclick="event.stopPropagation(); window.startDM('${basicEscapeHtml(user.username)}', true)">
                            <i data-lucide="message-square" class="w-4 h-4"></i>
                        </button>` : ''}
                    </div>
                </div>
            </div>
        `;
    };

    if (onlineUsers.length > 0) {
        const group = document.createElement('div');
        group.className = 'mb-6';
        group.innerHTML = `<h3 class="text-[#949BA4] text-xs font-bold uppercase mb-2 px-2">Online — ${onlineUsers.length}</h3>${onlineUsers.map(u => renderUser(u, true)).join('')}`;
        container.appendChild(group);
    }

    if (offlineUsers.length > 0) {
        const group = document.createElement('div');
        group.className = 'mb-6';
        group.innerHTML = `<h3 class="text-[#949BA4] text-xs font-bold uppercase mb-2 px-2">Offline — ${offlineUsers.length}</h3>${offlineUsers.map(u => renderUser(u, false)).join('')}`;
        container.appendChild(group);
    }

    if (window.lucide) lucide.createIcons();
}

/**
 * Renders the current user's profile panel at the bottom of the sidebar.
 */
export function renderUserProfile() {
    const nameEl = document.getElementById('display-username');
    const initialEl = document.getElementById('user-avatar-initial');
    const avatarDisplay = initialEl?.parentElement;

    if (nameEl) nameEl.textContent = state.displayName;
    if (initialEl) initialEl.textContent = (state.displayName || state.username || 'U').charAt(0).toUpperCase();

    if (state.avatarKey && avatarDisplay) {
        const url = isLocalDev ? `${apiBaseUrl}/api/file/${state.avatarKey}` : `/api/file/${state.avatarKey}`;
        avatarDisplay.innerHTML = `<img src="${url}" class="w-8 h-8 rounded-full object-cover">`;
    }
}
