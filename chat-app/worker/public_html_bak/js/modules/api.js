import { apiBaseUrl } from './config.js';
import { state } from './state.js';

/**
 * Handles API responses and throws errors for non-ok status codes.
 */
async function handleResponse(response) {
    if (!response.ok) {
        const error = await response.text();
        throw new Error(error || `API Request failed with status ${response.status}`);
    }
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
        return response.json();
    }
    return response.text();
}

export const api = {
    // Auth
    async login(username, password) {
        return handleResponse(await fetch(`${apiBaseUrl}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        }));
    },

    async register(username, password) {
        return handleResponse(await fetch(`${apiBaseUrl}/api/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        }));
    },

    async resetPassword(username, recoveryKey, newPassword) {
        return handleResponse(await fetch(`${apiBaseUrl}/api/auth/reset-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, recoveryKey, newPassword })
        }));
    },

    // Channels & DMs
    async fetchChannels() {
        return handleResponse(await fetch(`${apiBaseUrl}/api/channels`));
    },

    async fetchDMs(username) {
        return handleResponse(await fetch(`${apiBaseUrl}/api/dms?username=${encodeURIComponent(username)}`));
    },

    async createChannel(name, createdBy) {
        return handleResponse(await fetch(`${apiBaseUrl}/api/channels`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, createdBy })
        }));
    },

    async deleteChannel(channelId) {
        return handleResponse(await fetch(`${apiBaseUrl}/api/channels/${channelId}`, {
            method: 'DELETE'
        }));
    },

    async startDM(username, targetUsername) {
        return handleResponse(await fetch(`${apiBaseUrl}/api/dm`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, targetUsername })
        }));
    },

    // Users & Profile
    async fetchRegisteredUsers() {
        return handleResponse(await fetch(`${apiBaseUrl}/api/users/list?t=${Date.now()}`));
    },

    async updateProfile(profileData) {
        return handleResponse(await fetch(`${apiBaseUrl}/api/user/profile`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(profileData)
        }));
    },

    // Emojis
    async fetchEmojis() {
        return handleResponse(await fetch(`${apiBaseUrl}/api/emojis`));
    },

    async uploadEmoji(emojiData) {
        return handleResponse(await fetch(`${apiBaseUrl}/api/emojis`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(emojiData)
        }));
    },

    // Notifications
    async fetchNotificationSettings(username) {
        return handleResponse(await fetch(`${apiBaseUrl}/api/notifications/settings?username=${encodeURIComponent(username)}`));
    },

    async updateNotificationSettings(username, channelId, level) {
        return handleResponse(await fetch(`${apiBaseUrl}/api/notifications/settings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, channelId, level })
        }));
    },

    // Search
    async searchMessages(searchParams) {
        return handleResponse(await fetch(`${apiBaseUrl}/api/search`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(searchParams)
        }));
    },

    // File Upload & Deduplication
    async checkFileHash(hash) {
        return handleResponse(await fetch(`${apiBaseUrl}/api/upload/check?hash=${hash}`));
    },

    /**
     * Uploads a file with progress tracking via XHR.
     */
    uploadFile(file, username, onProgress) {
        return new Promise((resolve, reject) => {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('username', username);

            const xhr = new XMLHttpRequest();
            xhr.open('POST', `${apiBaseUrl}/api/upload`, true);

            if (onProgress) {
                xhr.upload.onprogress = (e) => {
                    if (e.lengthComputable) {
                        const percentComplete = (e.loaded / e.total) * 100;
                        onProgress(percentComplete);
                    }
                };
            }

            xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    try {
                        resolve(JSON.parse(xhr.responseText));
                    } catch (e) {
                        resolve(xhr.responseText);
                    }
                } else {
                    reject(new Error(`Upload failed with status ${xhr.status}`));
                }
            };

            xhr.onerror = () => reject(new Error('Network error during upload'));
            xhr.send(formData);
        });
    },

    // PWA & Push
    async getAppConfig() {
        return handleResponse(await fetch(`${apiBaseUrl}/api/config`));
    },

    async pushRegister(username, token, platform) {
        return handleResponse(await fetch(`${apiBaseUrl}/api/push/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, token, platform })
        }));
    },

    async pushUnregister(username, token) {
        return handleResponse(await fetch(`${apiBaseUrl}/api/push/unregister`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, token })
        }));
    }
};
