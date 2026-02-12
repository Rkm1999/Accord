CREATE TABLE notification_settings (
    username TEXT NOT NULL,
    channel_id INTEGER NOT NULL,
    level TEXT NOT NULL DEFAULT 'all', -- 'all', 'mentions', 'none'
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (username, channel_id),
    FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE
);

CREATE INDEX idx_notification_settings_username ON notification_settings(username);
