-- Create table for tracking user read positions per room
CREATE TABLE IF NOT EXISTS user_read_states (
    user_id TEXT NOT NULL,
    room_id TEXT NOT NULL,
    last_read_timestamp INTEGER NOT NULL,
    PRIMARY KEY (user_id, room_id)
);
