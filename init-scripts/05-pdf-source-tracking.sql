-- Migration: Add PDF source tracking to files table
-- This allows tracking which project_file (global PDF) a page file came from

-- Add columns to track source PDF
ALTER TABLE files ADD COLUMN IF NOT EXISTS source_project_file_id INTEGER REFERENCES project_files(id) ON DELETE SET NULL;
ALTER TABLE files ADD COLUMN IF NOT EXISTS source_pdf_page INTEGER;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_files_source_project_file ON files(source_project_file_id);

-- Comment
COMMENT ON COLUMN files.source_project_file_id IS 'Reference to the global PDF file in project_files that this page was extracted from';
COMMENT ON COLUMN files.source_pdf_page IS 'Page number in the source PDF that this file was extracted from';
