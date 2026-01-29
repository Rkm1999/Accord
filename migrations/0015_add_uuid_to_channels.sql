-- Add uuid column to channels table
-- Migration 0015_add_uuid_to_channels.sql

-- Add uuid column without UNIQUE constraint first
ALTER TABLE channels ADD COLUMN uuid TEXT;

-- Generate UUIDs for existing channels using hex()
UPDATE channels SET uuid = lower(hex(randomblob(16)))
WHERE uuid IS NULL;

-- Add UNIQUE constraint
CREATE UNIQUE INDEX IF NOT EXISTS idx_channels_uuid_unique ON channels(uuid);

-- Create index for lookups
CREATE INDEX IF NOT EXISTS idx_channels_uuid ON channels(uuid);

-- Delete orphaned messages (no matching channel)
DELETE FROM messages
WHERE channel_id NOT IN (SELECT uuid FROM channels);

-- Verify migration
SELECT 'Channels with UUIDs:' as info;
SELECT id, name, uuid FROM channels;

SELECT 'Message count after cleanup:' as info;
SELECT COUNT(*) as message_count FROM messages;

SELECT 'Orphaned messages:' as info;
SELECT COUNT(*) as orphaned FROM messages
WHERE channel_id NOT IN (SELECT uuid FROM channels);
