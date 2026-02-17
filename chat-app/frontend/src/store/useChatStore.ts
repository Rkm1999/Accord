import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Channel, CustomEmoji, NotificationSetting, User } from '../types';

interface ChatState {
  currentChannelId: number;
  activeVoiceChannelId: number | null;
  channels: Channel[];
  dms: Channel[];
  allUsers: User[];
  customEmojis: CustomEmoji[];
  notificationSettings: NotificationSetting[];
  unreadChannels: number[];
  onlineUsernames: string[];
  typingUsers: string[];
  speakingUsernames: string[];
  videoOffUsernames: string[];
  voiceChannelOccupants: Record<number, string[]>;

  setCurrentChannelId: (id: number) => void;
  setActiveVoiceChannelId: (id: number | null) => void;
  setChannels: (channels: Channel[]) => void;
  setDMs: (dms: Channel[]) => void;
  setAllUsers: (users: User[]) => void;
  setCustomEmojis: (emojis: CustomEmoji[]) => void;
  setNotificationSettings: (settings: NotificationSetting[]) => void;
  markChannelUnread: (channelId: number) => void;
  clearChannelUnread: (channelId: number) => void;
  setOnlineUsernames: (usernames: string[]) => void;
  setTypingUsers: (usernames: string[]) => void;
  setSpeakingUsernames: (usernames: string[]) => void;
  setVideoOffUsernames: (usernames: string[]) => void;
  setVoiceChannelOccupants: (occupants: Record<number, string[]>) => void;
  updateVoiceOccupants: (channelId: number, usernames: string[]) => void;
}

export const useChatStore = create<ChatState>()(
  persist(
    (set) => ({
      currentChannelId: 1,
      activeVoiceChannelId: null,
      channels: [],
      dms: [],
      allUsers: [],
      customEmojis: [],
      notificationSettings: [],
      unreadChannels: [],
      onlineUsernames: [],
      typingUsers: [],
      speakingUsernames: [],
      videoOffUsernames: [],
      voiceChannelOccupants: {},

      setCurrentChannelId: (id) => set({ currentChannelId: id }),
      setActiveVoiceChannelId: (id) => set({ activeVoiceChannelId: id }),
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
      setSpeakingUsernames: (usernames) => set({ speakingUsernames: usernames }),
      setVideoOffUsernames: (usernames) => set({ videoOffUsernames: usernames }),
      
      setVoiceChannelOccupants: (occupants) => set({ voiceChannelOccupants: occupants }),
      updateVoiceOccupants: (channelId, usernames) => set((state) => ({
        voiceChannelOccupants: { ...state.voiceChannelOccupants, [channelId]: usernames }
      })),
    }),
    {
      name: 'accord-chat',
      partialize: (state) => ({ 
        currentChannelId: state.currentChannelId,
        activeVoiceChannelId: state.activeVoiceChannelId,
        unreadChannels: state.unreadChannels 
      }),
    }
  )
);
