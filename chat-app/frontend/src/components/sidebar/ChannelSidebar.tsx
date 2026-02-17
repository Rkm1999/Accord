import React from 'react';
import { Hash, Plus, Settings, X, Trash2, Volume2 } from 'lucide-react';
import { useChatStore } from '@/store/useChatStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useUIStore } from '@/store/useUIStore';
import { useVoiceStore } from '@/store/useVoiceStore';
import { clsx } from 'clsx';
import { apiClient } from '@/lib/api';
import { apiBaseUrl } from '@/lib/config';
import { socketClient } from '@/lib/socket';
import { VoiceControlPanel } from '../chat/VoiceControlPanel';

export const ChannelSidebar = () => {
  const { 
    channels, dms, currentChannelId, unreadChannels, 
    setCurrentChannelId, clearChannelUnread, voiceChannelOccupants, allUsers,
    speakingUsernames
  } = useChatStore();
  const { username, displayName, avatarKey } = useAuthStore();
  const { openModal, toggleLeftSidebar } = useUIStore();

  const textChannels = channels.filter(c => c.kind === 'text' || !c.kind);
  const voiceChannels = channels.filter(c => c.kind === 'voice');

  const handleSwitchChannel = (id: number) => {
    const channel = channels.find(c => c.id === id);
    if (channel?.kind === 'voice') {
      const { activeVoiceChannelId, setActiveVoiceChannelId, setLastTextChannelId } = useVoiceStore.getState();
      if (activeVoiceChannelId !== id) {
        const currentChannel = channels.find(c => c.id === currentChannelId);
        if (currentChannel?.kind !== 'voice') {
          setLastTextChannelId(currentChannelId);
        }
        
        // Prime TTS for iOS/Mobile
        if ('speechSynthesis' in window) {
          const utterance = new SpeechSynthesisUtterance("");
          window.speechSynthesis.speak(utterance);
        }

        socketClient.send({ type: 'join_voice', channelId: id });
        setActiveVoiceChannelId(id);
      }
      setCurrentChannelId(id);
      socketClient.send({ type: 'switch_channel', channelId: id });
    } else {
      setCurrentChannelId(id);
      clearChannelUnread(id);
      socketClient.send({ type: 'switch_channel', channelId: id });
    }
    
    if (window.innerWidth < 1024) {
      toggleLeftSidebar(false);
    }
  };

  const handleDeleteChannel = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this channel?')) return;
    try {
      await apiClient.deleteChannel(id);
      window.location.reload(); // Refresh to update lists
    } catch (error) {
      alert('Failed to delete channel');
    }
  };

  const handleOpenProfile = () => {
    openModal('profile');
    if (window.innerWidth < 1024) {
      toggleLeftSidebar(false);
    }
  };

  const renderVoiceOccupants = (channelId: number) => {
    const occupantUsernames = voiceChannelOccupants[channelId] || [];
    if (occupantUsernames.length === 0) return null;

    return (
      <div className="ml-9 mt-1 mb-2 space-y-1">
        {occupantUsernames.map(uName => {
          const user = allUsers.find(u => u.username === uName);
          const dName = user?.display_name || uName;
          const avatar = user?.avatar_key 
            ? `${apiBaseUrl}/api/file/${user.avatar_key}` 
            : `https://ui-avatars.com/api/?name=${encodeURIComponent(dName)}&background=random`;
          
          const isSpeaking = speakingUsernames.includes(uName);

          return (
            <div key={uName} className="flex items-center gap-2 py-0.5 group/member cursor-pointer">
              <div className={clsx(
                "relative rounded-full p-[1.5px] transition-all duration-150",
                isSpeaking ? "bg-accord-green shadow-[0_0_8px_rgba(35,165,90,0.5)]" : "bg-transparent"
              )}>
                <img src={avatar} className="w-5 h-5 rounded-full object-cover" />
              </div>
              <span className={clsx(
                "text-xs truncate transition-colors",
                isSpeaking ? "text-white font-medium" : "text-accord-text-muted group-hover/member:text-accord-text-normal"
              )}>
                {dName}
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Server Header */}
      <div className="h-12 px-4 flex items-center justify-between shadow-sm hover:bg-accord-dark-200 cursor-pointer transition-colors border-b border-accord-dark-700">
        <h1 className="font-bold text-[15px] truncate text-white">Accord</h1>
      </div>

      {/* Sidebar Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {/* Text Channels */}
        <div className="mb-2">
          <div className="flex items-center justify-between px-2 mb-1 mt-3">
            <span className="text-[11px] font-bold uppercase text-accord-text-muted tracking-wide">Text Channels</span>
            <button 
              onClick={() => openModal('createChannel', 'text')}
              className="text-accord-text-muted hover:text-white transition-all p-0.5"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          <div className="px-2 space-y-0.5">
            {textChannels.map((channel) => {
              const isActive = channel.id === currentChannelId;
              const isUnread = unreadChannels.includes(channel.id) && !isActive;
              return (
                <div 
                  key={channel.id}
                  onClick={() => handleSwitchChannel(channel.id)}
                  className={clsx(
                    "flex items-center px-2 py-[6px] rounded-[4px] cursor-pointer group mb-[2px] transition-colors",
                    isActive ? "bg-accord-dark-100 text-white" : "text-accord-text-muted hover:bg-accord-dark-200 hover:text-accord-text-normal"
                  )}
                >
                  <Hash className="mr-1.5 w-5 h-5 text-accord-text-muted flex-shrink-0" />
                  <span className={clsx("font-medium truncate flex-1", isUnread && "text-white font-bold")}>
                    {channel.name}
                  </span>
                  {isUnread && <div className="w-2 h-2 bg-white rounded-full ml-1 animate-badge-shake" />}
                  {channel.id !== 1 && (
                    <button 
                      onClick={(e) => handleDeleteChannel(e, channel.id)}
                      className="ml-auto opacity-0 group-hover:opacity-100 hover:text-accord-red text-accord-text-muted p-1 rounded"
                    >
                      <Trash2 className="w-[14px] h-[14px]" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Voice Channels */}
        <div className="mb-2">
          <div className="flex items-center justify-between px-2 mb-1 mt-3">
            <span className="text-[11px] font-bold uppercase text-accord-text-muted tracking-wide">Voice Channels</span>
            <button 
              onClick={() => openModal('createChannel', 'voice')}
              className="text-accord-text-muted hover:text-white transition-all p-0.5"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          <div className="px-2 space-y-0.5">
            {voiceChannels.map((channel) => {
              const isActive = channel.id === currentChannelId; 
              return (
                <React.Fragment key={channel.id}>
                  <div 
                    onClick={() => handleSwitchChannel(channel.id)}
                    className={clsx(
                      "flex items-center px-2 py-[6px] rounded-[4px] cursor-pointer group mb-[2px] transition-colors",
                      isActive ? "bg-accord-dark-100 text-white" : "text-accord-text-muted hover:bg-accord-dark-200 hover:text-accord-text-normal"
                    )}
                  >
                    <Volume2 className="mr-1.5 w-5 h-5 text-accord-text-muted flex-shrink-0" />
                    <span className="font-medium truncate flex-1">
                      {channel.name}
                    </span>
                    <button 
                      onClick={(e) => handleDeleteChannel(e, channel.id)}
                      className="ml-auto opacity-0 group-hover:opacity-100 hover:text-accord-red text-accord-text-muted p-1 rounded"
                    >
                      <Trash2 className="w-[14px] h-[14px]" />
                    </button>
                  </div>
                  {renderVoiceOccupants(channel.id)}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* Direct Messages */}
        <div className="mb-2">
          <div className="flex items-center justify-between px-2 mb-1 mt-4">
            <span className="text-[11px] font-bold uppercase text-accord-text-muted tracking-wide">Direct Messages</span>
            <button 
              onClick={() => openModal('startDM')}
              className="text-accord-text-muted hover:text-white transition-all p-0.5"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          <div className="px-2 space-y-0.5">
            {dms.map((dm) => {
              const isActive = dm.id === currentChannelId;
              const isUnread = unreadChannels.includes(dm.id) && !isActive;
              const displayName = dm.other_display_name || dm.other_username;
              const avatarUrl = dm.other_avatar_key
                ? `${apiBaseUrl}/api/file/${dm.other_avatar_key}`
                : `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName || '')}&background=random`;

              return (
                <div 
                  key={dm.id}
                  onClick={() => handleSwitchChannel(dm.id)}
                  className={clsx(
                    "flex items-center px-2 py-[6px] rounded-[4px] cursor-pointer group mb-[2px] transition-colors",
                    isActive ? "bg-accord-dark-100 text-white" : "text-accord-text-muted hover:bg-accord-dark-200 hover:text-accord-text-normal"
                  )}
                >
                  <img src={avatarUrl} className="w-6 h-6 rounded-full mr-2 object-cover" />
                  <span className={clsx("font-medium truncate flex-1", isUnread && "text-white font-bold")}>
                    {displayName}
                  </span>
                  {isUnread && <div className="w-2 h-2 bg-white rounded-full ml-1 animate-badge-shake" />}
                  <button 
                    onClick={(e) => handleDeleteChannel(e, dm.id)}
                    className="ml-auto opacity-0 group-hover:opacity-100 hover:text-accord-red text-accord-text-muted p-1 rounded"
                  >
                    <X className="w-[14px] h-[14px]" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Voice Control Panel */}
      <VoiceControlPanel isSidebar />

      {/* User Control Panel */}
      <div className="bg-accord-dark-500 px-2 py-1.5 flex items-center">
        <div 
          onClick={handleOpenProfile}
          className="flex items-center p-1 hover:bg-accord-dark-100 rounded cursor-pointer mr-auto group flex-1 overflow-hidden"
        >
          <div className="relative mr-2 flex-shrink-0">
            {avatarKey ? (
              <img 
                src={`${apiBaseUrl}/api/file/${avatarKey}`} 
                className="w-8 h-8 rounded-full object-cover" 
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-accord-blurple flex items-center justify-center text-sm font-bold text-white">
                {(displayName || username || 'U').charAt(0).toUpperCase()}
              </div>
            )}
            <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-accord-green border-2 border-accord-dark-500 rounded-full" />
          </div>
          <div className="text-sm overflow-hidden">
            <div className="font-semibold text-white text-[13px] leading-tight truncate">
              {displayName || username}
            </div>
            <div className="text-[11px] text-accord-text-muted truncate">
              #{channels.find(c => c.id === currentChannelId)?.name || 'general'}
            </div>
          </div>
        </div>
        <div className="flex items-center">
          <button 
            onClick={handleOpenProfile}
            className="p-1.5 hover:bg-accord-dark-100 rounded text-accord-text-normal"
          >
            <Settings className="w-[19px] h-[19px]" />
          </button>
        </div>
      </div>
    </div>
  );
};
