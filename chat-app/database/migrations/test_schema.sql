-- Test functions to verify database schema

-- Test 1: Check if all tables exist
SELECT name AS table_name, type 
FROM sqlite_master 
WHERE type='table' AND name IN ('messages', 'channels', 'users', 'reactions', 'custom_emojis', 'channel_last_read')
ORDER BY name;

-- Test 2: Check messages table structure
PRAGMA table_info(messages);

-- Test 3: Check channels table structure
PRAGMA table_info(channels);

-- Test 4: Check users table structure
PRAGMA table_info(users);

-- Test 5: Check reactions table structure
PRAGMA table_info(reactions);

-- Test 6: Check custom_emojis table structure
PRAGMA table_info(custom_emojis);

-- Test 7: Check channel_last_read table structure
PRAGMA table_info(channel_last_read);

-- Test 8: Check all indexes
SELECT name AS index_name, tbl_name AS table_name 
FROM sqlite_master 
WHERE type='index' 
ORDER BY tbl_name, name;

-- Test 9: Check foreign keys on messages table
PRAGMA foreign_key_list(messages);

-- Test 10: Check foreign keys on reactions table
PRAGMA foreign_key_list(reactions);

-- Test 11: Verify default channel exists
SELECT * FROM channels;

-- Test 12: Check unique constraints
SELECT name FROM pragma_index_list('channels') WHERE origin='u';

-- Test 13: Test inserting a sample message (should succeed)
INSERT INTO messages (username, message, timestamp, channel_id) 
VALUES ('test_user', 'Test message', 1234567890, 1);

-- Test 14: Test inserting a sample user (should succeed)
INSERT INTO users (username, password_hash, display_name, created_at) 
VALUES ('test_user', 'hash123', 'Test User', 1234567890);

-- Test 15: Test inserting a sample reaction (should succeed)
INSERT INTO reactions (message_id, username, emoji, created_at) 
VALUES (1, 'test_user', '👍', 1234567890);

-- Test 16: Test inserting a sample custom emoji (should succeed)
INSERT INTO custom_emojis (name, file_key, created_by, created_at) 
VALUES ('test_emoji', 'emoji1.png', 'test_user', 1234567890);

-- Test 17: Test inserting a sample channel last read (should succeed)
INSERT INTO channel_last_read (username, channel_id, message_id, updated_at) 
VALUES ('test_user', 1, 1, 1234567890);

-- Test 18: Clean up test data
DELETE FROM channel_last_read WHERE username = 'test_user';
DELETE FROM reactions WHERE username = 'test_user';
DELETE FROM custom_emojis WHERE name = 'test_emoji';
DELETE FROM messages WHERE username = 'test_user';
DELETE FROM users WHERE username = 'test_user';

-- Test 19: Verify foreign key cascade works
INSERT INTO messages (username, message, timestamp, channel_id) VALUES ('test_user', 'Parent message', 1234567890, 1);
INSERT INTO reactions (message_id, username, emoji, created_at) VALUES (1, 'test_user', '👍', 1234567890);
DELETE FROM messages WHERE id = 1;
SELECT COUNT(*) as remaining_reactions FROM reactions WHERE message_id = 1;

-- Test 20: Check table row counts
SELECT 'messages' as table_name, COUNT(*) as row_count FROM messages
UNION ALL
SELECT 'channels', COUNT(*) FROM channels
UNION ALL
SELECT 'users', COUNT(*) FROM users
UNION ALL
SELECT 'reactions', COUNT(*) FROM reactions
UNION ALL
SELECT 'custom_emojis', COUNT(*) FROM custom_emojis
UNION ALL
SELECT 'channel_last_read', COUNT(*) FROM channel_last_read;
