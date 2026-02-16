import { X, MessageSquare } from 'lucide-react';
import { useUIStore } from '@/store/useUIStore';
import { useChatStore } from '@/store/useChatStore';
import { useAuthStore } from '@/store/useAuthStore';
import { apiClient } from '@/lib/api';
import { apiBaseUrl } from '@/lib/config';
import { clsx } from 'clsx';

export const UserDetailModal = () => {
  const { closeModal, userDetailUsername } = useUIStore();
  const { allUsers, onlineUsernames, setDMs, setCurrentChannelId } = useChatStore();
  const { username: currentUsername } = useAuthStore();

  if (!userDetailUsername) return null;

  const user = allUsers.find(u => u.username === userDetailUsername);
  if (!user) return null;

  const isOnline = onlineUsernames.includes(user.username);
  const displayName = user.display_name || user.username;
  const avatarUrl = user.avatar_key
    ? `${apiBaseUrl}/api/file/${user.avatar_key}`
    : `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=random`;

  const handleStartDM = async () => {
    try {
      const { id } = await apiClient.startDM(currentUsername!, user.username);
      const updatedDMs = await apiClient.fetchDMs(currentUsername!);
      setDMs(updatedDMs);
      setCurrentChannelId(id);
      closeModal();
    } catch (error) {
      alert('Failed to start DM');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[100] p-4" onClick={closeModal}>
      <div 
        className="bg-accord-dark-600 rounded-lg max-w-sm w-full shadow-2xl overflow-hidden border border-accord-dark-100 animate-slide-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Section */}
        <div className="p-6 flex items-center gap-4">
          <div className="relative flex-shrink-0 cursor-pointer hover:opacity-90 transition-opacity"
               onClick={() => window.dispatchEvent(new CustomEvent('accord-open-image', { detail: { url: avatarUrl, name: displayName } }))}>
            <div className="w-20 h-20 rounded-full border-2 border-accord-dark-400 bg-accord-dark-300 relative overflow-hidden">
              <img src={avatarUrl} className="w-full h-full object-cover" alt={displayName} />
              <div className={clsx(
                "absolute bottom-0.5 right-0.5 w-4 h-4 rounded-full border-[3px] border-accord-dark-600",
                isOnline ? "bg-accord-green" : "bg-accord-text-muted"
              )} />
            </div>
          </div>

          <div className="min-w-0">
            <h2 className="text-xl font-bold text-white truncate">{displayName}</h2>
            <div className="text-accord-text-muted text-sm truncate">@{user.username}</div>
          </div>
          
          <button onClick={closeModal} className="ml-auto text-accord-text-muted hover:text-white self-start">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Body Section */}
        <div className="px-4 pb-6">
          <div className="bg-accord-dark-400 rounded-lg p-3 mb-4">
            <div className="text-[10px] font-bold uppercase text-accord-text-muted mb-1">Status</div>
            <div className="text-sm text-accord-text-normal">
              {isOnline ? 'Online' : 'Offline'}
            </div>
          </div>

          {user.username !== currentUsername && (
            <button 
              onClick={handleStartDM}
              className="w-full bg-accord-blurple hover:bg-[#4752C4] text-white font-semibold py-2 rounded transition-colors flex items-center justify-center gap-2"
            >
              <MessageSquare className="w-4 h-4" />
              Send Message
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
