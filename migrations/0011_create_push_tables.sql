-- Create push_subscriptions table
CREATE TABLE IF NOT EXISTS push_subscriptions (
    user_id TEXT,
    endpoint TEXT PRIMARY KEY,
    p256dh TEXT,
    auth TEXT,
    created_at INTEGER,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Index for faster lookup by user_id
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON push_subscriptions(user_id);

-- Create notification_settings table
CREATE TABLE IF NOT EXISTS notification_settings (
    user_id TEXT,
    room_id TEXT, -- NULL means global setting
    level TEXT DEFAULT 'all', -- 'all', 'mentions', 'mute'
    PRIMARY KEY (user_id, room_id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);
