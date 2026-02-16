import React, { useState, useEffect, useRef } from 'react';
import { motion, useMotionValue, useTransform, AnimatePresence, animate } from 'framer-motion';
import { Message } from '@/types';
import { parseMessage, extractYouTubeVideoId } from '@/utils/parser';
import { formatFileSize, getFileIcon, isEmojiOnly } from '@/utils/helpers';
import { apiBaseUrl } from '@/lib/config';
import { useAuthStore } from '@/store/useAuthStore';
import { useChatStore } from '@/store/useChatStore';
import { useUIStore } from '@/store/useUIStore';
import { useLongPress } from '@/hooks/useLongPress';
import { socketClient } from '@/lib/socket';
import { clsx } from 'clsx';
import { Smile, Reply, Edit2, Trash2, Download, EyeOff, CornerUpLeft } from 'lucide-react';
import { downloadFile } from '@/utils/downloader';
import { MobileActionSheet } from './MobileActionSheet';

interface Props {
  message: Message;
  isGrouped: boolean;
  onScrollToMessage: (id: number) => void;
}

export const MessageItem = ({ message, isGrouped, onScrollToMessage }: Props) => {
  const { username: currentUsername } = useAuthStore();
  const { customEmojis, allUsers } = useChatStore();
  const { openModal, setReplyingTo, editingMessageId, setEditingMessageId } = useUIStore();

  const [showMobileActions, setShowMobileActions] = useState(false);
  const { handlers: longPressHandlers, cancel: cancelLongPress } = useLongPress(() => {
    if (window.innerWidth < 1024) setShowMobileActions(true);
  }, { delay: 600 });

  const x = useMotionValue(0);
  const replyOpacity = useTransform(x, [-100, -50, 0], [1, 0.5, 0]);
  const replyScale = useTransform(x, [-100, -50, 0], [1, 0.8, 0.5]);

  const isEditing = editingMessageId === message.id;
  const isOwn = message.username === currentUsername;
  const displayName = message.displayName || message.display_name || message.username;
  const avatar_key = message.avatarKey || message.user_avatar;
  const avatarUrl = avatar_key
    ? `${apiBaseUrl}/api/file/${avatar_key}`
    : `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=random`;

  const time = new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const date = new Date(message.timestamp).toLocaleDateString();

  const isMentioned = message.mentions?.includes(currentUsername!) || 
                     message.message.includes(`@${currentUsername}`) ||
                     message.reply_username === currentUsername;

  const isOnlyEmoji = isEmojiOnly(message.message, customEmojis);

  const handleDelete = () => {
    if (confirm('Are you sure you want to delete this message?')) {
      socketClient.send({ type: 'delete', messageId: message.id });
    }
  };

  const handleDragEnd = (_: any, info: any) => {
    if (info.offset.x < -70) {
      setReplyingTo(message);
      if ('vibrate' in navigator) navigator.vibrate(50);
    }
    // Always animate back to origin
    animate(x, 0, { type: 'spring', damping: 20, stiffness: 300 });
  };

  return (
    <div className="relative overflow-hidden -mx-4 px-4" {...longPressHandlers}>
      <motion.div 
        style={{ opacity: replyOpacity, scale: replyScale }}
        className="absolute right-8 top-1/2 -translate-y-1/2 bg-accord-blurple p-2 rounded-full text-white z-0 pointer-events-none"
      >
        <Reply className="w-5 h-5" />
      </motion.div>

      <motion.div 
        drag="x"
        dragConstraints={{ left: -100, right: 0 }}
        dragElastic={0.1}
        onDragStart={() => cancelLongPress()}
        onDragEnd={handleDragEnd}
        style={{ x }}
        className={clsx(
          "group flex pr-4 hover:bg-[#2e3035] relative message-group transition-colors touch-pan-y bg-accord-dark-300 z-10",
          !isGrouped ? "mt-[17px]" : "mt-0",
          isMentioned && "bg-accord-mention-bg border-l-2 border-accord-mention-border"
        )}
        data-message-id={message.id}
      >
        {/* 1. Avatar / Time column */}
        {!isGrouped ? (
          <div 
            className="w-10 h-10 mr-4 mt-0.5 cursor-pointer hover:opacity-80 transition-opacity flex-shrink-0"
            onClick={() => openModal('userDetail', message.username)}
          >
            <img src={avatarUrl} className="w-10 h-10 rounded-full object-cover" />
          </div>
        ) : (
          <div className="w-10 mr-4 text-[10px] text-accord-text-muted opacity-0 group-hover:opacity-100 flex items-center justify-end select-none flex-shrink-0">
            {time}
          </div>
        )}

        {/* 2. Message Content column */}
        <div className="flex-1 min-w-0">
          {!isGrouped && (
            <div className="flex items-center mb-0.5">
              <span 
                className="font-medium mr-2 hover:underline cursor-pointer text-white"
                onClick={() => openModal('userDetail', message.username)}
              >
                {displayName}
              </span>
              <span className="text-xs text-accord-text-muted">{date} - {time}</span>
            </div>
          )}

          {!!message.reply_to && !isGrouped && (
            <div 
              className="flex items-center gap-1 mb-1 opacity-60 hover:opacity-100 cursor-pointer transition-opacity select-none"
              onClick={() => onScrollToMessage(message.reply_to!)}
            >
              <CornerUpLeft className="w-3 h-3 text-accord-text-muted mr-1" />
              <span className="text-xs font-semibold text-[#b5bac1] hover:underline">@{message.reply_username}</span>
              <span className="text-xs text-accord-text-muted truncate max-w-[300px]">{message.reply_message}</span>
            </div>
          )}

          {isEditing ? (
            <InlineEditor message={message} onCancel={() => setEditingMessageId(null)} />
          ) : (
            <>
                      <div className={clsx(
                        "text-accord-text-normal whitespace-pre-wrap leading-[1.375rem]",
                        isOnlyEmoji ? "text-[48px] leading-tight jumbo-emoji" : "text-[15px]"
                      )}>
                        {parseMessage(message.message, customEmojis, allUsers, currentUsername!)}
                        {!!message.is_edited && <span className="text-accord-text-muted text-[11px] ml-1">(edited)</span>}
                      </div>
              
                      {/* Link Previews */}
                      {(message.linkMetadata || message.link_url) && (
                        <LinkPreview 
                          metadata={message.linkMetadata || {
                            url: message.link_url,
                            title: message.link_title,
                            description: message.link_description,
                            image: message.link_image,
                            isSpoiler: !!message.is_spoiler
                          }} 
                        />
                      )}
              
                      {/* Attachments */}
                      {(message.fileAttachment || message.file_key) && (
                        <FileAttachment 
                          attachment={message.fileAttachment || {
                            name: message.file_name,
                            type: message.file_type,
                            size: message.file_size,
                            key: message.file_key,
                            isSpoiler: !!message.is_spoiler
                          }} 
                        />
                      )}
              
                      {/* Reactions */}
                      {message.reactions && message.reactions.length > 0 ? (
                        <div className="flex flex-wrap gap-1 mt-1">
                          <MessageReactions messageId={message.id} reactions={message.reactions} />
                        </div>
                      ) : null}
                          </>
          )}
        </div>

        {/* 3. Action Buttons (Desktop Hover) */}
        {!isEditing && (
          <div className="message-actions absolute right-4 -top-4 hidden lg:flex bg-accord-dark-300 shadow-xl border border-accord-dark-100 rounded p-0.5 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
            <ActionButton 
              icon={<Smile className="w-4 h-4" />} 
              onClick={(e) => {
                const { activeModal, closeModal, pickerMessageId } = useUIStore.getState();
                if (activeModal === 'emojiPicker' && pickerMessageId === message.id) {
                  closeModal();
                } else {
                  const rect = e.currentTarget.getBoundingClientRect();
                  openModal('emojiPicker', message.id, { top: rect.top - 10, left: rect.left + rect.width / 2 });
                }
              }} 
              title="Add Reaction" 
            />
            <ActionButton icon={<Reply className="w-4 h-4" />} onClick={() => setReplyingTo(message)} title="Reply" />

            {isOwn && (
              <>
                <ActionButton icon={<Edit2 className="w-4 h-4" />} onClick={() => setEditingMessageId(message.id)} title="Edit" />
                <ActionButton icon={<Trash2 className="w-4 h-4" />} onClick={handleDelete} title="Delete" className="text-accord-red" />
              </>
            )}
          </div>
        )}
      </motion.div>

      <AnimatePresence>
        {showMobileActions && (
          <MobileActionSheet message={message} onClose={() => setShowMobileActions(false)} />
        )}
      </AnimatePresence>
    </div>
  );
};

