-- Migration: Add new page statuses (dernieres_corrections, envoye_imprimeur)
-- Also add admin role support

-- Step 1: Drop the existing constraint on pages.status
ALTER TABLE pages DROP CONSTRAINT IF EXISTS pages_status_check;

-- Step 2: Add new constraint with all statuses
ALTER TABLE pages ADD CONSTRAINT pages_status_check CHECK (status IN (
    'attente_elements',
    'elements_recus',
    'ok_pour_maquette',
    'en_maquette',
    'maquette_a_valider',
    'maquette_validee_photogravure',
    'en_peaufinage',
    'en_corrections',
    'pour_corrections',
    'en_bat',
    'bat_valide',
    'dernieres_corrections',
    'envoye_imprimeur'
));

-- Step 3: Update users role constraint to include admin
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN (
    'admin',
    'auteur',
    'editeur',
    'photograveur',
    'fabricant',
    'graphiste'
));

-- Step 4: Add index for faster status lookups
CREATE INDEX IF NOT EXISTS idx_pages_bat_status ON pages(status) WHERE status IN ('bat_valide', 'dernieres_corrections', 'envoye_imprimeur');
