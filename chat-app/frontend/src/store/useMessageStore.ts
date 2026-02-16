import { create } from 'zustand';
import { Message } from '../types';

interface MessageState {
  messagesByChannel: Record<number, Message[]>;
  oldestMessageTimestamp: Record<number, string | number | null>;
  hasMoreMessages: Record<number, boolean>;
  hasMoreNewer: Record<number, boolean>;
  lastReadMessageId: Record<number, number>;
  isLoadingMore: boolean;

  setMessages: (channelId: number, messages: Message[]) => void;
  prependMessages: (channelId: number, messages: Message[], hasMore: boolean) => void;
  appendMessages: (channelId: number, messages: Message[], hasMore: boolean) => void;
  appendMessage: (channelId: number, message: Message) => void;
  updateMessage: (channelId: number, messageId: number, update: Partial<Message>) => void;
  deleteMessage: (channelId: number, messageId: number) => void;
  setLoadingMore: (loading: boolean) => void;
  setHasMoreNewer: (channelId: number, hasMore: boolean) => void;
  setLastReadMessageId: (channelId: number, messageId: number) => void;
  setOldestTimestamp: (channelId: number, timestamp: string | number | null) => void;
}

export const useMessageStore = create<MessageState>((set) => ({
  messagesByChannel: {},
  oldestMessageTimestamp: {},
  hasMoreMessages: {},
  hasMoreNewer: {},
  lastReadMessageId: {},
  isLoadingMore: false,

  setMessages: (channelId, messages) => set((state) => ({
    messagesByChannel: { ...state.messagesByChannel, [channelId]: messages },
    oldestMessageTimestamp: { 
      ...state.oldestMessageTimestamp, 
      [channelId]: messages.length > 0 ? messages[0].timestamp : null 
    },
    // When setting fresh, assume no newer unless context-load says otherwise
    hasMoreNewer: { ...state.hasMoreNewer, [channelId]: false }
  })),

  prependMessages: (channelId, messages, hasMore) => set((state) => {
    const existing = state.messagesByChannel[channelId] || [];
    const updated = [...messages, ...existing];
    return {
      messagesByChannel: { ...state.messagesByChannel, [channelId]: updated },
      oldestMessageTimestamp: { 
        ...state.oldestMessageTimestamp, 
        [channelId]: updated.length > 0 ? updated[0].timestamp : null 
      },
      hasMoreMessages: { ...state.hasMoreMessages, [channelId]: hasMore },
    };
  }),

  appendMessages: (channelId, messages, hasMore) => set((state) => {
    const existing = state.messagesByChannel[channelId] || [];
    // Only append if they aren't already there
    const newMessages = messages.filter(m => !existing.some(em => em.id === m.id));
    const updated = [...existing, ...newMessages];
    return {
      messagesByChannel: { ...state.messagesByChannel, [channelId]: updated },
      hasMoreNewer: { ...state.hasMoreNewer, [channelId]: hasMore }
    };
  }),

  appendMessage: (channelId, message) => set((state) => {
    const existing = state.messagesByChannel[channelId] || [];
    // Prevent duplicates
    if (existing.some(m => m.id === message.id)) return state;
    // Don't append if we are in a historical view (gap in messages)
    if (state.hasMoreNewer[channelId]) return state;
    
    return {
      messagesByChannel: { ...state.messagesByChannel, [channelId]: [...existing, message] }
    };
  }),

  updateMessage: (channelId, messageId, update) => set((state) => {
    const existing = state.messagesByChannel[channelId] || [];
    const updated = existing.map(m => m.id === messageId ? { ...m, ...update } : m);
    return {
      messagesByChannel: { ...state.messagesByChannel, [channelId]: updated }
    };
  }),

  deleteMessage: (channelId, messageId) => set((state) => ({
    messagesByChannel: { 
      ...state.messagesByChannel, 
      [channelId]: (state.messagesByChannel[channelId] || []).filter(m => m.id !== messageId) 
    }
  })),

  setLoadingMore: (loading) => set({ isLoadingMore: loading }),

  setHasMoreNewer: (channelId, hasMore) => set((state) => ({
    hasMoreNewer: { ...state.hasMoreNewer, [channelId]: hasMore }
  })),

  setLastReadMessageId: (channelId, messageId) => set((state) => ({
    lastReadMessageId: { ...state.lastReadMessageId, [channelId]: messageId }
  })),
  
  setOldestTimestamp: (channelId, timestamp) => set((state) => ({
    oldestMessageTimestamp: { ...state.oldestMessageTimestamp, [channelId]: timestamp }
  })),
}));
