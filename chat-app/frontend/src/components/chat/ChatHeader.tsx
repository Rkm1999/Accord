import { Menu, Users, Hash, AtSign, Search } from 'lucide-react';
import { useChatStore } from '@/store/useChatStore';
import { useUIStore } from '@/store/useUIStore';

export const ChatHeader = () => {
  const { currentChannelId, channels, dms } = useChatStore();
  const { toggleLeftSidebar, toggleRightSidebar, openModal } = useUIStore();

  const publicChannel = channels.find(c => c.id === currentChannelId);
  const dmChannel = dms.find(d => d.id === currentChannelId);

  const channelName = publicChannel ? publicChannel.name : (dmChannel ? (dmChannel.other_display_name || dmChannel.other_username) : 'general');
  const isDm = !!dmChannel;

  return (
    <header className="h-12 px-4 flex items-center shadow-sm border-b border-accord-dark-700 flex-shrink-0 justify-between relative z-50 bg-accord-dark-300">
      <div className="flex items-center overflow-hidden">
        {/* Toggle Channel Button (Mobile) */}
        <button 
          onClick={() => toggleLeftSidebar()}
          className="mr-2 hover:text-accord-text-normal text-accord-text-muted lg:hidden flex items-center justify-center"
        >
          <Menu className="w-6 h-6" />
        </button>

        {isDm ? (
          <AtSign className="text-accord-text-muted mr-2 w-6 h-6" />
        ) : (
          <Hash className="text-accord-text-muted mr-2 w-6 h-6" />
        )}
        
        <h3 className="font-bold text-white mr-4 whitespace-nowrap">{channelName}</h3>
        
        {!isDm && (
          <span className="hidden md:block text-xs text-accord-text-muted truncate border-l border-accord-dark-100 pl-4">
            Start of conversation
          </span>
        )}
      </div>

      <div className="flex items-center space-x-3 text-accord-text-muted">
        <button 
          onClick={() => openModal('search')}
          className="hover:text-accord-text-normal cursor-pointer flex items-center justify-center"
          title="Search"
        >
          <Search className="w-6 h-6" />
        </button>
        <button 
          onClick={() => toggleRightSidebar()}
          className="hover:text-accord-text-normal cursor-pointer lg:hidden flex items-center justify-center"
        >
          <Users className="w-6 h-6" />
        </button>
      </div>
    </header>
  );
};
