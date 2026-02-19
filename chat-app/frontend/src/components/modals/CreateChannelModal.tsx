import React, { useState, useEffect } from 'react';
import { Hash, Plus, X, Volume2 } from 'lucide-react';
import { useUIStore } from '@/store/useUIStore';
import { useChatStore } from '@/store/useChatStore';
import { apiClient } from '@/lib/api';
import { clsx } from 'clsx';

export const CreateChannelModal = () => {
  const { closeModal, modalData } = useUIStore();
  const { setChannels, setCurrentChannelId } = useChatStore();
  
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'text' | 'voice'>('text');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (modalData === 'voice') setKind('voice');
    else setKind('text');
  }, [modalData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || name.length < 2) return;

    setIsLoading(true);
    try {
      const newChannel = await apiClient.createChannel(name.trim(), kind);
      const updated = await apiClient.fetchChannels();
      setChannels(updated);
      setCurrentChannelId(newChannel.id);
      closeModal();
    } catch (error: any) {
      alert(error.message || 'Failed to create channel');
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
              {kind === 'text' ? <Hash className="w-6 h-6 text-white" /> : <Volume2 className="w-6 h-6 text-white" />}
            </div>
            <div>
              <h3 className="font-bold text-lg text-white">Create {kind === 'text' ? 'Text' : 'Voice'} Channel</h3>
              <p className="text-sm text-accord-text-muted">In public channels</p>
            </div>
          </div>
          <button onClick={closeModal} className="text-accord-text-muted hover:text-white transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          {/* Channel Type Selector */}
          <div className="mb-6">
            <label className="block text-xs font-semibold text-accord-text-muted uppercase mb-3">Channel Type</label>
            <div className="space-y-2">
              <div 
                onClick={() => setKind('text')}
                className={clsx(
                  "flex items-center p-3 rounded-lg cursor-pointer transition-all border",
                  kind === 'text' ? "bg-accord-dark-100 border-accord-blurple" : "bg-accord-dark-600 border-transparent hover:bg-accord-dark-400"
                )}
              >
                <Hash className="w-6 h-6 text-accord-text-muted mr-3" />
                <div className="flex-1">
                  <div className="font-bold text-white text-sm">Text</div>
                  <div className="text-xs text-accord-text-muted">Send messages, images, and emojis</div>
                </div>
                <div className={clsx("w-5 h-5 rounded-full border-2 flex items-center justify-center", kind === 'text' ? "border-accord-blurple" : "border-accord-text-muted")}>
                  {kind === 'text' && <div className="w-2.5 h-2.5 rounded-full bg-accord-blurple" />}
                </div>
              </div>

              <div 
                onClick={() => setKind('voice')}
                className={clsx(
                  "flex items-center p-3 rounded-lg cursor-pointer transition-all border",
                  kind === 'voice' ? "bg-accord-dark-100 border-accord-blurple" : "bg-accord-dark-600 border-transparent hover:bg-accord-dark-400"
                )}
              >
                <Volume2 className="w-6 h-6 text-accord-text-muted mr-3" />
                <div className="flex-1">
                  <div className="font-bold text-white text-sm">Voice</div>
                  <div className="text-xs text-accord-text-muted">Hang out with voice, video, and screen share</div>
                </div>
                <div className={clsx("w-5 h-5 rounded-full border-2 flex items-center justify-center", kind === 'voice' ? "border-accord-blurple" : "border-accord-text-muted")}>
                  {kind === 'voice' && <div className="w-2.5 h-2.5 rounded-full bg-accord-blurple" />}
                </div>
              </div>
            </div>
          </div>

          <div className="mb-6">
            <label className="block text-xs font-semibold text-accord-text-muted uppercase mb-2">Channel Name</label>
            <div className="relative">
              {kind === 'text' ? (
                <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-accord-text-muted" />
              ) : (
                <Volume2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-accord-text-muted" />
              )}
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
