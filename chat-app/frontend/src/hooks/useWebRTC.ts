import { useEffect, useRef } from 'react';
import { useVoiceStore } from '../store/useVoiceStore';
import { useAuthStore } from '../store/useAuthStore';
import { socketClient } from '../lib/socket';
import { deviceManager } from '../lib/devices';

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

export const useWebRTC = () => {
  const { 
    activeVoiceChannelId, localStream, setLocalStream, 
    addRemoteStream, removeRemoteStream,
    addPeer, removePeer,
    audioInputId, videoInputId,
    isMuted, isCameraOn, isSpeaking, setSpeaking, setError
  } = useVoiceStore();
  
  const { username } = useAuthStore();
  
  const peersRef = useRef<Record<string, RTCPeerConnection>>({});
  const localStreamRef = useRef<MediaStream | null>(null);
  const makingOffer = useRef(false);
  const ignoreOffer = useRef(false);

  // Helper to ensure we don't lose the original stream object
  const getOrInitLocalStream = () => {
    if (!localStreamRef.current) {
      localStreamRef.current = new MediaStream();
      setLocalStream(localStreamRef.current);
    }
    return localStreamRef.current;
  };

  // 1. Initial Media & Lifecycle
  useEffect(() => {
    if (activeVoiceChannelId === null) {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(t => t.stop());
        localStreamRef.current = null;
        setLocalStream(null);
      }
      Object.keys(peersRef.current).forEach(u => {
        peersRef.current[u].close();
        removePeer(u);
        removeRemoteStream(u);
      });
      peersRef.current = {};
      return;
    }

    let stopDetector: (() => void) | null = null;

    const initAudio = async () => {
      try {
        const stream = getOrInitLocalStream();
        // Get fresh audio
        const audioStream = await deviceManager.getLocalStream(audioInputId, false);
        const audioTrack = audioStream.getAudioTracks()[0];
        
        if (audioTrack) {
          audioTrack.enabled = !isMuted;
          stream.addTrack(audioTrack);
          setLocalStream(new MediaStream(stream.getTracks()));
          
          stopDetector = deviceManager.createSpeakingDetector(audioStream, (speaking) => {
            setSpeaking(speaking);
          });
        }
      } catch (e) {
        console.error('Audio init failed:', e);
        setError('Failed to access microphone.');
      }
    };

    initAudio();
    return () => { if (stopDetector) stopDetector(); };
  }, [activeVoiceChannelId]);

  // 1.1 Speaking state
  useEffect(() => {
    if (activeVoiceChannelId !== null) {
      socketClient.send({ 
        type: 'user_speaking', 
        speaking: isSpeaking,
        videoOn: isCameraOn
      });
    }
  }, [isSpeaking, isCameraOn, activeVoiceChannelId]);

  // 2. Mute Sync
  useEffect(() => {
    if (localStream) {
      localStream.getAudioTracks().forEach(t => t.enabled = !isMuted);
    }
  }, [isMuted, localStream]);

  // 2.0 Track Synchronization
  // Ensure all current tracks are added to all active peer connections
  useEffect(() => {
    if (!localStream) return;
    
    const tracks = localStream.getTracks();
    for (const pc of Object.values(peersRef.current)) {
      tracks.forEach(track => {
        // Check if we're already sending this track
        const hasTrack = pc.getSenders().some(s => s.track === track);
        if (!hasTrack) {
          pc.addTrack(track, localStream);
        }
      });
    }
  }, [localStream]);

  // 2.1 Camera Toggle (Persistent Audio)
  useEffect(() => {
    if (activeVoiceChannelId === null) return;

    const syncCamera = async () => {
      const stream = getOrInitLocalStream();
      
      // Notify others about video status change
      socketClient.send({ type: 'user_video_status', videoOn: isCameraOn });
      
      if (isCameraOn) {
        try {
          const videoStream = await deviceManager.getLocalStream(false, videoInputId);
          const videoTrack = videoStream.getVideoTracks()[0];
          if (videoTrack) {
            stream.getVideoTracks().forEach(t => { t.stop(); stream.removeTrack(t); });
            stream.addTrack(videoTrack);
            setLocalStream(new MediaStream(stream.getTracks()));
            
            for (const pc of Object.values(peersRef.current)) {
              // Look for any existing video sender (even if track is null)
              const sender = pc.getSenders().find(s => 
                (s.track?.kind === 'video') || 
                (pc.getTransceivers().find(t => t.sender === s && t.receiver.track.kind === 'video'))
              );

              if (sender) {
                await sender.replaceTrack(videoTrack);
              } else {
                pc.addTrack(videoTrack, stream);
              }
            }
          }
        } catch (err) {
          setError('Failed to start camera.');
        }
      } else {
        stream.getVideoTracks().forEach(t => {
          t.stop();
          stream.removeTrack(t);
        });

        for (const pc of Object.values(peersRef.current)) {
          const sender = pc.getSenders().find(s => s.track?.kind === 'video');
          if (sender) {
            await sender.replaceTrack(null);
          }
        }
        setLocalStream(new MediaStream(stream.getTracks()));
      }
    };
    syncCamera();
  }, [isCameraOn, videoInputId, activeVoiceChannelId]);

  // 3. Handshake Logic
  useEffect(() => {
    if (activeVoiceChannelId === null || !username) return;

    const createPC = (targetUsername: string) => {
      if (peersRef.current[targetUsername]) return peersRef.current[targetUsername];

      const pc = new RTCPeerConnection(RTC_CONFIG);
      (pc as any).candidateBuffer = [];

      pc.onnegotiationneeded = async () => {
        try {
          if (pc.signalingState !== 'stable') return;
          makingOffer.current = true;
          await pc.setLocalDescription();
          socketClient.send({
            type: 'rtc_signal',
            targetUsername,
            signalData: { description: pc.localDescription }
          });
        } catch (err) {
          console.error('Negotiation error:', err);
        } finally {
          makingOffer.current = false;
        }
      };

      pc.onicecandidate = ({ candidate }) => {
        if (candidate) {
          socketClient.send({
            type: 'rtc_signal',
            targetUsername,
            signalData: { candidate }
          });
        }
      };

      pc.ontrack = (event) => {
        console.log('Received remote track:', event.track.kind, 'from:', targetUsername);
        
        // Ensure we have a consistent stream object for this user
        const { remoteStreams } = useVoiceStore.getState();
        let stream = remoteStreams[targetUsername];
        
        if (!stream) {
          stream = new MediaStream();
          addRemoteStream(targetUsername, stream);
        }

        // Replace track of the same kind to avoid accumulation
        const existingTrack = stream.getTracks().find(t => t.kind === event.track.kind);
        if (existingTrack) {
          if (existingTrack.id === event.track.id) return; // Already have this track
          stream.removeTrack(existingTrack);
        }

        stream.addTrack(event.track);
        // Re-dispatch to force UI to see new tracks within the same stream object
        addRemoteStream(targetUsername, new MediaStream(stream.getTracks()));
      };

      pc.onconnectionstatechange = () => {
        if (['disconnected', 'failed', 'closed'].includes(pc.connectionState)) {
          pc.close();
          delete peersRef.current[targetUsername];
          removePeer(targetUsername);
          removeRemoteStream(targetUsername);
        }
      };

      // Inject tracks
      const stream = localStreamRef.current;
      if (stream) {
        stream.getTracks().forEach(track => pc.addTrack(track, stream));
      }

      peersRef.current[targetUsername] = pc;
      addPeer(targetUsername, pc);
      return pc;
    };

    const handleUserJoined = (e: any) => {
      if (e.detail !== username) createPC(e.detail);
    };

    const handleRTCSignal = async (e: any) => {
      const { from, signal } = e.detail;
      if (from === username) return;

      const pc = peersRef.current[from] || createPC(from);
      const isPolite = username.localeCompare(from) > 0;

      try {
        if (signal.description) {
          const offerCollision = signal.description.type === 'offer' && (makingOffer.current || pc.signalingState !== 'stable');
          ignoreOffer.current = !isPolite && offerCollision;
          if (ignoreOffer.current) return;

          await pc.setRemoteDescription(signal.description);
          if (signal.description.type === 'offer') {
            await pc.setLocalDescription();
            socketClient.send({
              type: 'rtc_signal',
              targetUsername: from,
              signalData: { description: pc.localDescription }
            });
          }

          const buffer = (pc as any).candidateBuffer;
          while (buffer.length > 0) await pc.addIceCandidate(buffer.shift());
        } else if (signal.candidate) {
          if (pc.remoteDescription) await pc.addIceCandidate(signal.candidate);
          else (pc as any).candidateBuffer.push(signal.candidate);
        }
      } catch (err) {
        console.error('Signal handling error:', err);
      }
    };

    const handleUserLeft = (e: any) => {
      const pc = peersRef.current[e.detail];
      if (pc) {
        pc.close();
        delete peersRef.current[e.detail];
        removePeer(e.detail);
        removeRemoteStream(e.detail);
      }
    };

    window.addEventListener('rtc-user-joined', handleUserJoined);
    window.addEventListener('rtc-signal', handleRTCSignal);
    window.addEventListener('rtc-user-left', handleUserLeft);

    return () => {
      window.removeEventListener('rtc-user-joined', handleUserJoined);
      window.removeEventListener('rtc-signal', handleRTCSignal);
      window.removeEventListener('rtc-user-left', handleUserLeft);
    };
  }, [activeVoiceChannelId, username]);
};
