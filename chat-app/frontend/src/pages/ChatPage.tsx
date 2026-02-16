import { useEffect } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { ChannelSidebar } from '@/components/sidebar/ChannelSidebar';
import { MemberSidebar } from '@/components/sidebar/MemberSidebar';
import { ChatHeader } from '@/components/chat/ChatHeader';
import { MessageList } from '@/components/chat/MessageList';
import { ChatInput } from '@/components/chat/ChatInput';
import { ModalProvider } from '@/components/modals/ModalProvider';
import { EmojiPicker } from '@/components/modals/EmojiPicker';
import { PwaPrompt } from '@/components/PwaPrompt';
import { useAuthStore } from '@/store/useAuthStore';
import { useChatStore } from '@/store/useChatStore';
import { useViewportFix } from '@/hooks/useViewportFix';
import { useMobileGestures } from '@/hooks/useMobileGestures';
import { usePwaBadging } from '@/hooks/usePwaBadging';
import { socketClient } from '@/lib/socket';
import { apiClient } from '@/lib/api';
import { initPushSync } from '@/lib/push';

export const ChatPage = () => {
  useViewportFix();
  useMobileGestures();
  usePwaBadging();

  const username = useAuthStore((state) => state.username);
  const currentChannelId = useChatStore((state) => state.currentChannelId);
  const setChannels = useChatStore((state) => state.setChannels);
  const setDMs = useChatStore((state) => state.setDMs);
  const setAllUsers = useChatStore((state) => state.setAllUsers);
  const setCustomEmojis = useChatStore((state) => state.setCustomEmojis);
  const setNotificationSettings = useChatStore((state) => state.setNotificationSettings);

  useEffect(() => {
    if (!username) return;

    // Initial Data Load
    const loadInitialData = async () => {
      try {
        const [users, channels, dms, notifications, emojis] = await Promise.all([
          apiClient.fetchRegisteredUsers(),
          apiClient.fetchChannels(),
          apiClient.fetchDMs(username),
          apiClient.fetchNotificationSettings(username),
          apiClient.fetchEmojis()
        ]);

        setAllUsers(users);
        setChannels(channels);
        setDMs(dms);
        setNotificationSettings(notifications);
        setCustomEmojis(emojis);
        initPushSync();
      } catch (e) {
        console.error('Failed to load initial data:', e);
      }
    };

    loadInitialData();
    socketClient.connect(username, currentChannelId);
  }, [username, currentChannelId, setAllUsers, setChannels, setDMs, setNotificationSettings, setCustomEmojis]);

  return (
    <AppShell 
      leftSidebar={<ChannelSidebar />}
      rightSidebar={<MemberSidebar />}
    >
      <ChatHeader />
      <MessageList />
      <ChatInput />
      <ModalProvider />
      <EmojiPicker />
      <PwaPrompt />
    </AppShell>
  );
};
