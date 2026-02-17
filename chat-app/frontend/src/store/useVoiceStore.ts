import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface VoiceState {
  activeVoiceChannelId: number | null;
  participants: string[];
  localStream: MediaStream | null;
  remoteStreams: Record<string, MediaStream>;
  peers: Record<string, RTCPeerConnection>;
  
  // Device state
  audioInputId: string;
  videoInputId: string;
  audioOutputId: string;
  isMuted: boolean;
  isDeafened: boolean;
  isCameraOn: boolean;
  isSpeaking: boolean;
  isTtsEnabled: boolean;
  preferredVoiceName: string | null;
  error: string | null;
  lastTextChannelId: number;

  setActiveVoiceChannelId: (id: number | null) => void;
  setParticipants: (participants: string[]) => void;
  setLocalStream: (stream: MediaStream | null) => void;
  addRemoteStream: (username: string, stream: MediaStream) => void;
  removeRemoteStream: (username: string) => void;
  addPeer: (username: string, pc: RTCPeerConnection) => void;
  removePeer: (username: string) => void;
  
  setAudioInputId: (id: string) => void;
  setVideoInputId: (id: string) => void;
  setAudioOutputId: (id: string) => void;
  setMuted: (muted: boolean) => void;
  setDeafened: (deafened: boolean) => void;
  setCameraOn: (on: boolean) => void;
  setSpeaking: (speaking: boolean) => void;
  setTtsEnabled: (enabled: boolean) => void;
  setPreferredVoiceName: (name: string | null) => void;
  setError: (error: string | null) => void;
  setLastTextChannelId: (id: number) => void;
  
  reset: () => void;
}

export const useVoiceStore = create<VoiceState>()(
  persist(
    (set) => ({
      activeVoiceChannelId: null,
      participants: [],
      localStream: null,
      remoteStreams: {},
      peers: {},

      audioInputId: 'default',
      videoInputId: 'default',
      audioOutputId: 'default',
      isMuted: false,
      isDeafened: false,
      isCameraOn: false,
      isSpeaking: false,
      isTtsEnabled: false,
      preferredVoiceName: null,
      error: null,
      lastTextChannelId: 1,

      setActiveVoiceChannelId: (id) => {
        // Trigger voice loading and ensure they are cached by the browser
        if ('speechSynthesis' in window) {
          window.speechSynthesis.getVoices();
          // Some browsers need this event listener to actually populate the list
          window.speechSynthesis.onvoiceschanged = () => {
            window.speechSynthesis.getVoices();
          };
        }
        set({ activeVoiceChannelId: id });
      },
      setParticipants: (participants) => set({ participants }),
      setLocalStream: (stream) => set({ localStream: stream }),
      
      addRemoteStream: (username, stream) => set((state) => ({
        remoteStreams: { ...state.remoteStreams, [username]: stream }
      })),
      
      removeRemoteStream: (username) => set((state) => {
        const { [username]: _, ...rest } = state.remoteStreams;
        return { remoteStreams: rest };
      }),

      addPeer: (username, pc) => set((state) => ({
        peers: { ...state.peers, [username]: pc }
      })),

      removePeer: (username) => set((state) => {
        const { [username]: _, ...rest } = state.peers;
        return { peers: rest };
      }),

      setAudioInputId: (id) => set({ audioInputId: id }),
      setVideoInputId: (id) => set({ videoInputId: id }),
      setAudioOutputId: (id) => set({ audioOutputId: id }),
      setMuted: (muted) => set({ isMuted: muted }),
      setDeafened: (deafened) => set({ isDeafened: deafened }),
      setCameraOn: (on) => set({ isCameraOn: on }),
      setSpeaking: (speaking) => set({ isSpeaking: speaking }),
      setTtsEnabled: (enabled) => set({ isTtsEnabled: enabled }),
      setPreferredVoiceName: (name) => set({ preferredVoiceName: name }),
      setError: (error) => set({ error }),
      setLastTextChannelId: (id) => set({ lastTextChannelId: id }),

      reset: () => {
        window.speechSynthesis?.cancel();
        set({
          activeVoiceChannelId: null,
          participants: [],
          localStream: null,
          remoteStreams: {},
          peers: {},
          isCameraOn: false,
          isSpeaking: false,
          isTtsEnabled: false,
          preferredVoiceName: null,
          error: null
        });
      },
    }),
    {
      name: 'accord-voice-prefs',
      partialize: (state) => ({
        audioInputId: state.audioInputId,
        videoInputId: state.videoInputId,
        audioOutputId: state.audioOutputId,
        isMuted: state.isMuted,
        isDeafened: state.isDeafened,
        isTtsEnabled: state.isTtsEnabled,
        preferredVoiceName: state.preferredVoiceName,
        lastTextChannelId: state.lastTextChannelId
      })
    }
  )
);
