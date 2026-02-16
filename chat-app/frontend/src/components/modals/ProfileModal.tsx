import React, { useState } from 'react';
import { X, Camera, Bell, ChevronRight, Copy, LogOut } from 'lucide-react';
import { useUIStore } from '@/store/useUIStore';
import { useAuthStore } from '@/store/useAuthStore';
import { apiClient } from '@/lib/api';
import { isLocalDev } from '@/lib/config';

export const ProfileModal = () => {
  const { closeModal, openModal } = useUIStore();
  const { username, displayName, avatarKey, setAuth, logout } = useAuthStore();
  
  const [newDisplayName, setNewDisplayName] = useState(displayName || '');
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [newRecoveryKey, setNewRecoveryKey] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAvatarFile(file);
      setAvatarPreview(URL.createObjectURL(file));
    }
  };

  const handleUpdate = async () => {
    setIsLoading(true);
    try {
      let avatarImage = null;
      if (avatarFile) {
        avatarImage = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.readAsDataURL(avatarFile);
        });
      }

      const result = await apiClient.updateProfile({
        username: username!,
        displayName: newDisplayName,
        avatarImage
      });

      setAuth({
        username: username!,
        displayName: newDisplayName,
        avatarKey: result.avatarKey || avatarKey || undefined
      });

      alert('Profile updated!');
      closeModal();
    } catch (error) {
      alert('Failed to update profile');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegenerateKey = async () => {
    if (!confirm('This will invalidate your old recovery key. Are you sure?')) return;
    try {
      const result = await apiClient.updateProfile({
        username: username!,
        displayName: newDisplayName,
        generateNewRecoveryKey: true
      });
      setNewRecoveryKey(result.newRecoveryKey || null);
    } catch (error) {
      alert('Failed to regenerate key');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={closeModal}>
      <div 
        className="bg-accord-dark-300 rounded-lg max-w-md w-full shadow-2xl border border-accord-dark-100 overflow-hidden animate-slide-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-bold text-xl text-white">User Settings</h3>
            <button onClick={closeModal} className="text-accord-text-muted hover:text-white">
              <X className="w-6 h-6" />
            </button>
          </div>

          <div className="space-y-6">
            {/* Avatar Upload */}
            <div className="flex flex-col items-center">
              <div 
                className="relative group cursor-pointer"
                onClick={() => document.getElementById('avatar-input')?.click()}
              >
                <img 
                  src={avatarPreview || (avatarKey ? (isLocalDev ? `http://localhost:8787/api/file/${avatarKey}` : `/api/file/${avatarKey}`) : `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName || '')}&background=random`)}
                  className="w-24 h-24 rounded-full object-cover border-4 border-accord-dark-600"
                />
                <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <Camera className="w-8 h-8 text-white" />
                </div>
              </div>
              <input type="file" id="avatar-input" className="hidden" accept="image/*" onChange={handleAvatarChange} />
              <p className="text-xs text-accord-text-muted mt-2">Click to change avatar</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-accord-text-muted uppercase mb-2">Display Name</label>
              <input 
                type="text" 
                value={newDisplayName}
                onChange={(e) => setNewDisplayName(e.target.value)}
                className="w-full bg-accord-dark-600 text-accord-text-normal rounded px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-accord-blurple"
              />
            </div>

            <div 
              onClick={() => openModal('notificationSettings')}
              className="flex items-center justify-between p-3 bg-accord-dark-600 rounded cursor-pointer hover:bg-accord-dark-100 transition-colors"
            >
              <div className="flex items-center gap-3">
                <Bell className="w-5 h-5 text-accord-text-muted" />
                <div className="flex flex-col">
                  <span className="text-sm font-semibold text-accord-text-normal">Notification Settings</span>
                  <span className="text-xs text-accord-text-muted">Manage channel alerts</span>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-accord-text-muted" />
            </div>

            <div className="pt-4 border-t border-accord-dark-100 flex flex-col space-y-3">
              {newRecoveryKey && (
                <div className="bg-accord-dark-600 p-3 rounded border border-dashed border-accord-blurple">
                  <p className="text-[10px] text-accord-text-muted uppercase font-bold mb-1">New Recovery Key</p>
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-white tracking-wider">{newRecoveryKey}</span>
                    <button 
                      onClick={() => navigator.clipboard.writeText(newRecoveryKey)}
                      className="text-accord-text-muted hover:text-white"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              <div className="flex space-x-3">
                <button 
                  onClick={handleRegenerateKey}
                  className="flex-1 bg-blue-500/10 hover:bg-blue-500/20 text-[#00A8FC] py-2 rounded transition-colors font-medium text-sm"
                >
                  Regenerate Key
                </button>
                <button 
                  onClick={() => { if (confirm('Logout?')) logout(); }}
                  className="flex-1 bg-red-500/10 hover:bg-red-500/20 text-accord-red py-2 rounded transition-colors font-medium text-sm flex items-center justify-center gap-2"
                >
                  <LogOut className="w-4 h-4" /> Logout
                </button>
              </div>
              <button 
                onClick={handleUpdate}
                disabled={isLoading}
                className="btn-ripple w-full bg-accord-blurple hover:bg-[#4752C4] text-white font-semibold py-2.5 rounded transition-colors disabled:opacity-50"
              >
                {isLoading ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
