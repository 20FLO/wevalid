-- Migration: User preferences
-- Adds sanitize_filenames preference to users table

-- Add sanitize_filenames column with default false
ALTER TABLE users ADD COLUMN IF NOT EXISTS sanitize_filenames BOOLEAN DEFAULT false;

-- Comment for documentation
COMMENT ON COLUMN users.sanitize_filenames IS 'User preference for filename sanitization during upload (remove accents/spaces)';
