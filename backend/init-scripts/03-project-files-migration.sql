-- Migration: Fichiers projet + Dashboard
-- À exécuter sur le NAS: docker exec -i wevalid-db psql -U wevalid_user -d wevalid_prod < init-scripts/03-project-files-migration.sql

-- Table des fichiers projet (séparée des fichiers pages)
CREATE TABLE IF NOT EXISTS project_files (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    filename VARCHAR(255) NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    file_type VARCHAR(100),
    file_size BIGINT,
    category VARCHAR(50) DEFAULT 'document' CHECK (category IN ('document', 'image', 'reference', 'other')),
    description TEXT,
    version INTEGER DEFAULT 1,
    parent_file_id INTEGER REFERENCES project_files(id) ON DELETE SET NULL,
    uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    uploaded_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Index pour performance
CREATE INDEX IF NOT EXISTS idx_project_files_project ON project_files(project_id);
CREATE INDEX IF NOT EXISTS idx_project_files_category ON project_files(category);
CREATE INDEX IF NOT EXISTS idx_project_files_parent ON project_files(parent_file_id);
CREATE INDEX IF NOT EXISTS idx_project_files_uploaded_at ON project_files(uploaded_at DESC);

-- Fonction pour mettre à jour updated_at automatiquement
CREATE OR REPLACE FUNCTION update_project_files_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger pour updated_at
DROP TRIGGER IF EXISTS trigger_project_files_updated_at ON project_files;
CREATE TRIGGER trigger_project_files_updated_at
    BEFORE UPDATE ON project_files
    FOR EACH ROW
    EXECUTE FUNCTION update_project_files_updated_at();

-- Vue pour stats dashboard (optionnel, peut être fait en query)
CREATE OR REPLACE VIEW project_stats AS
SELECT
    p.id as project_id,
    p.title,
    p.total_pages,
    COUNT(DISTINCT pg.id) as pages_created,
    COUNT(DISTINCT CASE WHEN pg.status IN ('en_maquette', 'maquette_a_valider', 'maquette_validee_photogravure', 'en_peaufinage', 'en_corrections', 'en_bat', 'bat_valide', 'envoye_imprimeur') THEN pg.id END) as pages_in_progress,
    COUNT(DISTINCT CASE WHEN pg.status IN ('bat_valide', 'envoye_imprimeur') THEN pg.id END) as pages_validated,
    COUNT(DISTINCT pf.id) as files_count
FROM projects p
LEFT JOIN pages pg ON pg.project_id = p.id
LEFT JOIN project_files pf ON pf.project_id = p.id
GROUP BY p.id, p.title, p.total_pages;

COMMENT ON TABLE project_files IS 'Fichiers associés au projet (documents Word, images sources, références)';
COMMENT ON COLUMN project_files.category IS 'Type de fichier: document (Word/RTF), image, reference, other';
COMMENT ON COLUMN project_files.version IS 'Numéro de version du fichier';
COMMENT ON COLUMN project_files.parent_file_id IS 'ID du fichier parent pour le versioning';