const InlineEditor = ({ message, onCancel }: { message: Message, onCancel: () => void }) => {
  const [text, setText] = useState(message.message);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(text.length, text.length);
    }
  }, []);

  const handleSave = () => {
    if (text.trim() && text !== message.message) {
      socketClient.send({ type: 'edit', messageId: message.id, newMessage: text.trim() });
    }
    onCancel();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onCancel();
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSave();
    }
  };

  return (
    <div className="mt-2">
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        className="w-full bg-accord-dark-600 text-accord-text-normal rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-accord-blurple resize-none min-h-[44px] mb-2"
      />
      <div className="flex gap-2 text-[12px]">
        <span className="text-accord-text-muted">
          escape to <button onClick={onCancel} className="text-accord-text-link hover:underline">cancel</button>
        </span>
        <span className="text-accord-text-muted">•</span>
        <span className="text-accord-text-muted">
          enter to <button onClick={handleSave} className="text-accord-text-link hover:underline font-bold">save</button>
        </span>
      </div>
    </div>
  );
};

const LinkPreview = ({ metadata }: { metadata: any }) => {
  const [revealed, setRevealed] = useState(!!metadata.isSpoiler ? false : true);
  const ytId = extractYouTubeVideoId(metadata.url);
  const [showYt, setShowYt] = useState(false);

  if (ytId) {
    return (
      <div className="mt-2 max-w-full relative inline-block group/yt">
        {!revealed && (
          <div 
            className="absolute inset-0 bg-black/60 backdrop-blur-3xl z-20 flex flex-col items-center justify-center cursor-pointer rounded-lg border border-accord-dark-100"
            onClick={() => setRevealed(true)}
          >
            <EyeOff className="w-8 h-8 text-white mb-2" />
            <span className="text-xs font-bold uppercase tracking-widest text-white">Spoiler</span>
          </div>
        )}
        
        {showYt ? (
          <div className="relative w-full aspect-video rounded-lg overflow-hidden bg-black max-w-[500px]">
            <iframe 
              src={`https://www.youtube.com/embed/${ytId}?autoplay=1`} 
              className="absolute top-0 left-0 w-full h-full" 
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
              allowFullScreen
            />
          </div>
        ) : (
          <div 
            className={clsx("relative group/yt-btn cursor-pointer rounded-lg overflow-hidden max-w-[400px]", !revealed && "blur-md")}
            onClick={() => revealed && setShowYt(true)}
          >
            <img src={metadata.image || `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`} className="w-full h-auto" />
            <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover/yt-btn:bg-black/40 transition-colors">
              <div className="w-16 h-11 bg-[#FF0000] rounded-lg flex items-center justify-center shadow-lg group-hover/yt-btn:scale-110 transition-transform">
                <div className="w-0 h-0 border-t-[8px] border-t-transparent border-l-[14px] border-l-white border-b-[8px] border-b-transparent ml-1" />
              </div>
            </div>
          </div>
        )}
        
        <a href={metadata.url} target="_blank" rel="noreferrer" className="block mt-2">
          {metadata.title && <div className="text-accord-text-link hover:underline font-medium">{metadata.title}</div>}
          {metadata.description && <div className="text-sm text-accord-text-muted mt-1">{metadata.description}</div>}
        </a>
      </div>
    );
  }

  return (
    <div className={clsx("mt-2 max-w-[500px] relative inline-block", !!metadata.isSpoiler && "spoiler-file-container")}>
      {!revealed && (
        <div 
          className="absolute inset-0 bg-black/60 backdrop-blur-3xl z-20 flex flex-col items-center justify-center cursor-pointer rounded-lg border border-accord-dark-100"
          onClick={() => setRevealed(true)}
        >
          <EyeOff className="w-8 h-8 text-white mb-2" />
          <span className="text-xs font-bold uppercase tracking-widest text-white">Spoiler</span>
        </div>
      )}
      <a 
        href={metadata.url} 
        target="_blank" 
        rel="noreferrer" 
        className={clsx(
          "block bg-accord-dark-400 p-3 rounded-lg border border-accord-dark-700 hover:bg-accord-dark-200 transition-colors",
          !revealed && "blur-md"
        )}
      >
        {metadata.image && <img src={metadata.image} className="rounded-lg max-w-full mb-2" />}
        {metadata.title && <div className="text-accord-text-link hover:underline font-medium">{metadata.title}</div>}
        {metadata.description && <div className="text-sm text-accord-text-muted mt-1 line-clamp-3">{metadata.description}</div>}
      </a>
    </div>
  );
};

