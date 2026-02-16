import { MessageSquare } from 'lucide-react';
import { useChatStore } from '@/store/useChatStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useUIStore } from '@/store/useUIStore';
import { clsx } from 'clsx';
import { apiBaseUrl } from '@/lib/config';

export const MemberSidebar = () => {
  const { allUsers, onlineUsernames } = useChatStore();
  const { username: currentUsername } = useAuthStore();
  const { openModal, toggleRightSidebar } = useUIStore();

  const onlineUsers = allUsers.filter(u => onlineUsernames.includes(u.username));
  const offlineUsers = allUsers.filter(u => !onlineUsernames.includes(u.username));

  const handleOpenUserDetail = (username: string) => {
    openModal('userDetail', username);
    if (window.innerWidth < 1024) {
      toggleRightSidebar(false);
    }
  };

  const renderUser = (user: any, isOnline: boolean) => {
    const displayName = user.display_name || user.username;
    const avatarUrl = user.avatar_key
      ? `${apiBaseUrl}/api/file/${user.avatar_key}`
      : `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=random`;


    return (
      <div 
        key={user.username}
        onClick={() => handleOpenUserDetail(user.username)}
        className={clsx(
          "flex items-center px-2 py-1.5 rounded hover:bg-accord-dark-200 cursor-pointer group mb-0.5",
          !isOnline && "grayscale-[0.8] contrast-[0.8]"
        )}
      >
        <div className="relative mr-3 flex-shrink-0">
          <img src={avatarUrl} alt={displayName} className="w-8 h-8 rounded-full object-cover" />
          <div className={clsx(
            "absolute bottom-0 right-0 w-3.5 h-3.5 border-[3px] border-accord-dark-400 rounded-full",
            isOnline ? "bg-accord-green" : "bg-accord-text-muted"
          )} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <div className="text-[15px] font-medium leading-4 text-accord-text-normal truncate">{displayName}</div>
            {user.username !== currentUsername && (
              <button 
                className="hidden group-hover:flex text-accord-text-muted hover:text-white p-1 rounded transition-all"
                onClick={(e) => {
                  e.stopPropagation();
                  // Logic to start DM - will trigger StartDM action
                  window.dispatchEvent(new CustomEvent('accord-start-dm', { detail: user.username }));
                }}
              >
                <MessageSquare className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full p-3 overflow-y-auto custom-scrollbar">
      {onlineUsers.length > 0 && (
        <div className="mb-6">
          <h3 className="text-accord-text-muted text-xs font-bold uppercase mb-2 px-2">
            Online — {onlineUsers.length}
          </h3>
          {onlineUsers.map(u => renderUser(u, true))}
        </div>
      )}

      {offlineUsers.length > 0 && (
        <div className="mb-6">
          <h3 className="text-accord-text-muted text-xs font-bold uppercase mb-2 px-2">
            Offline — {offlineUsers.length}
          </h3>
          {offlineUsers.map(u => renderUser(u, false))}
        </div>
      )}

      {allUsers.length === 0 && (
        <div className="p-4 text-center">
          <p className="text-sm text-accord-text-muted">No registered users found</p>
        </div>
      )}
    </div>
  );
};
