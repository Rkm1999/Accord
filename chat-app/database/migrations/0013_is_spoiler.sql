-- Add is_spoiler column to messages table
ALTER TABLE messages ADD COLUMN is_spoiler INTEGER DEFAULT 0;
