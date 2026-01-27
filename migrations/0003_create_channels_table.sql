-- Create channels table
CREATE TABLE IF NOT EXISTS channels (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT DEFAULT 'text',
    created_at INTEGER
);

-- Insert default channel
INSERT OR IGNORE INTO channels (id, name, type, created_at) 
VALUES ('general', 'general', 'text', 0);
