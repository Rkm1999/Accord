-- Create messages table for cold storage
CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    channel_id TEXT,
    author TEXT,
    content TEXT,
    timestamp INTEGER
);

-- Index for faster retrieval by channel
CREATE INDEX IF NOT EXISTS idx_messages_channel_id ON messages(channel_id);
