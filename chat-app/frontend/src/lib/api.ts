import axios from 'axios';
import { apiBaseUrl } from './config';
import { 
  User, Channel, Message, CustomEmoji, NotificationSetting 
} from '../types';

const api = axios.create({
  baseURL: apiBaseUrl,
  withCredentials: true,
});

// Helper to handle responses
api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const message = error.response?.data || error.message;
    if (error.response?.status === 401) {
      // Handle unauthorized (optional: trigger logout)
    }
    return Promise.reject(new Error(message));
  }
);

export const apiClient = {
  // Auth
  login: (username: string, password: string): Promise<{
    username: string;
    displayName: string;
    avatarKey?: string;
    token?: string;
  }> => api.post('/api/auth/login', { username, password }),

  register: (username: string, password: string): Promise<{
    recoveryKey?: string;
    token?: string;
  }> => api.post('/api/auth/register', { username, password }),

  logout: () => api.post('/api/auth/logout'),

  resetPassword: (username: string, recoveryKey: string, newPassword: string) => 
    api.post('/api/auth/reset-password', { username, recoveryKey, newPassword }),

  // Channels & DMs
  fetchChannels: (): Promise<Channel[]> => api.get('/api/channels'),

  fetchDMs: (): Promise<Channel[]> => 
    api.get('/api/dms'),

  createChannel: (name: string, kind: 'text' | 'voice' = 'text'): Promise<Channel> => 
    api.post('/api/channels', { name, kind }),

  deleteChannel: (channelId: number) => api.delete(`/api/channels/${channelId}`),

  startDM: (targetUsername: string): Promise<{ id: number }> => 
    api.post('/api/dm', { targetUsername }),

  // Users & Profile
  fetchRegisteredUsers: (): Promise<User[]> => api.get(`/api/users/list?t=${Date.now()}`),

  updateProfile: (profileData: {
    displayName: string;
    avatarImage?: string | null;
    generateNewRecoveryKey?: boolean;
  }): Promise<{ avatarKey?: string; newRecoveryKey?: string }> => 
    api.post('/api/user/profile', profileData),

  // Emojis
  fetchEmojis: (): Promise<CustomEmoji[]> => api.get('/api/emojis'),

  uploadEmoji: (emojiData: { name: string; image: string }) => 
    api.post('/api/emojis', emojiData),

  // Notifications
  fetchNotificationSettings: (): Promise<NotificationSetting[]> => 
    api.get('/api/notifications/settings'),

  updateNotificationSettings: (channelId: number, level: string) => 
    api.post('/api/notifications/settings', { channelId, level }),

  // Search
  searchMessages: (searchParams: {
    query?: string;
    username?: string;
    channelId?: string | number;
    startDate?: string;
    endDate?: string;
    offset?: number;
  }): Promise<{ results: Message[]; hasMore: boolean; total: number }> => 
    api.post('/api/search', searchParams),

  // File Upload & Deduplication
  checkFileHash: (hash: string): Promise<{ exists: boolean; key: string }> => 
    api.get(`/api/upload/check?hash=${hash}`),

  uploadFile: (
    file: File, 
    onProgress?: (percent: number) => void
  ): Promise<{
    name: string;
    type: string;
    size: number;
    key: string;
  }> => {
    const formData = new FormData();
    formData.append('file', file);

    return api.post('/api/upload', formData, {
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onProgress(percentCompleted);
        }
      }
    });
  },

  // PWA & Push
  getAppConfig: () => api.get('/api/config'),

  pushRegister: (token: string, platform: string) => 
    api.post('/api/push/register', { token, platform }),

  pushUnregister: (token: string) => 
    api.post('/api/push/unregister', { token })
};
