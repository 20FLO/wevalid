-- Wevalid Database Initialization Script

-- Extension pour UUID si besoin
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Table des utilisateurs
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('auteur', 'editeur', 'photograveur', 'fabricant', 'graphiste')),
    is_active BOOLEAN DEFAULT true,
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Index pour recherche rapide
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);

-- Table des projets
CREATE TABLE IF NOT EXISTS projects (
    id SERIAL PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    isbn VARCHAR(17),
    description TEXT,
    total_pages INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(50) DEFAULT 'draft' CHECK (status IN ('draft', 'in_progress', 'bat', 'completed', 'archived')),
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_projects_status ON projects(status);
CREATE INDEX idx_projects_created_by ON projects(created_by);

-- Table des membres de projet
CREATE TABLE IF NOT EXISTS project_members (
    id SERIAL PRIMARY KEY,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    added_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(project_id, user_id)
);

CREATE INDEX idx_project_members_project ON project_members(project_id);
CREATE INDEX idx_project_members_user ON project_members(user_id);

-- Table des pages
CREATE TABLE IF NOT EXISTS pages (
    id SERIAL PRIMARY KEY,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    page_number INTEGER NOT NULL,
    status VARCHAR(50) DEFAULT 'attente_elements' CHECK (status IN (
        'attente_elements',
        'elements_recus',
        'en_maquette',
        'maquette_a_valider',
        'maquette_validee_photogravure',
        'en_peaufinage',
        'en_corrections',
        'en_bat',
        'bat_valide',
        'envoye_imprimeur'
    )),
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(project_id, page_number)
);

CREATE INDEX idx_pages_project ON pages(project_id);
CREATE INDEX idx_pages_status ON pages(status);

-- Table des fichiers
CREATE TABLE IF NOT EXISTS files (
    id SERIAL PRIMARY KEY,
    page_id INTEGER REFERENCES pages(id) ON DELETE CASCADE,
    filename VARCHAR(255) NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    file_path TEXT NOT NULL,
    thumbnail_path TEXT,
    file_type VARCHAR(100) NOT NULL,
    file_size BIGINT NOT NULL,
    uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    uploaded_at TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_files_page ON files(page_id);
CREATE INDEX idx_files_uploaded_by ON files(uploaded_by);

-- Table des annotations
CREATE TABLE IF NOT EXISTS annotations (
    id SERIAL PRIMARY KEY,
    page_id INTEGER REFERENCES pages(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL CHECK (type IN ('comment', 'highlight', 'drawing', 'stamp')),
    content TEXT NOT NULL,
    position JSONB NOT NULL, -- Stocke {x, y, width, height, page_number}
    color VARCHAR(7) DEFAULT '#FFFF00',
    resolved BOOLEAN DEFAULT false,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_annotations_page ON annotations(page_id);
CREATE INDEX idx_annotations_created_by ON annotations(created_by);
CREATE INDEX idx_annotations_resolved ON annotations(resolved);

-- Table de l'historique des workflows
CREATE TABLE IF NOT EXISTS workflow_history (
    id SERIAL PRIMARY KEY,
    page_id INTEGER REFERENCES pages(id) ON DELETE CASCADE,
    from_status VARCHAR(50),
    to_status VARCHAR(50) NOT NULL,
    changed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    notes TEXT,
    changed_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_workflow_history_page ON workflow_history(page_id);
CREATE INDEX idx_workflow_history_changed_at ON workflow_history(changed_at);

-- Table des notifications (optionnel, pour V2)
CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    title VARCHAR(200) NOT NULL,
    message TEXT,
    link TEXT,
    read BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_read ON notifications(read);

-- Fonction pour mettre à jour updated_at automatiquement
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers pour updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_pages_updated_at BEFORE UPDATE ON pages
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_annotations_updated_at BEFORE UPDATE ON annotations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Données de test (optionnel - à commenter en production)
-- Mot de passe par défaut pour tous: "Password123!"
-- Hash bcrypt de "Password123!" avec salt rounds = 12
INSERT INTO users (email, password_hash, first_name, last_name, role) VALUES
    ('editeur@wevalid.com', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5NU7lUlhEe5Fm', 'Marie', 'Dupont', 'editeur'),
    ('auteur@wevalid.com', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5NU7lUlhEe5Fm', 'Jean', 'Martin', 'auteur'),
    ('graphiste@wevalid.com', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5NU7lUlhEe5Fm', 'Sophie', 'Bernard', 'graphiste'),
    ('photograveur@wevalid.com', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5NU7lUlhEe5Fm', 'Pierre', 'Dubois', 'photograveur'),
    ('fabricant@wevalid.com', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5NU7lUlhEe5Fm', 'Claire', 'Leroy', 'fabricant')
ON CONFLICT (email) DO NOTHING;

-- Projet de démonstration
INSERT INTO projects (title, isbn, description, total_pages, status, created_by)
SELECT 
    'Projet Demo - Guide du Photographe',
    '978-2-1234-5678-9',
    'Un guide complet de photographie pour débutants',
    150,
    'in_progress',
    (SELECT id FROM users WHERE email = 'editeur@wevalid.com')
WHERE NOT EXISTS (SELECT 1 FROM projects WHERE title = 'Projet Demo - Guide du Photographe');

-- Ajouter des pages au projet demo
DO $$
DECLARE
    project_id_var INTEGER;
BEGIN
    SELECT id INTO project_id_var FROM projects WHERE title = 'Projet Demo - Guide du Photographe';
    
    IF project_id_var IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pages WHERE project_id = project_id_var) THEN
        FOR i IN 1..150 LOOP
            INSERT INTO pages (project_id, page_number, status)
            VALUES (
                project_id_var, 
                i,
                CASE 
                    WHEN i <= 30 THEN 'bat_valide'
                    WHEN i <= 60 THEN 'en_bat'
                    WHEN i <= 90 THEN 'maquette_validee_photogravure'
                    WHEN i <= 120 THEN 'en_maquette'
                    ELSE 'attente_elements'
                END
            );
        END LOOP;
    END IF;
END $$;

-- Ajouter des membres au projet demo
DO $$
DECLARE
    project_id_var INTEGER;
BEGIN
    SELECT id INTO project_id_var FROM projects WHERE title = 'Projet Demo - Guide du Photographe';
    
    IF project_id_var IS NOT NULL THEN
        INSERT INTO project_members (project_id, user_id)
        SELECT project_id_var, id FROM users
        ON CONFLICT (project_id, user_id) DO NOTHING;
    END IF;
END $$;

-- Commentaire de fin
COMMENT ON DATABASE wevalid_prod IS 'Base de données Wevalid - Plateforme de gestion de production éditoriale';