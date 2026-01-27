-- Migration for notification queue
CREATE TABLE notification_queue (
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    url TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    PRIMARY KEY (user_id)
);
