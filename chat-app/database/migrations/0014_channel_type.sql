-- Migration to add channel kind (text vs voice)
-- Using 'kind' because 'type' is already used for public vs dm
ALTER TABLE channels ADD COLUMN kind TEXT DEFAULT 'text';
