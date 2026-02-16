import React, { useState, useRef, useEffect } from 'react';
import TextareaAutosize from 'react-textarea-autosize';
import { Smile, Paperclip, Send, X, CornerUpLeft, Bold, Italic, Strikethrough, Code, EyeOff } from 'lucide-react';
import { useChatStore } from '@/store/useChatStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useUIStore } from '@/store/useUIStore';
import { socketClient } from '@/lib/socket';
import { apiClient } from '@/lib/api';
import { clsx } from 'clsx';
import { getCaretCoordinates, getFileIcon } from '@/utils/helpers';
import { EmojiPicker } from '../modals/EmojiPicker';

interface StagedFile {
  file: File;
  preview: string | null;
  isSpoiler: boolean;
  progress: number;
}

export const ChatInput = () => {
  const { currentChannelId, allUsers } = useChatStore();
  const { username } = useAuthStore();
  const { 
    replyingTo, setReplyingTo, openModal, closeModal, activeModal,
    isEmojiKeyboardOpen, setIsEmojiKeyboardOpen 
  } = useUIStore();
  
  const [text, setText] = useState('');
  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const typingTimeoutRef = useRef<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Mention Autocomplete State
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);

  // Selection Tooltip State
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipPos, setTooltipPos] = useState({ top: 0, left: 0 });

  const isFocusingProgrammatically = useRef(false);

  useEffect(() => {
    const handleEmoji = (e: any) => {
      const emoji = e.detail;
      const el = textareaRef.current;
      if (!el) return;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const newText = text.slice(0, start) + emoji + text.slice(end);
      setText(newText);
      
      // Prevent onFocus from closing the keyboard
      isFocusingProgrammatically.current = true;
      
      // Focus and move cursor
      setTimeout(() => {
        el.focus();
        el.setSelectionRange(start + emoji.length, start + emoji.length);
        isFocusingProgrammatically.current = false;
      }, 0);
    };
    window.addEventListener('accord-input-emoji', handleEmoji);
    return () => window.removeEventListener('accord-input-emoji', handleEmoji);
  }, [text]);

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setText(value);
    
    if (!isTyping) {
      setIsTyping(true);
      socketClient.send({ type: 'typing', isTyping: true });
    }
    if (typingTimeoutRef.current) window.clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = window.setTimeout(() => {
      setIsTyping(false);
      socketClient.send({ type: 'typing', isTyping: false });
    }, 2000);

    const cursor = e.target.selectionStart;
    const before = value.slice(0, cursor);
    const lastAt = before.lastIndexOf('@');
    if (lastAt !== -1) {
      const query = before.slice(lastAt + 1);
      const charBeforeAt = before[lastAt - 1];
      if (!charBeforeAt || /\s/.test(charBeforeAt)) {
        setMentionQuery(query);
        return;
      }
    }
    setMentionQuery(null);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const newStaged = files.map(f => ({
      file: f,
      preview: f.type.startsWith('image/') ? URL.createObjectURL(f) : null,
      isSpoiler: false,
      progress: 0
    }));
    setStagedFiles([...stagedFiles, ...newStaged]);
    e.target.value = '';
  };

  const removeFile = (index: number) => {
    const file = stagedFiles[index];
    if (file.preview) URL.revokeObjectURL(file.preview);
    setStagedFiles(stagedFiles.filter((_, i) => i !== index));
  };

  const calculateHash = async (file: File) => {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!text.trim() && stagedFiles.length === 0) return;

    const currentText = text.trim();
    const currentReplyTo = replyingTo?.id;
    
    setText('');
    setReplyingTo(null);
    const filesToUpload = [...stagedFiles];
    setStagedFiles([]);

    // Close emoji keyboard on send
    if (isEmojiKeyboardOpen) {
      isFocusingProgrammatically.current = true;
      setIsEmojiKeyboardOpen(false);
      // Give it a moment to switch inputMode back to text before focusing
      setTimeout(() => {
        textareaRef.current?.focus();
        isFocusingProgrammatically.current = false;
      }, 50);
    }

    try {
      const uploadedFiles = [];
      for (const f of filesToUpload) {
        const hash = await calculateHash(f.file);
        const { exists, key } = await apiClient.checkFileHash(hash);
        
        let resultKey = key;
        if (!exists) {
          const res = await apiClient.uploadFile(f.file, username!);
          resultKey = res.key;
        }
        uploadedFiles.push({ ...f, key: resultKey });
      }

      if (uploadedFiles.length > 0) {
        uploadedFiles.forEach((f, idx) => {
          socketClient.send({
            type: 'chat',
            message: idx === 0 ? currentText : '',
            channelId: currentChannelId,
            replyTo: currentReplyTo,
            file: {
              name: f.file.name,
              type: f.file.type,
              size: f.file.size,
              key: f.key,
              isSpoiler: f.isSpoiler
            }
          });
        });
      } else {
        socketClient.send({
          type: 'chat',
          message: currentText,
          channelId: currentChannelId,
          replyTo: currentReplyTo
        });
      }
      
      // Always re-focus after successful send to keep keyboard open
      if (!isEmojiKeyboardOpen) {
        textareaRef.current?.focus();
      }
    } catch (err) {
      alert('Failed to send message or files.');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const applyMarkdown = (marker: string) => {
    const el = textareaRef.current;
    if (!el) return;

    const start = el.selectionStart;
    const end = el.selectionEnd;
    const val = text;

    if (start !== end) {
      const selectedText = val.substring(start, end);
      const markerLen = marker.length;
      let newText: string;
      let newStart: number;
      let newEnd: number;

      if (selectedText.startsWith(marker) && selectedText.endsWith(marker)) {
        newText = val.substring(0, start) + selectedText.substring(markerLen, selectedText.length - markerLen) + val.substring(end);
        newStart = start;
        newEnd = end - (markerLen * 2);
      } else {
        newText = val.substring(0, start) + marker + selectedText + marker + val.substring(end);
        newStart = start;
        newEnd = end + (markerLen * 2);
      }

      setText(newText);
      setShowTooltip(false);
      
      // Re-focus and restore selection
      setTimeout(() => {
        el.focus();
        el.setSelectionRange(newStart, newEnd);
      }, 0);
    }
  };

  useEffect(() => {
    const handleGlobalMouseUp = () => {
      // Small delay to allow button clicks to register before hiding
      setTimeout(() => {
        if (textareaRef.current?.selectionStart === textareaRef.current?.selectionEnd) {
          setShowTooltip(false);
        }
      }, 10);
    };
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, []);

  const handleSelect = () => {
    const el = textareaRef.current;
    if (!el) return;
    
    if (el.selectionStart !== el.selectionEnd) {
      const coords = getCaretCoordinates(el, el.selectionStart);
      const rect = el.getBoundingClientRect();
      
      // Calculate center point of the selection for better tooltip positioning
      const endCoords = getCaretCoordinates(el, el.selectionEnd);
      const centerX = (coords.left + endCoords.left) / 2;

      setTooltipPos({
        top: rect.top + coords.top - 50, // Position above the text
        left: rect.left + centerX
      });
      setShowTooltip(true);
    } else {
      setShowTooltip(false);
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items);
    const files = items
      .filter(item => item.kind === 'file')
      .map(item => item.getAsFile())
      .filter((f): f is File => f !== null);

    if (files.length > 0) {
      e.preventDefault();
      const newStaged = files.map(f => ({
        file: f,
        preview: f.type.startsWith('image/') ? URL.createObjectURL(f) : null,
        isSpoiler: false,
        progress: 0
      }));
      setStagedFiles([...stagedFiles, ...newStaged]);
    }
  };

  const toggleEmojiPicker = (e: React.MouseEvent) => {
    if (window.innerWidth < 1024) {
      if (isEmojiKeyboardOpen) {
        // Switch to native keyboard
        isFocusingProgrammatically.current = true;
        setIsEmojiKeyboardOpen(false);
        // Short timeout to allow height adjustment
        setTimeout(() => {
          if (textareaRef.current) {
            textareaRef.current.focus();
          }
          setTimeout(() => {
            isFocusingProgrammatically.current = false;
          }, 100);
        }, 10);
      } else {
        // Switch to emoji keyboard
        isFocusingProgrammatically.current = true;
        textareaRef.current?.blur();
        setIsEmojiKeyboardOpen(true);
        setTimeout(() => {
          isFocusingProgrammatically.current = false;
        }, 100);
      }
    } else {
      if (activeModal === 'emojiPicker') {
        closeModal();
      } else {
        const rect = e.currentTarget.getBoundingClientRect();
        openModal('emojiPicker', null, { top: rect.top - 10, left: rect.left + rect.width / 2 });
      }
    }
  };

  const handleInputFocus = () => {
    if (!isFocusingProgrammatically.current) {
      setIsEmojiKeyboardOpen(false);
    }
  };

  return (
    <div className="flex-shrink-0 relative">
      <div className="px-4 pb-6 bg-accord-dark-300 pt-2">
      {/* File Previews */}
      {stagedFiles.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {stagedFiles.map((f, i) => (
            <div key={i} className="relative group bg-accord-dark-400 p-2 rounded-lg border border-accord-dark-100 flex items-center gap-2">
              {f.preview ? (
                <img src={f.preview} className={clsx("w-16 h-16 rounded object-cover", f.isSpoiler && "blur-sm")} />
              ) : (
                <div className="w-16 h-16 bg-accord-dark-200 rounded flex items-center justify-center text-2xl">
                  {getFileIcon(f.file.type)}
                </div>
              )}
              <div className="flex flex-col gap-1">
                <button 
                  onClick={() => {
                    const newFiles = [...stagedFiles];
                    newFiles[i].isSpoiler = !newFiles[i].isSpoiler;
                    setStagedFiles(newFiles);
                  }}
                  className={clsx("p-1 rounded bg-accord-dark-500 hover:bg-accord-dark-100 transition-colors", f.isSpoiler ? "text-accord-yellow" : "text-accord-text-muted")}
                >
                  <EyeOff className="w-4 h-4" />
                </button>
                <button onClick={() => removeFile(i)} className="p-1 rounded bg-accord-dark-500 hover:bg-accord-red text-white transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Reply Banner */}
      {replyingTo && (
        <div className="mb-2 bg-accord-dark-500 rounded-lg px-3 py-2 flex items-center justify-between animate-slide-down">
          <div className="flex items-center flex-1 overflow-hidden text-sm">
            <CornerUpLeft className="w-4 h-4 text-accord-text-muted mr-2" />
            <span className="text-accord-text-muted mr-1">Replying to</span>
            <span className="font-bold text-white mr-2">@{replyingTo.username}</span>
            <span className="text-accord-text-muted truncate">{replyingTo.message}</span>
          </div>
          <button onClick={() => setReplyingTo(null)} className="text-accord-text-muted hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="bg-accord-dark-200 rounded-lg px-4 py-2.5 flex items-center relative">
        <input 
          type="file" 
          ref={fileInputRef} 
          onChange={handleFileSelect} 
          multiple 
          className="hidden" 
        />

        {/* Mention Autocomplete */}
        {mentionQuery !== null && (
          <div className="absolute bottom-full left-0 right-0 mb-2 bg-accord-dark-600 rounded-lg shadow-2xl border border-accord-dark-100 overflow-hidden max-h-60 overflow-y-auto custom-scrollbar z-50">
            {allUsers
              .filter(u => u.username.toLowerCase().includes(mentionQuery.toLowerCase()))
              .map((u) => (
                <div 
                  key={u.username}
                  className="flex items-center p-2 hover:bg-accord-dark-100 cursor-pointer transition-colors border-b border-accord-dark-100 last:border-0"
                  onClick={() => {
                    const el = textareaRef.current!;
                    const cursor = el.selectionStart;
                    const before = text.slice(0, cursor);
                    const lastAt = before.lastIndexOf('@');
                    const after = text.slice(cursor);
                    setText(text.slice(0, lastAt) + `@${u.username} ` + after);
                    setMentionQuery(null);
                    el.focus();
                  }}
                >
                  <div className="w-8 h-8 rounded-full bg-accord-blurple mr-3 flex items-center justify-center font-bold text-xs">
                    {u.username.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="font-bold text-white text-sm">{u.display_name || u.username}</div>
                    <div className="text-xs text-accord-text-muted">@{u.username}</div>
                  </div>
                </div>
              ))}
          </div>
        )}

        {/* Selection Tooltip */}
        {showTooltip && (
          <div 
            className="fixed bg-accord-dark-700 border border-accord-dark-100 rounded-lg p-1 flex items-center gap-0.5 shadow-2xl z-[100] whitespace-nowrap animate-tooltip-slide-up"
            style={{ 
              top: tooltipPos.top, 
              left: tooltipPos.left,
              transform: 'translateX(-50%)'
            }}
            onMouseDown={(e) => e.preventDefault()} // Prevent losing focus
          >
            <TooltipBtn icon={<Bold className="w-4 h-4" />} onClick={() => applyMarkdown('**')} />
            <TooltipBtn icon={<Italic className="w-4 h-4" />} onClick={() => applyMarkdown('*')} />
            <TooltipBtn icon={<Strikethrough className="w-4 h-4" />} onClick={() => applyMarkdown('~~')} />
            <TooltipBtn icon={<Code className="w-4 h-4" />} onClick={() => applyMarkdown('`')} />
            <div className="w-px h-4 bg-accord-dark-100 mx-1" />
            <button 
              onClick={() => applyMarkdown('||')}
              className="px-2 py-1 text-xs font-bold flex items-center gap-1 hover:bg-accord-dark-100 rounded text-accord-text-normal"
            >
              <EyeOff className="w-3.5 h-3.5" /> Spoiler
            </button>
          </div>
        )}

        {/* Emoji Button */}
        <button 
          type="button"
          onClick={toggleEmojiPicker}
          className={clsx(
            "text-accord-text-muted hover:text-white mr-3 transition-colors",
            isEmojiKeyboardOpen && "text-white"
          )}
        >
          <Smile className="w-6 h-6" />
        </button>

        {/* Input */}
        <form onSubmit={handleSubmit} className="flex-1 flex items-center">
          <TextareaAutosize
            ref={textareaRef}
            value={text}
            onChange={handleTextChange}
            onKeyDown={handleKeyDown}
            onSelect={handleSelect}
            onPaste={handlePaste}
            onFocus={handleInputFocus}
            placeholder="Message #general"
            maxRows={15}
            inputMode={isEmojiKeyboardOpen ? "none" : "text"}
            className="bg-transparent text-accord-text-normal w-full focus:outline-none placeholder-accord-text-muted resize-none py-1 leading-[1.375rem] custom-scrollbar"
          />
          
          <div className="flex items-center text-accord-text-muted ml-2">
            <button 
              type="button" 
              onClick={() => fileInputRef.current?.click()}
              className="p-1.5 hover:text-white"
            >
              <Paperclip className="w-5 h-5" />
            </button>
            <button 
              type="submit"
              onMouseDown={(e) => e.preventDefault()}
              className={clsx(
                "p-1.5 bg-accord-blurple text-white rounded-full transition-all ml-2 flex-shrink-0",
                (text.trim() || stagedFiles.length > 0) ? "scale-100 opacity-100" : "scale-0 opacity-0 pointer-events-none"
              )}
            >
              <Send className="w-4 h-4 ml-0.5" />
            </button>
          </div>
        </form>
      </div>
      </div>
      
      {/* Virtual Emoji Keyboard */}
      <EmojiPicker inline />
    </div>
  );
};

const TooltipBtn = ({ icon, onClick }: { icon: any, onClick?: () => void }) => (
  <button 
    onClick={onClick}
    className="p-1.5 hover:bg-accord-dark-100 rounded text-accord-text-normal"
  >
    {icon}
  </button>
);
