import { useEffect, useRef, useState } from 'react';
import { useChatStore } from '@/store/useChatStore';
import { useMessageStore } from '@/store/useMessageStore';
import { useUIStore } from '@/store/useUIStore';
import { MessageItem } from './MessageItem';
import { socketClient } from '@/lib/socket';
import { ChevronDown, ArrowUp } from 'lucide-react';
import { clsx } from 'clsx';

export const MessageList = () => {
  const currentChannelId = useChatStore((state) => state.currentChannelId);
  const { 
    messagesByChannel, oldestMessageTimestamp, hasMoreMessages, isLoadingMore, 
    setLoadingMore, lastReadMessageId, hasMoreNewer 
  } = useMessageStore();
  const { isEmojiKeyboardOpen, setIsEmojiKeyboardOpen, searchTargetId, setSearchTargetId } = useUIStore();
  
  const containerRef = useRef<HTMLDivElement>(null);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [showUnreadBanner, setShowUnreadBanner] = useState(false);

  const prevHeightRef = useRef<number>(0);
  const isUserScrolling = useRef(false);

  const messages = messagesByChannel[currentChannelId] || [];
  const oldestTimestamp = oldestMessageTimestamp[currentChannelId];
  const hasMore = hasMoreMessages[currentChannelId];
  const lastReadId = lastReadMessageId[currentChannelId] || 0;
  const isViewingHistory = !!hasMoreNewer[currentChannelId];

  const isInitialLoad = useRef(true);

  // 1. Initial Load / Channel Switch
  useEffect(() => {
    isInitialLoad.current = true;
    isUserScrolling.current = false;
    setShowUnreadBanner(false);
    if (messages.length === 0) {
      socketClient.send({ type: 'load_history', limit: 50 });
    }
  }, [currentChannelId]);

  // 1.1 Mark as read & Banner logic
  useEffect(() => {
    if (messages.length > 0 && !isViewingHistory) {
      const maxId = Math.max(...messages.map(m => m.id));
      
      const hasUnread = lastReadId > 0 && messages.some(m => m.id > lastReadId);
      
      if (hasUnread && isInitialLoad.current) {
        setShowUnreadBanner(true);
      }

      if (!isInitialLoad.current && !showUnreadBanner) {
        const container = containerRef.current;
        if (container) {
          const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
          if (isNearBottom) {
            socketClient.send({ type: 'mark_read', messageId: maxId });
          }
        }
      }
    }
  }, [currentChannelId, messages.length, lastReadId, isViewingHistory]);

  // 2. Scroll Anchoring (Maintains bottom position on new messages)
  useEffect(() => {
    const container = containerRef.current;
    if (!container || isViewingHistory) return;

    if (isInitialLoad.current && messages.length > 0) {
      const unreadDivider = container.querySelector('#unread-divider');
      if (unreadDivider) {
        unreadDivider.scrollIntoView({ block: 'center' });
      } else {
        if (!searchTargetId) {
          container.scrollTop = container.scrollHeight;
        }
      }
      isInitialLoad.current = false;
      return;
    }

    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 200;
    if (isNearBottom && !searchTargetId) {
      container.scrollTop = container.scrollHeight;
    }
  }, [messages, searchTargetId, isViewingHistory]);

  // 3. Robust Scroll preservation
  useEffect(() => {
    const container = containerRef.current;
    if (!container || window.innerWidth >= 1024) return;

    let lastH = container.clientHeight;
    let lastSH = container.scrollHeight;

    const observer = new ResizeObserver(() => {
      const newH = container.clientHeight;
      const newSH = container.scrollHeight;
      
      if (lastH > 0 && newH !== lastH) {
        const wasAtBottom = lastSH - container.scrollTop - lastH < 10;
        
        if (wasAtBottom && !isViewingHistory) {
          container.scrollTop = newSH - newH;
        } else {
          container.scrollTop = container.scrollTop + (lastH - newH);
        }
      }
      
      lastH = newH;
      lastSH = newSH;
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, [isViewingHistory]); 


  // 4. Handle Scroll Events (Pagination & UI Helpers)
  const handleScroll = () => {
    const container = containerRef.current;
    if (!container) return;

    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 200;
    setShowScrollBottom(!isNearBottom);

    // Auto-dismiss unread banner ONLY if it was a user-initiated scroll to bottom
    if (isNearBottom && showUnreadBanner && isUserScrolling.current) {
      setShowUnreadBanner(false);
      const maxId = Math.max(...messages.map(m => m.id));
      socketClient.send({ type: 'mark_read', messageId: maxId });
    }

    // Auto-load older messages
    if (container.scrollTop < 100 && hasMore && !isLoadingMore) {
      setLoadingMore(true);
      prevHeightRef.current = container.scrollHeight;
      socketClient.send({ 
        type: 'load_history', 
        before: oldestTimestamp, 
        limit: 25 
      });
    }

    // Auto-load newer messages if viewing history
    if (isViewingHistory && isNearBottom && !isLoadingMore) {
      setLoadingMore(true);
      const latestMsg = messages[messages.length - 1];
      socketClient.send({
        type: 'load_history',
        after: latestMsg.timestamp,
        limit: 25
      });
    }
  };

  // 5. Restore scroll position after loading older messages
  useEffect(() => {
    if (!isLoadingMore && prevHeightRef.current > 0 && containerRef.current) {
      const diff = containerRef.current.scrollHeight - prevHeightRef.current;
      containerRef.current.scrollTop = diff;
      prevHeightRef.current = 0;
    }
  }, [isLoadingMore, messages]);

  // 6. Handle search jump targets
  useEffect(() => {
    if (!searchTargetId) return;

    if (messages.length > 0) {
      const exists = messages.some(m => m.id === searchTargetId);
      
      if (exists) {
        isUserScrolling.current = false;
        handleScrollToMessage(searchTargetId);
        setSearchTargetId(null);
      } else if (!isLoadingMore) {
        // REQUEST CONTEXT JUMP instead of sequential loading
        setLoadingMore(true);
        socketClient.send({ 
          type: 'load_history', 
          aroundId: searchTargetId 
        });
      }
    }
  }, [messages, searchTargetId, isLoadingMore]);

  const scrollToBottom = () => {
    if (!containerRef.current) return;
    if (isViewingHistory) {
      // If in history, just reload fresh to get back to live view
      socketClient.send({ type: 'load_history', limit: 50 });
      return;
    }
    isUserScrolling.current = true; // Manual jump triggers dismissal
    containerRef.current.scrollTo({ top: containerRef.current.scrollHeight, behavior: 'smooth' });
  };

  const handleJumpToUnread = () => {
    const divider = containerRef.current?.querySelector('#unread-divider');
    if (divider) {
      isUserScrolling.current = true; // Click is user interaction
      divider.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const handleScrollToMessage = (id: number) => {
    const el = document.querySelector(`[data-message-id="${id}"]`);
    if (el) {
      isUserScrolling.current = false;
      el.scrollIntoView({ behavior: 'auto', block: 'center' });
      el.classList.add('bg-accord-mention-bg');
      setTimeout(() => el.classList.remove('bg-accord-mention-bg'), 3000);
    }
  };

  const handleContainerClick = () => {
    if (window.innerWidth < 1024 && isEmojiKeyboardOpen) {
      setIsEmojiKeyboardOpen(false);
    }
  };

  const handleInteraction = () => {
    isUserScrolling.current = true;
  };

  let unreadDividerRendered = false;

  return (
    <div className="flex-1 overflow-hidden relative">
      {/* Unread Banner */}
      <div 
        onClick={handleJumpToUnread}
        className={clsx(
          "absolute top-2 left-4 right-4 bg-accord-blurple/90 backdrop-blur hover:bg-accord-blurple text-white px-4 py-2 rounded-md shadow-lg cursor-pointer flex items-center justify-between z-40 transition-all duration-300 transform",
          showUnreadBanner ? "translate-y-0 opacity-100" : "-translate-y-full opacity-0 pointer-events-none"
        )}
      >
        <div className="flex items-center">
          <ArrowUp className="w-4 h-4 mr-2 animate-bounce" />
          <span className="font-semibold text-sm">Unread Messages</span>
        </div>
        <span className="text-xs bg-white/20 px-2 py-0.5 rounded">Jump</span>
      </div>

      <div 
        ref={containerRef}
        id="messages-container"
        onScroll={handleScroll}
        onClick={handleContainerClick}
        onWheel={handleInteraction}
        onTouchStart={handleInteraction}
        className="h-full overflow-y-auto overflow-x-hidden custom-scrollbar flex flex-col px-4 pt-4 pb-4"
        style={{ overflowAnchor: 'auto' }}
      >
        {messages.length === 0 && !isLoadingMore ? (
          <div className="mt-auto mb-6 text-center text-accord-text-muted">
            This is the start of the conversation.
          </div>
        ) : (
          <div className="mt-auto">
            {isLoadingMore && (
              <div className="text-center py-2 text-accord-text-muted text-sm italic">
                Loading older messages...
              </div>
            )}
            {messages.map((msg, index) => {
              const prevMsg = messages[index - 1];
              const isGrouped = prevMsg && prevMsg.username === msg.username && !msg.reply_to && (index % 10 !== 0);
              
              const showDivider = !unreadDividerRendered && lastReadId > 0 && msg.id > lastReadId;
              if (showDivider) unreadDividerRendered = true;

              return (
                <div key={msg.id}>
                  {showDivider && (
                    <div id="unread-divider" className="flex items-center my-4">
                      <div className="flex-grow h-[1px] bg-accord-red opacity-50" />
                      <span className="px-2 text-xs font-bold text-accord-red uppercase">New Messages</span>
                      <div className="flex-grow h-[1px] bg-accord-red opacity-50" />
                    </div>
                  )}
                  <MessageItem 
                    message={msg} 
                    isGrouped={!!isGrouped && !showDivider} 
                    onScrollToMessage={handleScrollToMessage}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Scroll to Bottom Button */}
      <button 
        onClick={scrollToBottom}
        className={clsx(
          "absolute bottom-4 right-6 bg-accord-dark-300 hover:bg-accord-dark-200 text-accord-text-muted hover:text-accord-text-normal p-2.5 rounded-full shadow-lg border border-accord-dark-100 transition-all duration-200 z-40",
          showScrollBottom ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2 pointer-events-none"
        )}
      >
        <ChevronDown className="w-5 h-5" />
      </button>
    </div>
  );
};
