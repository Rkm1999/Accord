import { X, Bell, HelpCircle, Hash } from 'lucide-react';
import { useUIStore } from '@/store/useUIStore';
import { useChatStore } from '@/store/useChatStore';
import { useAuthStore } from '@/store/useAuthStore';
import { apiClient } from '@/lib/api';
import { togglePushNotifications } from '@/lib/push';
import { clsx } from 'clsx';
import { useState, useEffect } from 'react';

export const NotificationSettingsModal = () => {
  const { closeModal } = useUIStore();
  const { fcmToken } = useAuthStore();
  const { 
    channels, notificationSettings, setNotificationSettings 
  } = useChatStore();

  const [pushEnabled, setPushEnabled] = useState(false);

  useEffect(() => {
    const isEnabled = localStorage.getItem('pushEnabled') !== 'false' && !!fcmToken;
    setPushEnabled(isEnabled && Notification.permission === 'granted');
  }, [fcmToken]);

  const handleTogglePush = async (enabled: boolean) => {
    await togglePushNotifications(enabled);
    setPushEnabled(enabled && Notification.permission === 'granted');
  };

  const handleLevelChange = async (channelId: number, level: string) => {
    try {
      await apiClient.updateNotificationSettings(channelId, level);
      const updated = await apiClient.fetchNotificationSettings();
      setNotificationSettings(updated);
    } catch (error) {
      console.error('Failed to update notification level');
    }
  };

  const showHelp = () => {
    alert(`Notification Levels:

• SIMPLE (Default): A single generic alert ("New Message") per channel until you read it.
• ALL: Detailed alerts for every single message.
• MENTIONS: Only notify if you are specifically tagged.
• NONE: Mute all push notifications.`);
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[200] p-4" onClick={closeModal}>
      <div 
        className="bg-accord-dark-300 rounded-lg max-w-lg w-full shadow-2xl border border-accord-dark-100 overflow-hidden animate-slide-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-accord-dark-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="w-6 h-6 text-accord-blurple" />
            <h3 className="font-bold text-xl text-white">Notification Settings</h3>
            <button 
              onClick={showHelp}
              className="text-accord-text-muted hover:text-white transition-colors ml-1"
            >
              <HelpCircle className="w-4 h-4" />
            </button>
          </div>
          <button onClick={closeModal} className="text-accord-text-muted hover:text-white">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 max-h-[60vh] overflow-y-auto custom-scrollbar space-y-6">
          {/* Global Toggle */}
          <div>
            <h4 className="text-[10px] font-bold uppercase text-accord-text-muted mb-3 tracking-wider">Global Settings</h4>
            <div className="flex items-center justify-between p-3 bg-accord-dark-400 rounded-lg border border-accord-dark-100">
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-accord-text-normal">Push Notifications</span>
                <span className="text-[11px] text-accord-text-muted">Enable browser notifications for this device</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={pushEnabled}
                  onChange={(e) => handleTogglePush(e.target.checked)}
                  className="sr-only peer" 
                />
                <div className="w-11 h-6 bg-accord-dark-100 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accord-green"></div>
              </label>
            </div>
          </div>

          {/* Channel Settings */}
          <div>
            <h4 className="text-[10px] font-bold uppercase text-accord-text-muted mb-3 tracking-wider">Channel Overrides</h4>
            <div className="space-y-2">
              {channels.map((channel) => {
                const setting = notificationSettings.find(s => s.channel_id === channel.id);
                const currentLevel = setting?.level || 'simple';

                return (
                  <div key={channel.id} className="p-3 bg-accord-dark-400 rounded-lg border border-accord-dark-100">
                    <div className="flex items-center gap-2 mb-3">
                      <Hash className="w-4 h-4 text-accord-text-muted" />
                      <span className="font-bold text-white text-sm">{channel.name}</span>
                    </div>
                    <div className="flex gap-1 bg-accord-dark-600 p-1 rounded-md">
                      {['all', 'simple', 'mentions', 'none'].map((level) => (
                        <button
                          key={level}
                          onClick={() => handleLevelChange(channel.id, level)}
                          className={clsx(
                            "flex-1 text-[10px] font-bold py-1.5 rounded transition-all",
                            currentLevel === level 
                              ? "bg-accord-blurple text-white" 
                              : "text-accord-text-muted hover:bg-accord-dark-100"
                          )}
                        >
                          {level.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="p-6 bg-accord-dark-500 flex justify-end">
          <button 
            onClick={closeModal}
            className="bg-accord-blurple hover:bg-[#4752C4] text-white px-6 py-2 rounded font-semibold transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
