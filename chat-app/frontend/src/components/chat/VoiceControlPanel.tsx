import { Mic, MicOff, Video, VideoOff, Headphones, PhoneOff } from 'lucide-react';
import { useVoiceStore } from '@/store/useVoiceStore';
import { useChatStore } from '@/store/useChatStore';
import { clsx } from 'clsx';
import { socketClient } from '@/lib/socket';

export const VoiceControlPanel = ({ isSidebar = false }: { isSidebar?: boolean }) => {
  const { 
    activeVoiceChannelId, isMuted, isDeafened, isCameraOn,
    setMuted, setDeafened, setCameraOn, reset, lastTextChannelId
  } = useVoiceStore();
  
  const { setCurrentChannelId } = useChatStore();

  if (activeVoiceChannelId === null) return null;

  const handleDisconnect = () => {
    socketClient.send({ type: 'leave_voice' });
    reset();
    setCurrentChannelId(lastTextChannelId);
  };

  return (
    <div className={clsx(
      "bg-accord-dark-600 p-2",
      isSidebar ? "border-b border-accord-dark-700" : "border-t border-accord-dark-700 pb-safe shadow-[0_-4px_12px_rgba(0,0,0,0.3)]"
    )}>
      <div className="flex items-center gap-2">
        {/* Media Controls Group */}
        <div className="flex items-center justify-around bg-accord-dark-500 rounded-md p-1 flex-1">
          <button 
            onClick={() => setMuted(!isMuted)}
            className={clsx(
              "p-2 rounded transition-colors flex justify-center",
              isMuted ? "text-accord-red bg-accord-red/10" : "text-accord-text-normal hover:bg-accord-dark-100"
            )}
            title={isMuted ? "Unmute" : "Mute"}
          >
            {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </button>

          <button 
            onClick={() => setDeafened(!isDeafened)}
            className={clsx(
              "p-2 rounded transition-colors flex justify-center",
              isDeafened ? "text-accord-red bg-accord-red/10" : "text-accord-text-normal hover:bg-accord-dark-100"
            )}
            title={isDeafened ? "Undeafen" : "Deafen"}
          >
            <Headphones className={clsx("w-5 h-5", isDeafened && "text-accord-red")} />
          </button>

          <button 
            onClick={() => setCameraOn(!isCameraOn)}
            className={clsx(
              "p-2 rounded transition-colors flex justify-center",
              isCameraOn ? "text-accord-green bg-accord-green/10" : "text-accord-text-normal hover:bg-accord-dark-100"
            )}
            title={isCameraOn ? "Turn off camera" : "Turn on camera"}
          >
            {isCameraOn ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
          </button>
        </div>

        {/* Disconnect Group */}
        <button 
          onClick={handleDisconnect}
          className="bg-accord-red/10 hover:bg-accord-red/20 text-accord-red p-3 rounded-md transition-colors shadow-sm"
          title="Disconnect"
        >
          <PhoneOff className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};
