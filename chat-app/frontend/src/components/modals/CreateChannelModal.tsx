import React, { useState } from 'react';
import { Hash, Plus, X } from 'lucide-react';
import { useUIStore } from '@/store/useUIStore';
import { useChatStore } from '@/store/useChatStore';
import { useAuthStore } from '@/store/useAuthStore';
import { apiClient } from '@/lib/api';

export const CreateChannelModal = () => {
  const { closeModal } = useUIStore();
  const { username } = useAuthStore();
  const { setChannels, setCurrentChannelId } = useChatStore();
  
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || name.length < 2) return;

    setIsLoading(true);
    try {
      const newChannel = await apiClient.createChannel(name.trim(), username!);
      const updated = await apiClient.fetchChannels();
      setChannels(updated);
      setCurrentChannelId(newChannel.id);
      closeModal();
    } catch (error) {
      alert('Failed to create channel');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={closeModal}>
      <div 
        className="bg-accord-dark-300 rounded-lg max-w-md w-full shadow-2xl border border-accord-dark-100 overflow-hidden animate-slide-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 border-b border-accord-dark-700">
          <div className="flex items-center">
            <div className="w-12 h-12 bg-accord-blurple rounded-full flex items-center justify-center mr-4">
              <Hash className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-lg text-white">Create Channel</h3>
              <p className="text-sm text-accord-text-muted">Start a new conversation</p>
            </div>
          </div>
          <button onClick={closeModal} className="text-accord-text-muted hover:text-white transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          <div className="mb-6">
            <label className="block text-xs font-semibold text-accord-text-muted uppercase mb-2">Channel Name</label>
            <div className="relative">
              <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-accord-text-muted" />
              <input 
                type="text" 
                value={name}
                onChange={(e) => setName(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
                placeholder="new-channel" 
                autoFocus
                maxLength={30}
                className="w-full bg-accord-dark-600 text-accord-text-normal rounded px-10 py-2.5 focus:outline-none focus:ring-2 focus:ring-accord-blurple transition-all"
              />
            </div>
          </div>

          <div className="flex space-x-3">
            <button 
              type="button" 
              onClick={closeModal}
              className="flex-1 bg-transparent hover:bg-accord-dark-100 text-accord-text-muted hover:text-white py-2.5 rounded transition-colors font-medium"
            >
              Cancel
            </button>
            <button 
              type="submit" 
              disabled={isLoading || name.length < 2}
              className="btn-ripple flex-1 bg-accord-blurple hover:bg-[#4752C4] text-white font-semibold py-2.5 rounded transition-colors flex items-center justify-center disabled:opacity-50"
            >
              <Plus className="w-4 h-4 mr-2" />
              {isLoading ? 'Creating...' : 'Create Channel'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
