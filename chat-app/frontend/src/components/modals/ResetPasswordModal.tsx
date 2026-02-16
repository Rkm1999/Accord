import React, { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api';

export const ResetPasswordModal = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [username, setUsername] = useState('');
  const [recoveryKey, setRecoveryKey] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const handleOpen = () => setIsOpen(true);
    window.addEventListener('accord-open-reset', handleOpen);
    return () => window.removeEventListener('accord-open-reset', handleOpen);
  }, []);

  if (!isOpen) return null;

  const handleKeyInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (value.length > 12) value = value.slice(0, 12);

    let formatted = '';
    for (let i = 0; i < value.length; i++) {
      if (i > 0 && i % 4 === 0) formatted += '-';
      formatted += value[i];
    }
    setRecoveryKey(formatted);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !recoveryKey || !newPassword) return;

    setIsLoading(true);
    try {
      await apiClient.resetPassword(username, recoveryKey, newPassword);
      alert('Password reset successful! You can now login with your new password.');
      setIsOpen(false);
    } catch (error: any) {
      alert(error.message || 'Reset failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-accord-dark-300 rounded-lg max-w-md w-full mx-4 shadow-2xl p-6 border border-accord-dark-100">
        <h3 className="text-xl font-bold text-white mb-4 text-center">Reset Password</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-accord-text-muted uppercase mb-2">USERNAME</label>
            <input 
              type="text" 
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required 
              className="w-full bg-accord-dark-600 text-accord-text-normal rounded px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-accord-blurple"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-accord-text-muted uppercase mb-2">RECOVERY KEY</label>
            <input 
              type="text" 
              value={recoveryKey}
              onChange={handleKeyInput}
              placeholder="ABCD-1234-EFGH" 
              required 
              className="w-full bg-accord-dark-600 text-accord-text-normal rounded px-3 py-2.5 focus:outline-none font-mono tracking-wider focus:ring-2 focus:ring-accord-blurple"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-accord-text-muted uppercase mb-2">NEW PASSWORD</label>
            <input 
              type="password" 
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required 
              className="w-full bg-accord-dark-600 text-accord-text-normal rounded px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-accord-blurple"
            />
          </div>
          <div className="flex space-x-3 pt-2">
            <button 
              type="button" 
              onClick={() => setIsOpen(false)}
              className="flex-1 bg-transparent hover:underline text-accord-text-muted"
            >
              Cancel
            </button>
            <button 
              type="submit" 
              disabled={isLoading}
              className="btn-ripple flex-1 bg-accord-blurple hover:bg-[#4752C4] text-white font-semibold py-2 rounded transition-colors disabled:opacity-50"
            >
              {isLoading ? 'Resetting...' : 'Reset'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
