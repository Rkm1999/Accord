-- Create DM Rooms registry
CREATE TABLE IF NOT EXISTS dm_rooms (
    id TEXT PRIMARY KEY, -- The DO name/ID (e.g. dm:alice:bob)
    user1 TEXT NOT NULL,
    user2 TEXT NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_dm_rooms_users ON dm_rooms(user1, user2);
