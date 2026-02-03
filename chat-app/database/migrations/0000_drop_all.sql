-- Drop tables in correct order (respecting foreign keys)
DROP TABLE IF EXISTS channel_last_read;
DROP TABLE IF EXISTS reactions;
DROP TABLE IF EXISTS custom_emojis;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS messages;
DROP TABLE IF EXISTS channels;
