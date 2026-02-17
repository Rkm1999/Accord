import { useEffect, useRef, useState } from 'react';
import { useVoiceStore } from '@/store/useVoiceStore';
import { useChatStore } from '@/store/useChatStore';
import { useAuthStore } from '@/store/useAuthStore';
import { MicOff } from 'lucide-react';
import { socketClient } from '@/lib/socket';
import { clsx } from 'clsx';
import { apiBaseUrl } from '@/lib/config';

export const VoiceRoomOverlay = () => {
  const { 
    activeVoiceChannelId, localStream, remoteStreams, participants,
    isMuted, isCameraOn, error, reset, isSpeaking: isLocalSpeaking
  } = useVoiceStore();
  const { speakingUsernames, videoOffUsernames } = useChatStore();
  const { username: currentUsername } = useAuthStore();

  if (activeVoiceChannelId === null) return null;

  const handleLeave = () => {
    socketClient.send({ type: 'leave_voice' });
    reset();
  };

  return (
    <div className="flex-shrink-0 bg-accord-dark-400 flex flex-col overflow-hidden relative border-b border-accord-dark-100 max-h-[40vh] lg:max-h-[60vh]">
      {error ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
          <div className="bg-accord-red/10 border border-accord-red/50 rounded-lg p-6 max-w-sm">
            <h4 className="text-accord-red font-bold text-lg mb-2">Connection Error</h4>
            <p className="text-accord-text-normal text-sm mb-6">{error}</p>
            <button 
              onClick={handleLeave}
              className="bg-accord-red hover:bg-red-600 text-white px-6 py-2 rounded font-semibold transition-colors"
            >
              Leave Voice
            </button>
          </div>
        </div>
      ) : (
        <div className="flex-1 p-4 overflow-y-auto custom-scrollbar">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 auto-rows-fr">
            {/* Local User */}
            <VideoTile 
              username={currentUsername || 'You'} 
              stream={localStream} 
              isMuted={isMuted} 
              isCameraOff={!isCameraOn}
              isSpeaking={isLocalSpeaking}
            />

            {/* Remote Users */}
            {participants.filter(u => u !== currentUsername).map(uName => (
              <VideoTile 
                key={uName} 
                username={uName} 
                stream={remoteStreams[uName]} 
                isSpeaking={speakingUsernames.includes(uName)}
                isCameraOff={videoOffUsernames.includes(uName)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const VideoTile = ({ 
  username, stream, isMuted = false, isCameraOff = false, isSpeaking = false 
}: { 
  username: string, stream: MediaStream | null, isMuted?: boolean, isCameraOff?: boolean, isSpeaking?: boolean 
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { allUsers } = useChatStore();
  const [hasVideoTrack, setHasVideoTrack] = useState(false);
  
  const user = allUsers.find(u => u.username === username);
  const displayName = user?.display_name || username;
  const avatarUrl = user?.avatar_key 
    ? `${apiBaseUrl}/api/file/${user.avatar_key}` 
    : `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=random`;

  useEffect(() => {
    if (!stream) {
      setHasVideoTrack(false);
      return;
    }

    const updateTrackStatus = () => {
      setHasVideoTrack(stream.getVideoTracks().length > 0);
    };

    updateTrackStatus();

    stream.addEventListener('addtrack', updateTrackStatus);
    stream.addEventListener('removetrack', updateTrackStatus);

    return () => {
      stream.removeEventListener('addtrack', updateTrackStatus);
      stream.removeEventListener('removetrack', updateTrackStatus);
    };
  }, [stream]);

  const showVideo = stream && hasVideoTrack && !isCameraOff;

  // Ensure srcObject is set whenever the video element is mounted and stream is available
  useEffect(() => {
    if (!videoRef.current) return;

    if (showVideo && stream) {
      // Force a "clean" bind by clearing first to avoid frozen frames from previous tracks
      videoRef.current.srcObject = null;
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {}); // Explicitly trigger play
    } else {
      videoRef.current.srcObject = null;
    }
  }, [showVideo, stream]);

  return (
    <div className={clsx(
      "aspect-video bg-accord-dark-600 rounded-xl overflow-hidden relative border-2 shadow-lg group transition-all duration-150",
      isSpeaking ? "border-accord-green shadow-[0_0_15px_rgba(35,165,90,0.4)]" : "border-accord-dark-100"
    )}>
      {showVideo ? (
        <video 
          ref={videoRef} 
          autoPlay 
          playsInline 
          muted={true} 
          className="w-full h-full object-cover" 
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-accord-dark-500">
          <div className="relative">
            <img 
              src={avatarUrl} 
              className={clsx(
                "w-24 h-24 rounded-full object-cover shadow-2xl transition-transform duration-300",
                isSpeaking && "scale-110"
              )} 
              alt={displayName}
            />
            {isSpeaking && (
              <div className="absolute inset-0 rounded-full border-4 border-accord-green animate-pulse" />
            )}
          </div>
        </div>
      )}

      {/* Overlay info */}
      <div className="absolute bottom-2 left-2 bg-black/40 backdrop-blur-md px-2 py-1 rounded text-xs font-bold flex items-center gap-2 text-white">
        {displayName}
        {isMuted && <MicOff className="w-3 h-3 text-accord-red" />}
      </div>
    </div>
  );
};
