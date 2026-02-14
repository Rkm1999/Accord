-- Optimization: Covering index for channel history queries
-- This includes the most common columns used in the feed to avoid table lookups
CREATE INDEX idx_messages_history_v2 ON messages (channel_id, timestamp DESC, id, username, message, file_key, reply_to);
