export interface User {
  username: string;
  display_name?: string;
  avatar_key?: string;
  status?: 'online' | 'offline' | 'idle' | 'dnd';
}

export interface Channel {
  id: number;
  name: string;
  type: 'public' | 'dm';
  kind: 'text' | 'voice';
  created_by?: string;
  // For DMs
  other_username?: string;
  other_display_name?: string;
  other_avatar_key?: string;
}

export interface Attachment {
  name: string;
  type: string;
  size: number;
  key: string;
  isSpoiler: boolean;
}

export interface LinkMetadata {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  isSpoiler: boolean;
}

export interface Reaction {
  emoji: string;
  username: string;
}

export interface Message {
  id: number;
  channel_id: number;
  username: string;
  message: string;
  timestamp: string | number;
  is_edited?: boolean;
  is_spoiler?: boolean;
  
  // UI Helpers (derived or from server)
  displayName?: string;
  display_name?: string;
  avatarKey?: string;
  user_avatar?: string;
  
  // Relationships
  reply_to?: number;
  reply_username?: string;
  reply_message?: string;
  reply_file_name?: string;
  
  mentions?: string[];
  reactions?: Reaction[];
  
  fileAttachment?: Attachment;
  linkMetadata?: LinkMetadata;

  // Flat DB fields
  link_url?: string;
  link_title?: string;
  link_description?: string;
  link_image?: string;
  
  file_name?: string;
  file_type?: string;
  file_size?: number;
  file_key?: string;
}

export interface CustomEmoji {
  name: string;
  file_key: string;
  uploaded_by?: string;
}

export interface NotificationSetting {
  channel_id: number;
  level: 'all' | 'simple' | 'mentions' | 'none';
}
