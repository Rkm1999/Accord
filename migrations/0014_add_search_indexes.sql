-- Add search optimization indexes for message search
-- Migration 0014_add_search_indexes.sql

-- Performance indexes for common search patterns
CREATE INDEX IF NOT EXISTS idx_messages_timestamp_desc
ON messages(timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_messages_author
ON messages(author);

CREATE INDEX IF NOT EXISTS idx_messages_channel_timestamp
ON messages(channel_id, timestamp DESC);

-- Index for faster channel lookups
CREATE INDEX IF NOT EXISTS idx_messages_channel_id
ON messages(channel_id);