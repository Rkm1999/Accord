import React from 'react';
import { motion } from 'framer-motion';
import { Download, Reply, Edit2, Copy, Trash2, Smile } from 'lucide-react';
import { useUIStore } from '@/store/useUIStore';
import { useAuthStore } from '@/store/useAuthStore';
import { Message } from '@/types';
import { socketClient } from '@/lib/socket';
import { downloadFile } from '@/utils/downloader';
import { apiBaseUrl } from '@/lib/config';

export const MobileActionSheet = ({ message, onClose }: { message: Message, onClose: () => void }) => {
  const { username: currentUsername } = useAuthStore();
  const { setReplyingTo, setEditingMessageId, openModal } = useUIStore();

  const isOwn = message.username === currentUsername;

  const handleAction = (action: string) => {
    onClose();
    switch (action) {
      case 'reply': setReplyingTo(message); break;
      case 'react': openModal('emojiPicker', message.id); break;
      case 'edit': setEditingMessageId(message.id); break;
      case 'copy': navigator.clipboard.writeText(message.message); break;
      case 'delete': 
        if (confirm('Delete message?')) socketClient.send({ type: 'delete', messageId: message.id });
        break;
      case 'download':
        if (message.fileAttachment) {
          const url = `${apiBaseUrl}/api/file/${message.fileAttachment.key}`;
          downloadFile(url, message.fileAttachment.name);
        }
        break;
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-[150] flex flex-col justify-end" onClick={onClose}>
      <motion.div 
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="bg-accord-dark-400 rounded-t-2xl p-4 w-full shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-12 h-1.5 bg-accord-dark-100 rounded-full mx-auto mb-6" />
        
        <div className="space-y-1">
          {message.fileAttachment && (
            <ActionRow icon={<Download />} label="Download File" onClick={() => handleAction('download')} />
          )}
          <ActionRow icon={<Smile />} label="Add Reaction" onClick={() => handleAction('react')} />
          <ActionRow icon={<Reply />} label="Reply" onClick={() => handleAction('reply')} />
          {isOwn && <ActionRow icon={<Edit2 />} label="Edit Message" onClick={() => handleAction('edit')} />}
          <ActionRow icon={<Copy />} label="Copy Text" onClick={() => handleAction('copy')} />
          {isOwn && <ActionRow icon={<Trash2 className="text-accord-red" />} label="Delete Message" onClick={() => handleAction('delete')} className="text-accord-red" />}
        </div>
        
        <div className="h-6" />
      </motion.div>
    </div>
  );
};

const ActionRow = ({ icon, label, onClick, className }: any) => (
  <button 
    onClick={onClick}
    className={`w-full flex items-center gap-3 p-4 hover:bg-accord-dark-100 rounded-xl text-accord-text-normal font-semibold transition-colors active:bg-accord-dark-200 ${className}`}
  >
    {React.cloneElement(icon, { className: "w-6 h-6" })}
    {label}
  </button>
);
