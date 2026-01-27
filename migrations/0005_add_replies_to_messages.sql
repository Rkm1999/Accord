-- Add reply fields to messages table
ALTER TABLE messages ADD COLUMN reply_to_id TEXT;
ALTER TABLE messages ADD COLUMN reply_to_author TEXT;
ALTER TABLE messages ADD COLUMN reply_to_content TEXT;
