import { useEffect, useRef, useState } from 'react';
import { useVoiceStore } from '@/store/useVoiceStore';

export const GlobalVoiceManager = () => {
  const { remoteStreams, activeVoiceChannelId } = useVoiceStore();

  if (activeVoiceChannelId === null) return null;

  return (
    <div className="hidden" aria-hidden="true">
      {Object.entries(remoteStreams).map(([username, stream]) => (
        <AudioElement key={username} stream={stream} />
      ))}
    </div>
  );
};

const AudioElement = ({ stream }: { stream: MediaStream }) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const { isDeafened } = useVoiceStore();
  const [, forceUpdate] = useState({});

  useEffect(() => {
    if (!stream) return;

    const handleTrackEvent = () => {
      forceUpdate({}); // Force re-render to re-bind srcObject if tracks changed
    };

    stream.addEventListener('addtrack', handleTrackEvent);
    stream.addEventListener('removetrack', handleTrackEvent);

    if (audioRef.current) {
      // Clear and re-bind to ensure all tracks are active
      audioRef.current.srcObject = null;
      audioRef.current.srcObject = stream;
      audioRef.current.muted = isDeafened;
      audioRef.current.play().catch(e => console.warn('Audio play failed:', e));
    }

    return () => {
      stream.removeEventListener('addtrack', handleTrackEvent);
      stream.removeEventListener('removetrack', handleTrackEvent);
    };
  }, [stream, isDeafened]);

  return <audio ref={audioRef} autoPlay />;
};
