import { getWsUrl } from './config';
import { useAuthStore } from '../store/useAuthStore';
import { useChatStore } from '../store/useChatStore';
import { useMessageStore } from '../store/useMessageStore';
import { useVoiceStore } from '../store/useVoiceStore';

class SocketClient {
  private ws: WebSocket | null = null;
  private heartbeatInterval: number | null = null;
  private reconnectTimeout: number | null = null;
  private messageQueue: any[] = [];

  connect(username: string, channelId: number) {
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
    }

    const { token } = useAuthStore.getState();
    console.log(`Connecting to WS for user: ${username}, token present: ${!!token}`);
    let wsUrl = getWsUrl(username, channelId);
    if (token) {
      wsUrl += `&token=${encodeURIComponent(token)}`;
    }
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log('Connected to chat server');
      this.startHeartbeat();
      
      // Flush queue
      while (this.messageQueue.length > 0) {
        const data = this.messageQueue.shift();
        this.send(data);
      }
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.handleMessage(data);
      } catch (e) {
        console.error('Failed to parse WebSocket message:', e);
      }
    };

    this.ws.onclose = (event) => {
      console.log('Disconnected from chat server', event.code, event.reason);
      this.stopHeartbeat();
      
      // Auto-reconnect after 3 seconds
      if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = window.setTimeout(() => {
        const currentUsername = useAuthStore.getState().username;
        const currentChannelId = useChatStore.getState().currentChannelId;
        if (currentUsername) {
          this.connect(currentUsername, currentChannelId);
        }
      }, 3000);
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  }

  send(data: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    } else {
      console.log('Socket not ready, queuing message:', data.type);
      this.messageQueue.push(data);
    }
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatInterval = window.setInterval(() => {
      this.send({ type: 'heartbeat' });
    }, 20000);
  }

  private stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private handleMessage(data: any) {
    const chatStore = useChatStore.getState();
    const authStore = useAuthStore.getState();
    const messageStore = useMessageStore.getState();
    const voiceStore = useVoiceStore.getState();

    switch (data.type) {
      case 'connected':
        if (authStore.username) {
          chatStore.setOnlineUsernames([...new Set([...chatStore.onlineUsernames, authStore.username])]);
        }
        break;

      case 'online_list':
        chatStore.setOnlineUsernames(data.usernames);
        break;

      case 'presence':
        if (data.event === 'user_joined') {
          chatStore.setOnlineUsernames([...new Set([...chatStore.onlineUsernames, data.username])]);
        } else {
          chatStore.setOnlineUsernames(chatStore.onlineUsernames.filter(u => u !== data.username));
        }
        break;

      case 'typing':
        if (data.username === authStore.username) return;
        if (data.isTyping) {
          chatStore.setTypingUsers([...new Set([...chatStore.typingUsers, data.username])]);
        } else {
          chatStore.setTypingUsers(chatStore.typingUsers.filter(u => u !== data.username));
        }
        break;

      case 'history':
        const targetChannelId = data.channelId || chatStore.currentChannelId;
        if (data.isContext) {
          messageStore.setMessages(targetChannelId, data.messages);
          messageStore.prependMessages(targetChannelId, [], data.hasMore);
          messageStore.setHasMoreNewer(targetChannelId, !!data.hasMoreAfter);
        } else if (data.before) {
          messageStore.prependMessages(targetChannelId, data.messages, data.hasMore);
        } else if (data.after) {
          messageStore.appendMessages(targetChannelId, data.messages, !!data.hasMoreAfter);
        } else {
          messageStore.setMessages(targetChannelId, data.messages);
          messageStore.prependMessages(targetChannelId, [], data.hasMore);
          if (data.lastReadMessageId) {
            messageStore.setLastReadMessageId(targetChannelId, data.lastReadMessageId);
          }
        }
        messageStore.setLoadingMore(false);
        break;

      case 'chat':
        if (data.channelId !== chatStore.currentChannelId) {
          chatStore.markChannelUnread(data.channelId);
        }
        messageStore.appendMessage(data.channelId, data);

        // TTS Logic
        if (
          data.tts && 
          data.channelId === voiceStore.activeVoiceChannelId &&
          data.username !== authStore.username &&
          'speechSynthesis' in window
        ) {
          try {
            // Sanitize message: Replace URLs with "link"
            let cleanMessage = data.message.replace(/https?:\/\/[^\s]+/g, 'link');
            
            // Truncate if too long (max 200 chars for TTS)
            if (cleanMessage.length > 200) {
              cleanMessage = cleanMessage.substring(0, 200) + '... message truncated';
            }

            const utterance = new SpeechSynthesisUtterance(cleanMessage);
            utterance.lang = data.lang || 'en-US';
            
            // Voice selection logic
            const voices = window.speechSynthesis.getVoices();
            let matchedVoice: SpeechSynthesisVoice | undefined;
            const langCode = data.lang?.split('-')[0]; // e.g. 'ko'

            if (voiceStore.preferredVoiceName) {
              const preferred = voices.find(v => v.name === voiceStore.preferredVoiceName);
              // Only use the preferred voice if it matches the message language
              if (preferred && preferred.lang.startsWith(langCode)) {
                matchedVoice = preferred;
              }
            }

            if (!matchedVoice && data.lang) {
              // 1. Aggressive search for "Great" voices (Online/Natural/Neural)
              // These are the high-quality ones provided by Google/Microsoft/Apple
              const premiumKeywords = ['Google', 'Online', 'Natural', 'Enhanced', 'Neural', 'Siri'];
              
              matchedVoice = voices
                .filter(v => v.lang.startsWith(langCode))
                .sort((a, b) => {
                  // Score based on premium keywords
                  const aScore = premiumKeywords.reduce((acc, key) => acc + (a.name.includes(key) ? 1 : 0), 0);
                  const bScore = premiumKeywords.reduce((acc, key) => acc + (b.name.includes(key) ? 1 : 0), 0);
                  return bScore - aScore;
                })[0];
            }

            if (matchedVoice) {
              utterance.voice = matchedVoice;
              utterance.lang = matchedVoice.lang;
            }

            utterance.rate = 1.0;
            utterance.pitch = 1.0;
            
            // On some browsers, we need to cancel the current one to start a new one reliably
            // if it gets stuck, but let's just speak for now.
            window.speechSynthesis.speak(utterance);
          } catch (e) {
            console.error('TTS failed:', e);
          }
        }
        break;

      case 'edit':
        messageStore.updateMessage(chatStore.currentChannelId, data.messageId, { 
          message: data.newMessage,
          is_edited: true 
        });
        break;

      case 'delete':
        messageStore.deleteMessage(chatStore.currentChannelId, data.messageId);
        break;

      case 'reaction':
        messageStore.updateMessage(chatStore.currentChannelId, data.messageId, { 
          reactions: data.reactions 
        });
        break;

      case 'user_joined_voice':
        if (data.channelId === voiceStore.activeVoiceChannelId) {
          voiceStore.setParticipants([...new Set([...voiceStore.participants, data.username])]);
          window.dispatchEvent(new CustomEvent('rtc-user-joined', { detail: data.username }));
        }
        break;

      case 'user_left_voice':
        if (data.channelId === voiceStore.activeVoiceChannelId) {
          voiceStore.setParticipants(voiceStore.participants.filter(u => u !== data.username));
          window.dispatchEvent(new CustomEvent('rtc-user-left', { detail: data.username }));
        }
        break;

      case 'user_speaking_update':
        if (data.speaking) {
          chatStore.setSpeakingUsernames([...new Set([...chatStore.speakingUsernames, data.username])]);
        } else {
          chatStore.setSpeakingUsernames(chatStore.speakingUsernames.filter(u => u !== data.username));
        }

        // Also sync video status
        if (data.videoOn !== undefined) {
          if (data.videoOn) {
            chatStore.setVideoOffUsernames(chatStore.videoOffUsernames.filter(u => u !== data.username));
          } else {
            chatStore.setVideoOffUsernames([...new Set([...chatStore.videoOffUsernames, data.username])]);
          }
        }
        break;

      case 'user_video_update':
        if (data.videoOn) {
          chatStore.setVideoOffUsernames(chatStore.videoOffUsernames.filter(u => u !== data.username));
        } else {
          chatStore.setVideoOffUsernames([...new Set([...chatStore.videoOffUsernames, data.username])]);
        }
        break;

      case 'voice_room_members':
        if (data.channelId === voiceStore.activeVoiceChannelId) {
          voiceStore.setParticipants(data.members);
        }
        // Also sync the global map for the sidebar
        chatStore.updateVoiceOccupants(data.channelId, data.members);
        break;

      case 'rtc_signal':
        window.dispatchEvent(new CustomEvent('rtc-signal', { 
          detail: { from: data.fromUsername, signal: data.signalData } 
        }));
        break;

      case 'voice_occupants_update':
        chatStore.setVoiceChannelOccupants(data.occupants);
        break;

      case 'refresh_channels':
        window.dispatchEvent(new CustomEvent('accord-refresh-channels'));
        break;

      case 'refresh_users':
        window.dispatchEvent(new CustomEvent('accord-refresh-users'));
        break;
    }
  }
}

export const socketClient = new SocketClient();
