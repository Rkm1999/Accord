CREATE TABLE IF NOT EXISTS auth_attempts (
    ip TEXT PRIMARY KEY,
    attempts INTEGER,
    last_attempt INTEGER
);
