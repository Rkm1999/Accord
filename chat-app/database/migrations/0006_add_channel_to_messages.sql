ALTER TABLE messages ADD COLUMN channel_id INTEGER REFERENCES channels(id) DEFAULT 1;
UPDATE messages SET channel_id = 1 WHERE channel_id IS NULL;
