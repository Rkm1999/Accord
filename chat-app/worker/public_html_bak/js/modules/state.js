/**
 * Centralized Application State
 */

export const state = {
    // Connection
    isConnected: false,

    // User Identity
    username: localStorage.getItem('chatUsername'),
    displayName: localStorage.getItem('displayName'),
    avatarKey: localStorage.getItem('avatarKey') || '',
    
    // Channel / Navigation
    currentChannelId: parseInt(localStorage.getItem('currentChannelId') || '1'),
    unreadChannels: new Set(JSON.parse(localStorage.getItem('unreadChannels') || '[]')),
    
    // Data Lists
    channels: [],
    dms: [],
    allUsers: [],
    customEmojis: [],
    notificationSettings: [],
    
    // Live Presence
    onlineUsernames: new Set(),
    joinedUsers: new Set(),
    typingUsers: new Set(),
    
    // Active UI Actions
    selectedFiles: [],
    replyingTo: null,
    editingMessageId: null,
    reactionPickerMessageId: null,
    selectedMobileMessageId: null,
    
    // Message History / Pagination
    oldestMessageTimestamp: null,
    hasMoreMessages: false,
    isLoadingMore: false,
    isAutoLoading: false,
    lastScrollTop: 0,
    
    // Search
    searchOffset: 0,
    searchHasMore: false,
    searchIsLoading: false,
    searchIsAutoLoading: false,
    currentSearchParams: {}
};

/**
 * Updates multiple state properties at once.
 */
export function updateState(newState) {
    Object.assign(state, newState);
}

/**
 * Persists unread channels to localStorage and updates state.
 */
export function setUnreadChannels(channelsSet) {
    state.unreadChannels = channelsSet;
    localStorage.setItem('unreadChannels', JSON.stringify(Array.from(state.unreadChannels)));
}

/**
 * Mark a channel as unread.
 */
export function markChannelUnread(channelId) {
    state.unreadChannels.add(channelId);
    localStorage.setItem('unreadChannels', JSON.stringify(Array.from(state.unreadChannels)));
}

/**
 * Clear unread status for a channel.
 */
export function clearChannelUnread(channelId) {
    if (state.unreadChannels.has(channelId)) {
        state.unreadChannels.delete(channelId);
        localStorage.setItem('unreadChannels', JSON.stringify(Array.from(state.unreadChannels)));
    }
}

/**
 * Helper to update user identity in state and localStorage.
 */
export function setUserIdentity(data) {
    state.username = data.username;
    state.displayName = data.displayName;
    state.avatarKey = data.avatarKey || '';
    
    localStorage.setItem('chatUsername', state.username);
    localStorage.setItem('displayName', state.displayName);
    localStorage.setItem('avatarKey', state.avatarKey);
}
