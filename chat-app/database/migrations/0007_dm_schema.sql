ALTER TABLE channels ADD COLUMN type TEXT DEFAULT 'public';

CREATE TABLE channel_members (
    channel_id INTEGER NOT NULL,
    username TEXT NOT NULL,
    joined_at INTEGER NOT NULL,
    PRIMARY KEY (channel_id, username),
    FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE
);

CREATE INDEX idx_channel_members_username ON channel_members(username);
