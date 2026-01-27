-- Create channel_members table
CREATE TABLE IF NOT EXISTS channel_members (
    channel_id TEXT,
    user_id TEXT,
    username TEXT,
    joined_at INTEGER,
    PRIMARY KEY (channel_id, user_id)
);

-- Index for faster lookup by channel
CREATE INDEX IF NOT EXISTS idx_channel_members_channel_id ON channel_members(channel_id);
