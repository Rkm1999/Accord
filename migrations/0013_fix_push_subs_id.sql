-- Migration to fix push_subscriptions table (adding id column)
CREATE TABLE push_subscriptions_new (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at INTEGER,
    UNIQUE(user_id, endpoint)
);

-- Note: We don't copy old data because the schema of keys might have changed between strategies
-- If we wanted to: INSERT INTO push_subscriptions_new (id, user_id, endpoint, p256dh, auth, created_at) SELECT ...

DROP TABLE push_subscriptions;
ALTER TABLE push_subscriptions_new RENAME TO push_subscriptions;

CREATE INDEX IF NOT EXISTS idx_push_subs_user ON push_subscriptions(user_id);
