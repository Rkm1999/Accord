import { useState, useEffect } from 'react';
import { useVoiceStore } from '@/store/useVoiceStore';
import { X, Check, Volume2 } from 'lucide-react';
import { useUIStore } from '@/store/useUIStore';

export const TtsVoiceSettingsModal = () => {
  const { preferredVoiceName, setPreferredVoiceName } = useVoiceStore();
  const { closeModal } = useUIStore();
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    const loadVoices = () => {
      const availableVoices = window.speechSynthesis.getVoices();
      // Sort: Premium/Online first, then by language
      const sorted = [...availableVoices].sort((a, b) => {
        const premiumKeywords = ['Google', 'Online', 'Natural', 'Enhanced', 'Neural', 'Siri'];
        const aScore = premiumKeywords.reduce((acc, key) => acc + (a.name.includes(key) ? 1 : 0), 0);
        const bScore = premiumKeywords.reduce((acc, key) => acc + (b.name.includes(key) ? 1 : 0), 0);
        if (bScore !== aScore) return bScore - aScore;
        return a.lang.localeCompare(b.lang);
      });
      setVoices(sorted);
    };

    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  const handleTestVoice = (voice: SpeechSynthesisVoice) => {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance("안녕하세요. Hello. こんにちは. 123.");
    utterance.voice = voice;
    utterance.lang = voice.lang;
    window.speechSynthesis.speak(utterance);
  };

  // Grouping logic
  const groupedVoices = voices.reduce((acc, voice) => {
    const lang = voice.lang;
    if (!acc[lang]) acc[lang] = [];
    acc[lang].push(voice);
    return acc;
  }, {} as Record<string, SpeechSynthesisVoice[]>);

  // Sorting languages (English and Korean first as they are most common for the user)
  const sortedLangs = Object.keys(groupedVoices).sort((a, b) => {
    if (a.startsWith('ko')) return -1;
    if (b.startsWith('ko')) return 1;
    if (a.startsWith('en')) return -1;
    if (b.startsWith('en')) return 1;
    return a.localeCompare(b);
  });

  return (
    <div className="flex flex-col h-full max-h-[80vh] w-[90vw] max-w-lg bg-accord-dark-300 rounded-lg overflow-hidden shadow-2xl">
      <div className="flex items-center justify-between p-4 border-b border-accord-dark-100">
        <h2 className="text-xl font-bold text-white">TTS Voice Settings</h2>
        <button onClick={closeModal} className="text-accord-text-muted hover:text-white transition-colors">
          <X className="w-6 h-6" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
        <div 
          onClick={() => setPreferredVoiceName(null)}
          className={`flex items-center justify-between p-3 rounded cursor-pointer transition-colors border-2 ${
            preferredVoiceName === null ? 'bg-accord-dark-100 border-accord-blurple text-white' : 'text-accord-text-muted border-transparent hover:bg-accord-dark-200'
          }`}
        >
          <div className="flex flex-col">
            <span className="font-bold">Auto-select (Smart)</span>
            <span className="text-xs opacity-70">Dynamically switches voices based on message language (Recommended)</span>
          </div>
          {preferredVoiceName === null && <Check className="w-5 h-5 text-accord-green" />}
        </div>

        {sortedLangs.map(lang => (
          <div key={lang} className="space-y-1">
            <h3 className="text-[11px] font-bold text-accord-text-muted uppercase tracking-wider ml-1 mb-2">{lang}</h3>
            <div className="grid grid-cols-1 gap-1">
              {groupedVoices[lang].map((voice) => {
                const isPremium = ['Google', 'Online', 'Natural', 'Enhanced', 'Neural', 'Siri'].some(key => voice.name.includes(key));
                const isSelected = preferredVoiceName === voice.name;

                return (
                  <div 
                    key={voice.name}
                    onClick={() => setPreferredVoiceName(voice.name)}
                    className={`flex items-center justify-between p-2 rounded cursor-pointer group transition-colors ${
                      isSelected ? 'bg-accord-dark-100 text-white' : 'text-accord-text-muted hover:bg-accord-dark-200'
                    }`}
                  >
                    <div className="flex flex-col flex-1 truncate mr-2">
                      <div className="flex items-center gap-2">
                        <span className="font-bold truncate text-sm">{voice.name.split(' (')[0]}</span>
                        {isPremium && (
                          <span className="text-[9px] px-1 bg-accord-green/20 text-accord-green rounded font-bold uppercase tracking-tighter">Premium</span>
                        )}
                      </div>
                      <span className="text-[10px] opacity-60 truncate">
                        {voice.localService ? 'Local Model' : 'Cloud Model'} • {voice.name}
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-1">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          handleTestVoice(voice);
                        }}
                        className="p-1.5 rounded hover:bg-accord-dark-400 text-accord-text-normal"
                        title="Test"
                      >
                        <Volume2 className="w-4 h-4" />
                      </button>
                      {isSelected && <Check className="w-4 h-4 text-accord-green" />}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
