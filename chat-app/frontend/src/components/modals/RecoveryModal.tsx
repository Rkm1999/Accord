import { useEffect, useState } from 'react';
import { Copy } from 'lucide-react';

export const RecoveryModal = () => {
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null);

  useEffect(() => {
    const handleShow = (e: any) => setRecoveryKey(e.detail);
    window.addEventListener('accord-show-recovery', handleShow);
    return () => window.removeEventListener('accord-show-recovery', handleShow);
  }, []);

  if (!recoveryKey) return null;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(recoveryKey);
    alert('Recovery Key copied to clipboard!');
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-accord-dark-300 rounded-lg max-w-md w-full shadow-2xl p-6 border border-accord-dark-100">
        <h3 className="text-xl font-bold text-white mb-2 text-center">Save your Recovery Key!</h3>
        <p className="text-accord-text-muted text-sm mb-6 text-center">
          This is the ONLY way to recover your account if you forget your password. We do not store this key.
        </p>
        
        <div className="bg-accord-dark-600 p-4 rounded border border-dashed border-accord-blurple mb-6 flex items-center justify-between">
          <span className="text-2xl font-mono font-bold tracking-widest text-white break-all">{recoveryKey}</span>
          <button 
            onClick={copyToClipboard}
            className="text-accord-text-muted hover:text-white p-2 flex-shrink-0"
          >
            <Copy className="w-5 h-5" />
          </button>
        </div>

        <button 
          onClick={() => setRecoveryKey(null)}
          className="w-full bg-accord-blurple hover:bg-[#4752C4] text-white font-semibold py-2.5 rounded transition-colors"
        >
          I've saved it
        </button>
      </div>
    </div>
  );
};