const ActionButton = ({ icon, onClick, title, className }: { icon: any, onClick: (e: React.MouseEvent) => void, title: string, className?: string }) => (
  <button 
    onClick={onClick}
    title={title}
    className={clsx("p-1.5 hover:bg-accord-dark-100 rounded text-accord-text-muted hover:text-accord-text-normal transition-colors", className)}
  >
    {icon}
  </button>
);

const FileAttachment = ({ attachment }: { attachment: any }) => {
  const [revealed, setRevealed] = React.useState(!attachment.isSpoiler);
  const fileUrl = `${apiBaseUrl}/api/file/${attachment.key}`;

  if (attachment.type.startsWith('image/')) {
    return (
      <div className="mt-2 relative inline-block group/img">
        {!revealed && (
          <div 
            className="absolute inset-0 bg-black/60 backdrop-blur-3xl z-20 flex flex-col items-center justify-center cursor-pointer rounded-lg border border-accord-dark-100"
            onClick={() => setRevealed(true)}
          >
            <EyeOff className="w-8 h-8 text-white mb-2" />
            <span className="text-xs font-bold uppercase tracking-widest text-white">Spoiler</span>
          </div>
        )}
        <img 
          src={fileUrl} 
          className={clsx("rounded-lg max-w-[300px] max-h-[400px] object-contain cursor-zoom-in", !revealed && "blur-md")}
          onClick={() => revealed && window.dispatchEvent(new CustomEvent('accord-open-image', { detail: { url: fileUrl, name: attachment.name } }))}
        />
        {revealed && (
          <button className="absolute bottom-2 right-2 bg-accord-blurple text-white p-2 rounded-full shadow-lg opacity-0 lg:group-hover/img:opacity-100 transition-opacity hidden lg:flex z-30">
            <Download className="w-4 h-4" />
          </button>
        )}
      </div>
    );
  }

  if (attachment.type.startsWith('video/')) {
    return (
      <div className="mt-2 relative inline-block group/vid max-w-[400px] w-full">
        {!revealed && (
          <div 
            className="absolute inset-0 bg-black/60 backdrop-blur-3xl z-20 flex flex-col items-center justify-center cursor-pointer rounded-lg border border-accord-dark-100"
            onClick={() => setRevealed(true)}
          >
            <EyeOff className="w-8 h-8 text-white mb-2" />
            <span className="text-xs font-bold uppercase tracking-widest text-white">Spoiler</span>
          </div>
        )}
        <video 
          src={fileUrl} 
          controls 
          className={clsx("rounded-lg w-full bg-black/20", !revealed && "blur-md")}
        />
      </div>
    );
  }

  return (
    <div className="flex items-center mt-2 bg-accord-dark-400 hover:bg-accord-dark-200 p-3 rounded-lg transition-colors max-w-[400px] relative border border-accord-dark-700">
      <div className="text-2xl mr-3">{getFileIcon(attachment.type)}</div>
      <div className="flex-1 min-w-0">
        <div className="text-accord-text-normal font-medium truncate">{attachment.name}</div>
        <div className="text-xs text-accord-text-muted">{formatFileSize(attachment.size)}</div>
      </div>
      <button 
        className="ml-2 p-2 hover:bg-accord-dark-100 rounded transition-colors"
        onClick={() => downloadFile(fileUrl, attachment.name)}
      >
        <Download className="w-5 h-5 text-accord-text-muted" />
      </button>
    </div>
  );
};

