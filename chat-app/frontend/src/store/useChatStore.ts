import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Channel, CustomEmoji, NotificationSetting, User } from '../types';

interface ChatState {
  currentChannelId: number;
  channels: Channel[];
  dms: Channel[];
  allUsers: User[];
  customEmojis: CustomEmoji[];
  notificationSettings: NotificationSetting[];
  unreadChannels: number[];
  onlineUsernames: string[];
  typingUsers: string[];

  setCurrentChannelId: (id: number) => void;
  setChannels: (channels: Channel[]) => void;
  setDMs: (dms: Channel[]) => void;
  setAllUsers: (users: User[]) => void;
  setCustomEmojis: (emojis: CustomEmoji[]) => void;
  setNotificationSettings: (settings: NotificationSetting[]) => void;
  markChannelUnread: (channelId: number) => void;
  clearChannelUnread: (channelId: number) => void;
  setOnlineUsernames: (usernames: string[]) => void;
  setTypingUsers: (usernames: string[]) => void;
}

export const useChatStore = create<ChatState>()(
  persist(
    (set) => ({
      currentChannelId: 1,
      channels: [],
      dms: [],
      allUsers: [],
      customEmojis: [],
      notificationSettings: [],
      unreadChannels: [],
      onlineUsernames: [],
      typingUsers: [],

      setCurrentChannelId: (id) => set({ currentChannelId: id }),
      setChannels: (channels) => set({ channels }),
      setDMs: (dms) => set({ dms }),
      setAllUsers: (users) => set({ allUsers: users }),
      setCustomEmojis: (emojis) => set({ customEmojis: emojis }),
      setNotificationSettings: (settings) => set({ notificationSettings: settings }),
      
      markChannelUnread: (channelId) => set((state) => ({
        unreadChannels: state.unreadChannels.includes(channelId) 
          ? state.unreadChannels 
          : [...state.unreadChannels, channelId]
      })),
      
      clearChannelUnread: (channelId) => set((state) => ({
        unreadChannels: state.unreadChannels.filter(id => id !== channelId)
      })),

      setOnlineUsernames: (usernames) => set({ onlineUsernames: usernames }),
      setTypingUsers: (usernames) => set({ typingUsers: usernames }),
    }),
    {
      name: 'accord-chat',
      partialize: (state) => ({ 
        currentChannelId: state.currentChannelId,
        unreadChannels: state.unreadChannels 
      }),
    }
  )
);
