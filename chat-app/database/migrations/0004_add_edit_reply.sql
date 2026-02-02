ALTER TABLE messages ADD COLUMN reply_to TEXT;
ALTER TABLE messages ADD COLUMN reply_username TEXT;
ALTER TABLE messages ADD COLUMN reply_message TEXT;
ALTER TABLE messages ADD COLUMN reply_timestamp INTEGER;
ALTER TABLE messages ADD COLUMN is_edited INTEGER DEFAULT 0;
ALTER TABLE messages ADD COLUMN edited_at INTEGER;
