-- Migration: Annotation improvements
-- Adds status field, replies table, and version tracking

-- Add status field to annotations (replacing simple resolved boolean)
ALTER TABLE annotations
ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'open';

-- Add status_reason for rejection explanations
ALTER TABLE annotations
ADD COLUMN IF NOT EXISTS status_reason TEXT;

-- Add resolved_in_version to track which file version resolved the annotation
ALTER TABLE annotations
ADD COLUMN IF NOT EXISTS resolved_in_version INTEGER REFERENCES files(id) ON DELETE SET NULL;

-- Add created_in_file_id to track which file version an annotation was created on
ALTER TABLE annotations
ADD COLUMN IF NOT EXISTS created_in_file_id INTEGER REFERENCES files(id) ON DELETE SET NULL;

-- Migrate existing data: resolved=true becomes status='resolved'
UPDATE annotations SET status = 'resolved' WHERE resolved = true AND status IS NULL;
UPDATE annotations SET status = 'open' WHERE resolved = false AND status IS NULL;
UPDATE annotations SET status = 'open' WHERE status IS NULL;

-- Add constraint for valid status values
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'annotation_status_check'
    ) THEN
        ALTER TABLE annotations
        ADD CONSTRAINT annotation_status_check
        CHECK (status IN ('open', 'resolved', 'rejected'));
    END IF;
END $$;

-- Create annotation_replies table for threaded discussions
CREATE TABLE IF NOT EXISTS annotation_replies (
    id SERIAL PRIMARY KEY,
    annotation_id INTEGER NOT NULL REFERENCES annotations(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Index for faster reply lookups
CREATE INDEX IF NOT EXISTS idx_annotation_replies_annotation_id
ON annotation_replies(annotation_id);

-- Comments for documentation
COMMENT ON COLUMN annotations.status IS 'Annotation status: open, resolved, or rejected';
COMMENT ON COLUMN annotations.status_reason IS 'Reason for rejection (when status=rejected)';
COMMENT ON COLUMN annotations.resolved_in_version IS 'File version ID where annotation was resolved';
COMMENT ON COLUMN annotations.created_in_file_id IS 'File version ID where annotation was created';
COMMENT ON TABLE annotation_replies IS 'Threaded replies to annotations';
