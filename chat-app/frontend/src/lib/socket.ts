import { getWsUrl } from './config';
import { useAuthStore } from '../store/useAuthStore';
import { useChatStore } from '../store/useChatStore';
import { useMessageStore } from '../store/useMessageStore';

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

    const wsUrl = getWsUrl(username, channelId);
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
        if (data.isContext) {
          // Context jump: overwrite current state for this channel
          messageStore.setMessages(chatStore.currentChannelId, data.messages);
          messageStore.prependMessages(chatStore.currentChannelId, [], data.hasMore); // Set hasMore older
          messageStore.setHasMoreNewer(chatStore.currentChannelId, !!data.hasMoreAfter);
        } else if (data.before) {
          messageStore.prependMessages(chatStore.currentChannelId, data.messages, data.hasMore);
        } else if (data.after) {
          messageStore.appendMessages(chatStore.currentChannelId, data.messages, !!data.hasMoreAfter);
        } else {
          messageStore.setMessages(chatStore.currentChannelId, data.messages);
          // Set initial hasMore
          messageStore.prependMessages(chatStore.currentChannelId, [], data.hasMore);
          // Store last read ID for unread logic
          if (data.lastReadMessageId) {
            messageStore.setLastReadMessageId(chatStore.currentChannelId, data.lastReadMessageId);
          }
        }
        messageStore.setLoadingMore(false);
        break;


      case 'chat':
        if (data.channelId !== chatStore.currentChannelId) {
          chatStore.markChannelUnread(data.channelId);
        }
        messageStore.appendMessage(data.channelId, data);
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