const MessageReactions = ({ messageId, reactions }: { messageId: number, reactions: any[] }) => {
  const { username: currentUsername } = useAuthStore();
  const { customEmojis } = useChatStore();

  const grouped = reactions.reduce((acc: any, r: any) => {
    acc[r.emoji] = acc[r.emoji] || [];
    acc[r.emoji].push(r.username);
    return acc;
  }, {});

  const handleToggleReaction = (emoji: string) => {
    socketClient.send({ type: 'reaction', messageId, emoji });
  };

  return Object.entries(grouped).map(([emoji, users]: [string, any]) => {
    const hasReacted = users.includes(currentUsername);
    const isCustom = emoji.startsWith(':') && emoji.endsWith(':');
    let displayEmoji = <span>{emoji}</span>;

    if (isCustom) {
      const name = emoji.slice(1, -1);
      const customEmoji = customEmojis.find(e => e.name === name);
      if (customEmoji) {
        const url = `${apiBaseUrl}/api/file/${customEmoji.file_key}`;
        displayEmoji = <img src={url} className="w-4 h-4 inline-block" />;
      }
    }

    return (
      <div 
        key={emoji}
        className={clsx(
          "reaction-badge flex items-center bg-accord-dark-400 border rounded-[4px] px-1.5 py-0.5 cursor-pointer transition-all active:scale-95",
          hasReacted ? "border-accord-blurple bg-accord-blurple/10" : "border-transparent hover:border-accord-dark-100"
        )}
        onClick={() => handleToggleReaction(emoji)}
        title={users.join(', ')}
      >
        {displayEmoji}
        <span className={clsx("text-[12px] ml-1 font-bold", hasReacted ? "text-white" : "text-accord-text-muted")}>
          {users.length}
        </span>
      </div>
    );
  });
};
