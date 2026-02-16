import { useUIStore } from '@/store/useUIStore';
import { useChatStore } from '@/store/useChatStore';
import { socketClient } from '@/lib/socket';
import { apiBaseUrl } from '@/lib/config';
import { Plus, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { clsx } from 'clsx';

const COMMON_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🔥", "🎉", "✅"];

export const EmojiPicker = ({ inline = false }: { inline?: boolean }) => {
  const { 
    activeModal, closeModal, pickerMessageId, openModal, emojiPickerPosition, 
    isEmojiKeyboardOpen, keyboardHeight 
  } = useUIStore();
  const { customEmojis } = useChatStore();
  const pickerRef = useRef<HTMLDivElement>(null);

  const isActive = inline ? isEmojiKeyboardOpen : (activeModal === 'emojiPicker');

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (inline) return;
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        closeModal();
      }
    };
    if (isActive && !inline) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isActive, inline, closeModal]);

  if (!isActive) return null;

  const isReaction = pickerMessageId !== null;
  const isDesktop = window.innerWidth >= 1024;

  const handleEmojiSelect = (emoji: string) => {
    if (isReaction) {
      socketClient.send({
        type: 'reaction',
        messageId: pickerMessageId,
        emoji: emoji
      });
      closeModal();
    } else {
      window.dispatchEvent(new CustomEvent('accord-input-emoji', { detail: emoji }));
      if (!inline) closeModal();
    }
  };

  // Keyboard Mode (Mobile Chat Input)
  if (inline && !isDesktop) {
    return (
      <div 
        ref={pickerRef}
        className={clsx(
          "bg-accord-dark-400 border-t border-accord-dark-100 flex flex-col overflow-hidden relative z-[50]",
          isEmojiKeyboardOpen ? "visible h-auto" : "invisible h-0"
        )}
        style={{ 
          height: isEmojiKeyboardOpen ? keyboardHeight : 0,
          transition: 'height 0.1s ease-out, visibility 0.1s'
        }}
      >
        <EmojiContent 
          customEmojis={customEmojis} 
          handleEmojiSelect={handleEmojiSelect} 
          onOpenUpload={() => openModal('emojiUpload')}
          onClose={closeModal}
          hideHeader
        />
      </div>
    );
  }

  if (inline) return null; // Don't render inline version on desktop

  // Desktop Tooltip / Popover
  if (isDesktop && emojiPickerPosition) {
    return (
      <div 
        ref={pickerRef}
        className="fixed z-[300] bg-accord-dark-400 rounded-xl shadow-2xl border border-accord-dark-100 flex flex-col w-[320px] max-h-[400px] animate-tooltip-slide-up"
        style={{ 
          top: emojiPickerPosition.top - 5, 
          left: emojiPickerPosition.left,
          transform: 'translateX(-50%) translateY(-100%)' 
        }}
      >
        <EmojiContent 
          customEmojis={customEmojis} 
          handleEmojiSelect={handleEmojiSelect} 
          onOpenUpload={() => openModal('emojiUpload')}
          onClose={closeModal}
        />
      </div>
    );
  }

  // Mobile Reaction Modal (Bottom Sheet)
  return (
    <div className="fixed inset-0 z-[160] flex flex-col justify-end bg-black/60 p-0" onClick={closeModal}>
      <div 
        ref={pickerRef}
        className="bg-accord-dark-400 rounded-t-2xl p-4 w-full shadow-2xl border-t border-accord-dark-100 flex flex-col max-h-[80vh] animate-slide-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-12 h-1.5 bg-accord-dark-100 rounded-full mx-auto mb-4" />
        <EmojiContent 
          customEmojis={customEmojis} 
          handleEmojiSelect={handleEmojiSelect} 
          onOpenUpload={() => openModal('emojiUpload')}
          onClose={closeModal}
        />
      </div>
    </div>
  );
};

const EmojiContent = ({ 
  customEmojis, handleEmojiSelect, onOpenUpload, onClose, hideHeader = false 
}: any) => (
  <div className="flex flex-col h-full px-4 pt-4">
    {!hideHeader && (
      <div className="flex items-center justify-between mb-4 mt-2">
        <h3 className="text-lg font-bold text-white px-1">Select Emoji</h3>
        <div className="flex items-center gap-2">
          <button 
            onClick={onOpenUpload}
            className="text-accord-text-muted hover:text-white p-1"
            title="Upload Custom Emoji"
          >
            <Plus className="w-5 h-5" />
          </button>
          <button onClick={onClose} className="text-accord-text-muted hover:text-white p-1">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>
    )}

    <div className="overflow-y-auto custom-scrollbar pr-1 pb-4 flex-1">
      <div className="grid grid-cols-6 lg:grid-cols-4 gap-2 mb-6">
        {COMMON_EMOJIS.map(emoji => (
          <button 
            key={emoji}
            onClick={() => handleEmojiSelect(emoji)}
            className="bg-accord-dark-600 hover:bg-accord-dark-100 aspect-square rounded-xl flex items-center justify-center text-2xl active:scale-125 transition-transform"
          >
            {emoji}
          </button>
        ))}
      </div>

      <h4 className="text-[11px] font-bold uppercase text-accord-text-muted mb-3 tracking-wider px-1">Custom Emojis</h4>
      
      <div className="grid grid-cols-4 gap-3">
        {customEmojis.map((emoji: any) => (
          <button 
            key={emoji.name}
            onClick={() => handleEmojiSelect(`:${emoji.name}:`)}
            className="bg-accord-dark-600 hover:bg-accord-dark-100 aspect-square rounded-xl flex items-center justify-center p-2 active:scale-125 transition-transform"
          >
            <img 
              src={`${apiBaseUrl}/api/file/${emoji.file_key}`} 
              className="w-full h-full object-contain pointer-events-none" 
              alt={emoji.name}
            />
          </button>
        ))}
        {customEmojis.length === 0 && (
          <div className="col-span-full text-center py-4 text-accord-text-muted text-xs">
            No custom emojis yet
          </div>
        )}
      </div>
    </div>
  </div>
);
