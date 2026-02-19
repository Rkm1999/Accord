import { useState } from 'react';
import { Search, X } from 'lucide-react';
import { useUIStore } from '@/store/useUIStore';
import { useChatStore } from '@/store/useChatStore';
import { useAuthStore } from '@/store/useAuthStore';
import { apiClient } from '@/lib/api';
import { isLocalDev } from '@/lib/config';

export const StartDMModal = () => {
  const { closeModal } = useUIStore();
  const { username: currentUsername } = useAuthStore();
  const { allUsers, setDMs, setCurrentChannelId } = useChatStore();
  
  const [search, setSearch] = useState('');

  const filteredUsers = allUsers.filter(u => 
    u.username !== currentUsername && 
    (u.username.toLowerCase().includes(search.toLowerCase()) || 
     u.display_name?.toLowerCase().includes(search.toLowerCase()))
  );

  const handleStartDM = async (targetUsername: string) => {
    try {
      const { id } = await apiClient.startDM(targetUsername);
      const updatedDMs = await apiClient.fetchDMs();
      setDMs(updatedDMs);
      setCurrentChannelId(id);
      closeModal();
    } catch (error) {
      alert('Failed to start DM');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={closeModal}>
      <div 
        className="bg-accord-dark-300 rounded-lg max-w-md w-full shadow-2xl border border-accord-dark-100 overflow-hidden animate-slide-in flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-accord-dark-700 flex items-center justify-between">
          <h3 className="font-bold text-lg text-white">Select a Friend</h3>
          <button onClick={closeModal} className="text-accord-text-muted hover:text-white">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-4">
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-accord-text-muted" />
            <input 
              type="text" 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Type the username of a friend" 
              className="w-full bg-accord-dark-600 text-accord-text-normal rounded px-10 py-2 focus:outline-none focus:ring-2 focus:ring-accord-blurple"
              autoFocus
            />
          </div>

          <div className="overflow-y-auto custom-scrollbar space-y-1 pr-1">
            {filteredUsers.map((u) => {
              const displayName = u.display_name || u.username;
              const avatarUrl = u.avatar_key
                ? (isLocalDev ? `http://localhost:8787/api/file/${u.avatar_key}` : `/api/file/${u.avatar_key}`)
                : `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=random`;

              return (
                <div 
                  key={u.username}
                  onClick={() => handleStartDM(u.username)}
                  className="flex items-center p-2 hover:bg-accord-dark-100 rounded cursor-pointer transition-colors"
                >
                  <img src={avatarUrl} className="w-8 h-8 rounded-full mr-3 object-cover" />
                  <div>
                    <div className="font-medium text-white">{displayName}</div>
                    <div className="text-xs text-accord-text-muted">@{u.username}</div>
                  </div>
                </div>
              );
            })}
            {filteredUsers.length === 0 && (
              <div className="p-8 text-center text-accord-text-muted">No friends found</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
