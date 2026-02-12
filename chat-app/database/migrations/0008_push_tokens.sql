CREATE TABLE IF NOT EXISTS push_tokens (
    username TEXT NOT NULL,
    token TEXT NOT NULL,
    platform TEXT DEFAULT 'web',
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (username, token)
);

CREATE INDEX IF NOT EXISTS idx_push_tokens_username ON push_tokens(username);
