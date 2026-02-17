export const deviceManager = {
  async getDevices() {
    try {
      // Prompt for audio permission only to get device labels without triggering camera LED
      await navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => stream.getTracks().forEach(t => t.stop()))
        .catch(() => {});

      const devices = await navigator.mediaDevices.enumerateDevices();
      return {
        audioInputs: devices.filter(d => d.kind === 'audioinput'),
        videoInputs: devices.filter(d => d.kind === 'videoinput'),
        audioOutputs: devices.filter(d => d.kind === 'audiooutput'),
      };
    } catch (e) {
      console.error('Failed to get devices:', e);
      return { audioInputs: [], videoInputs: [], audioOutputs: [] };
    }
  },

  async getLocalStream(audioId: string | boolean = true, videoId: string | boolean = false) {
    const audioConstraints = (typeof audioId === 'string' && audioId !== 'default') ? { deviceId: { ideal: audioId } } : (audioId === 'default' ? true : audioId);
    const videoConstraints = (typeof videoId === 'string' && videoId !== 'default') ? { deviceId: { ideal: videoId } } : (videoId === 'default' ? true : videoId);

    const constraints: MediaStreamConstraints = {
      audio: audioConstraints as boolean | MediaTrackConstraints,
      video: videoConstraints as boolean | MediaTrackConstraints,
    };

    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (e) {
      console.error('Failed to get local stream:', e);
      return await navigator.mediaDevices.getUserMedia({ 
        audio: !!audioId, 
        video: !!videoId 
      });
    }
  },

  stopStream(stream: MediaStream | null) {
    if (!stream) return;
    stream.getTracks().forEach(track => track.stop());
  },

  createSpeakingDetector(stream: MediaStream, onSpeakingChange: (speaking: boolean) => void) {
    const AudioContextClass = (window.AudioContext || (window as any).webkitAudioContext);
    const audioContext = new AudioContextClass();
    
    const source = audioContext.createMediaStreamSource(stream);
    const analyzer = audioContext.createAnalyser();
    analyzer.fftSize = 512;
    source.connect(analyzer);

    const dataArray = new Uint8Array(analyzer.frequencyBinCount);
    let speaking = false;
    let silenceFrames = 0;

    const check = () => {
      if (audioContext.state === 'suspended') {
        audioContext.resume();
      }
      
      analyzer.getByteFrequencyData(dataArray);
      const volume = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
// ... (rest remains same)      
      const isCurrentlySpeaking = volume > 30; // Threshold
      
      if (isCurrentlySpeaking) {
        if (!speaking) {
          speaking = true;
          onSpeakingChange(true);
        }
        silenceFrames = 0;
      } else {
        silenceFrames++;
        if (speaking && silenceFrames > 20) { // Approx 300ms of silence
          speaking = false;
          onSpeakingChange(false);
        }
      }

      if (audioContext.state !== 'closed') {
        requestAnimationFrame(check);
      }
    };

    check();
    return () => audioContext.close();
  }
};
