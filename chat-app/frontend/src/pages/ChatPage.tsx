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
import { useWebRTC } from '@/hooks/useWebRTC';
import { socketClient } from '@/lib/socket';
import { apiClient } from '@/lib/api';
import { initPushSync } from '@/lib/push';
import { VoiceRoomOverlay } from '@/components/chat/VoiceRoomOverlay';
import { GlobalVoiceManager } from '@/components/chat/GlobalVoiceManager';

import { useVoiceStore } from '@/store/useVoiceStore';

export const ChatPage = () => {
  useViewportFix();
  useMobileGestures();
  usePwaBadging();
  useWebRTC();

  const username = useAuthStore((state) => state.username);
  const currentChannelId = useChatStore((state) => state.currentChannelId);
  const activeVoiceChannelId = useVoiceStore((state) => state.activeVoiceChannelId);
  const { 
    channels, setChannels, setDMs, setAllUsers, setCustomEmojis, setNotificationSettings 
  } = useChatStore();
  
  const currentChannel = channels.find(c => c.id === currentChannelId);
  const isVoice = currentChannel?.kind === 'voice';

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

        // If there's an active voice channel, rejoin it on the backend
        if (activeVoiceChannelId) {
          socketClient.send({ type: 'join_voice', channelId: activeVoiceChannelId });
        }
      } catch (e) {
        console.error('Failed to load initial data:', e);
      }
    };

    loadInitialData();
  }, [username]); // Only depend on username

  useEffect(() => {
    if (username) {
      socketClient.connect(username, currentChannelId);
    }
  }, [username]); // Only connect once per user session

  return (
    <AppShell 
      leftSidebar={<ChannelSidebar />}
      rightSidebar={<MemberSidebar />}
    >
      <ChatHeader />
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative">
        {isVoice && <VoiceRoomOverlay />}
        <MessageList />
      </div>
      <ChatInput />
      <ModalProvider />
      <EmojiPicker />
      <GlobalVoiceManager />
      <PwaPrompt />
    </AppShell>
  );
};
