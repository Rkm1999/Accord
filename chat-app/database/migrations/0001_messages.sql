CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    message TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    link_url TEXT,
    link_title TEXT,
    link_description TEXT,
    link_image TEXT,
    file_name TEXT,
    file_type TEXT,
    file_size INTEGER,
    file_key TEXT,
    reply_to INTEGER REFERENCES messages(id),
    reply_username TEXT,
    reply_message TEXT,
    reply_timestamp INTEGER,
    reply_file_name TEXT,
    reply_file_type TEXT,
    reply_file_size INTEGER,
    reply_file_key TEXT,
    is_edited INTEGER DEFAULT 0,
    edited_at INTEGER,
    channel_id INTEGER REFERENCES channels(id) DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
CREATE INDEX IF NOT EXISTS idx_messages_channel_id ON messages(channel_id);
CREATE INDEX IF NOT EXISTS idx_messages_username ON messages(username);
