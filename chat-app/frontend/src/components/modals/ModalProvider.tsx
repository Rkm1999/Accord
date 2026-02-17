import { useUIStore } from '@/store/useUIStore';
import { CreateChannelModal } from './CreateChannelModal';
import { StartDMModal } from './StartDMModal';
import { SearchModal } from './SearchModal';
import { ImageModal } from './ImageModal';
import { ProfileModal } from './ProfileModal';
import { EmojiUploadModal } from './EmojiUploadModal';
import { UserDetailModal } from './UserDetailModal';
import { NotificationSettingsModal } from './NotificationSettingsModal';
import { TtsVoiceSettingsModal } from './TtsVoiceSettingsModal';

export const ModalProvider = () => {
  const { activeModal } = useUIStore();

  return (
    <>
      {activeModal === 'createChannel' && <CreateChannelModal />}
      {activeModal === 'startDM' && <StartDMModal />}
      {activeModal === 'search' && <SearchModal />}
      {activeModal === 'profile' && <ProfileModal />}
      {activeModal === 'userDetail' && <UserDetailModal />}
      {activeModal === 'notificationSettings' && <NotificationSettingsModal />}
      {activeModal === 'emojiUpload' && <EmojiUploadModal />}
      {activeModal === 'ttsSettings' && <TtsVoiceSettingsModal />}
      <ImageModal />
    </>
  );
};
