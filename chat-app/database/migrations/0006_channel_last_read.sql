CREATE TABLE IF NOT EXISTS channel_last_read (
    username TEXT NOT NULL,
    channel_id INTEGER NOT NULL,
    message_id INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (username, channel_id)
);
