import React, { useState, useEffect, useRef } from 'react';
import { X, Camera, Bell, ChevronRight, Copy, LogOut, Mic, Volume2, Video } from 'lucide-react';
import { useUIStore } from '@/store/useUIStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useVoiceStore } from '@/store/useVoiceStore';
import { apiClient } from '@/lib/api';
import { isLocalDev } from '@/lib/config';
import { deviceManager } from '@/lib/devices';
import { clsx } from 'clsx';

export const ProfileModal = () => {
  const { closeModal, openModal } = useUIStore();
  const { username, displayName, avatarKey, setAuth, logout } = useAuthStore();
  
  const [activeTab, setActiveTab] = useState<'account' | 'voice'>('account');
  const [newDisplayName, setNewDisplayName] = useState(displayName || '');
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [newRecoveryKey, setNewRecoveryKey] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Voice State
  const { 
    audioInputId, setAudioInputId, 
    videoInputId, setVideoInputId,
    audioOutputId, setAudioOutputId
  } = useVoiceStore();
  
  const [devices, setDevices] = useState<{
    audioInputs: MediaDeviceInfo[],
    videoInputs: MediaDeviceInfo[],
    audioOutputs: MediaDeviceInfo[]
  }>({ audioInputs: [], videoInputs: [], audioOutputs: [] });

  const [previewStream, setPreviewStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (activeTab === 'voice') {
      deviceManager.getDevices().then(setDevices);
    } else {
      stopPreview();
    }
    return () => stopPreview();
  }, [activeTab]);

  useEffect(() => {
    if (previewStream && videoRef.current) {
      videoRef.current.srcObject = previewStream;
    }
  }, [previewStream]);

  const stopPreview = () => {
    if (previewStream) {
      previewStream.getTracks().forEach(t => t.stop());
      setPreviewStream(null);
    }
  };

  const handleStartCameraPreview = async () => {
    stopPreview();
    const stream = await deviceManager.getLocalStream(audioInputId, videoInputId);
    setPreviewStream(stream);
  };

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
        className="bg-accord-dark-300 rounded-lg max-w-lg w-full shadow-2xl border border-accord-dark-100 overflow-hidden animate-slide-in flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="p-6 border-b border-accord-dark-100">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-xl text-white">User Settings</h3>
            <button onClick={closeModal} className="text-accord-text-muted hover:text-white">
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-4">
            <button 
              onClick={() => setActiveTab('account')}
              className={clsx(
                "pb-2 px-1 text-sm font-semibold transition-colors border-b-2",
                activeTab === 'account' ? "text-white border-accord-blurple" : "text-accord-text-muted border-transparent hover:text-accord-text-normal"
              )}
            >
              My Account
            </button>
            <button 
              onClick={() => setActiveTab('voice')}
              className={clsx(
                "pb-2 px-1 text-sm font-semibold transition-colors border-b-2",
                activeTab === 'voice' ? "text-white border-accord-blurple" : "text-accord-text-muted border-transparent hover:text-accord-text-normal"
              )}
            >
              Voice & Video
            </button>
          </div>
        </div>

        <div className="p-6 overflow-y-auto custom-scrollbar">
          {activeTab === 'account' ? (
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
          ) : (
            <div className="space-y-6 animate-slide-in">
              {/* Security Warning for iOS/Mobile */}
              {!window.isSecureContext && (
                <div className="bg-accord-yellow/10 border border-accord-yellow/50 p-3 rounded-lg text-accord-yellow text-xs">
                  <strong>Security Warning:</strong> Media devices require an HTTPS connection or localhost. Access is blocked on this origin.
                </div>
              )}

              {/* Voice Settings Content */}
              <div>
                <label className="block text-xs font-semibold text-accord-text-muted uppercase mb-2">Input Device</label>
                <div className="flex items-center gap-3 bg-accord-dark-600 rounded p-1">
                  <Mic className="w-5 h-5 text-accord-text-muted ml-2" />
                  {devices.audioInputs.length > 0 ? (
                    <select 
                      value={audioInputId}
                      onChange={(e) => setAudioInputId(e.target.value)}
                      className="w-full bg-transparent text-accord-text-normal py-2 focus:outline-none"
                    >
                      {devices.audioInputs.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || `Microphone ${d.deviceId.slice(0,4)}`}</option>)}
                    </select>
                  ) : (
                    <button 
                      onClick={() => deviceManager.getDevices().then(setDevices)}
                      className="w-full text-left bg-transparent text-accord-blurple py-2 font-semibold text-sm"
                    >
                      Grant Permissions to see devices
                    </button>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-accord-text-muted uppercase mb-2">Output Device</label>
                <div className="flex items-center gap-3 bg-accord-dark-600 rounded p-1">
                  <Volume2 className="w-5 h-5 text-accord-text-muted ml-2" />
                  <select 
                    value={audioOutputId}
                    onChange={(e) => setAudioOutputId(e.target.value)}
                    className="w-full bg-transparent text-accord-text-normal py-2 focus:outline-none"
                  >
                    {devices.audioOutputs.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || 'Speaker'}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-accord-text-muted uppercase mb-2">Video Device</label>
                <div className="flex items-center gap-3 bg-accord-dark-600 rounded p-1 mb-4">
                  <Video className="w-5 h-5 text-accord-text-muted ml-2" />
                  <select 
                    value={videoInputId}
                    onChange={(e) => setVideoInputId(e.target.value)}
                    className="w-full bg-transparent text-accord-text-normal py-2 focus:outline-none"
                  >
                    {devices.videoInputs.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || 'Camera'}</option>)}
                  </select>
                </div>

                <div className="bg-accord-dark-600 rounded-lg overflow-hidden relative aspect-video flex items-center justify-center group">
                  {previewStream ? (
                    <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                  ) : (
                    <div className="text-accord-text-muted text-center p-4">
                      <Video className="w-12 h-12 mx-auto mb-2 opacity-20" />
                      <p className="text-sm">Camera preview is off</p>
                    </div>
                  )}
                  <button 
                    onClick={previewStream ? stopPreview : handleStartCameraPreview}
                    className="absolute bottom-4 right-4 bg-accord-blurple hover:bg-[#4752C4] text-white px-4 py-2 rounded font-semibold transition-all shadow-xl"
                  >
                    {previewStream ? 'Stop Preview' : 'Test Camera'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
