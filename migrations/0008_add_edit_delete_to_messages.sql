-- Add is_edited and is_deleted flags to messages table
ALTER TABLE messages ADD COLUMN is_edited INTEGER DEFAULT 0;
ALTER TABLE messages ADD COLUMN is_deleted INTEGER DEFAULT 0;
