-- Migration: Publishers (Maisons d'édition)
-- Description: Ajout du système de maisons d'édition avec contrôle d'accès

-- Table des maisons d'édition
CREATE TABLE IF NOT EXISTS publishers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Association users <-> publishers (Many-to-Many)
CREATE TABLE IF NOT EXISTS user_publishers (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    publisher_id INTEGER NOT NULL REFERENCES publishers(id) ON DELETE CASCADE,
    role VARCHAR(50) DEFAULT 'member' CHECK (role IN ('admin', 'member')),
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, publisher_id)
);

-- Ajouter colonnes aux projets
ALTER TABLE projects ADD COLUMN IF NOT EXISTS publisher_id INTEGER REFERENCES publishers(id);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS width_mm INTEGER CHECK (width_mm IS NULL OR (width_mm >= 50 AND width_mm <= 1000));
ALTER TABLE projects ADD COLUMN IF NOT EXISTS height_mm INTEGER CHECK (height_mm IS NULL OR (height_mm >= 50 AND height_mm <= 1000));

-- Index pour performance
CREATE INDEX IF NOT EXISTS idx_user_publishers_user ON user_publishers(user_id);
CREATE INDEX IF NOT EXISTS idx_user_publishers_publisher ON user_publishers(publisher_id);
CREATE INDEX IF NOT EXISTS idx_projects_publisher ON projects(publisher_id);

-- Trigger pour updated_at sur publishers
CREATE OR REPLACE FUNCTION update_publishers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS publishers_updated_at ON publishers;
CREATE TRIGGER publishers_updated_at
    BEFORE UPDATE ON publishers
    FOR EACH ROW
    EXECUTE FUNCTION update_publishers_updated_at();
