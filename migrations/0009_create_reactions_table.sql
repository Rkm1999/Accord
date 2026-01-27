-- Create message_reactions table for persistent reactions
CREATE TABLE IF NOT EXISTS message_reactions (
    message_id TEXT,
    user_id TEXT,
    username TEXT,
    emoji TEXT,
    created_at INTEGER,
    PRIMARY KEY (message_id, username, emoji)
);

-- Index for fast lookup by message
CREATE INDEX IF NOT EXISTS idx_reactions_message_id ON message_reactions(message_id);
