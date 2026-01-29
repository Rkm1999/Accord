-- Update message channel references to use UUIDs
-- Migration 0016_update_message_channel_refs.sql

-- Backup existing messages (in case we need to restore)
-- Note: Messages were deleted in migration 0015, so this will restore them

-- Restore messages with new channel UUIDs
UPDATE messages
SET channel_id = c.uuid
FROM channels c
WHERE messages.channel_id = c.id;

-- Verify all messages now have valid channel UUIDs
SELECT 'Total messages:' as info;
SELECT COUNT(*) as total FROM messages;

SELECT 'Messages with valid channel references:' as info;
SELECT COUNT(*) as valid FROM messages
WHERE channel_id IN (SELECT uuid FROM channels);

SELECT 'Messages with invalid channel references:' as info;
SELECT COUNT(*) as invalid FROM messages
WHERE channel_id NOT IN (SELECT uuid FROM channels);

SELECT 'Sample messages with new channel UUIDs:' as info;
SELECT
    id,
    channel_id,
    author,
    substr(content, 1, 50) as content_preview
FROM messages
ORDER BY timestamp DESC
LIMIT 5;
