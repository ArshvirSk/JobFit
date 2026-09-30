-- Rename token columns to emphasize they are encrypted at rest
ALTER TABLE user_connectors RENAME COLUMN access_token TO encrypted_access_token;
ALTER TABLE user_connectors RENAME COLUMN refresh_token TO encrypted_refresh_token;

-- Add token_expires_at to track when the access token expires
ALTER TABLE user_connectors ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMP WITH TIME ZONE;
