# WeValid - Conception des nouvelles fonctionnalités

**Date**: 2026-01-31
**Auteur**: Claude
**Statut**: En attente de validation

---

## Résumé de l'audit

### État actuel
- **Frontend**: Next.js 14 déployé sur Vercel (wevalid.fr)
- **Backend**: Node.js/Express sur NAS Synology (wevalid.rmax.synology.me)
- **Base de données**: PostgreSQL 16
- **Fonctionnel**: Dashboard, projets, pages, annotations, upload PDF, export XFDF

### Points à améliorer identifiés
1. Page paramètres utilisateur manquante (404)
2. Édition de projet non disponible (lecture seule)
3. Versioning PDF non exploité dans le viewer
4. Annotations limitées à "résolu" (pas de "refusé", pas de réponses)
5. Option "Simplifier noms" cochée par défaut (devrait être décochée)
6. Téléchargement avec annotations basique

---

## Fonctionnalités à implémenter

### 1. Page Paramètres Utilisateur

**Objectif**: Permettre à l'utilisateur de modifier son email et mot de passe.

**Backend** (existant):
- `PUT /api/users/me` - Modifier profil (first_name, last_name, email)
- `PUT /api/users/me/password` - Changer mot de passe

**Frontend** (à créer):
- Route: `/app/(app)/settings/page.tsx`
- Composants:
  - Formulaire profil (prénom, nom, email)
  - Formulaire changement mot de passe (ancien, nouveau, confirmation)
  - Validation côté client
  - Messages de succès/erreur

**Fichiers à créer**:
- `frontend/src/app/(app)/settings/page.tsx`
- `frontend/src/lib/api/users.ts` (ajouter updateMe, updatePassword)

---

### 2. Édition des informations de projet

**Objectif**: Permettre de modifier les infos d'un projet existant.

**Backend** (existant):
- `PUT /api/projects/:id` - Modifier projet

**Frontend** (à modifier):
- Transformer l'onglet "Paramètres" en formulaire éditable
- Champs modifiables: titre, ISBN, description, dimensions, publisher

**Fichiers à modifier**:
- `frontend/src/app/(app)/projects/[id]/page.tsx` - Onglet Paramètres
- `frontend/src/lib/api/projects.ts` - Ajouter updateProject si absent

---

### 3. Versioning PDF dans le viewer

**Objectif**: Voir toutes les versions d'une page et comparer 2 versions.

**Backend** (existant):
- `GET /api/files/page/:pageId/history` - Historique des versions

**Frontend** (à créer/modifier):

**3.1 Sélecteur de version**
- Dropdown pour choisir la version à afficher
- Affichage du numéro de version et date d'upload
- Indication visuelle de la version courante

**3.2 Mode comparaison**
- Bouton "Comparer les versions"
- Affichage côte à côte de 2 versions
- Sélection des 2 versions à comparer
- Slider ou toggle pour basculer entre les 2

**Fichiers à modifier**:
- `frontend/src/app/(app)/projects/[id]/pages/[pageId]/page.tsx`
- `frontend/src/components/pdf/pdf-viewer.tsx`

**Fichiers à créer**:
- `frontend/src/components/pdf/version-selector.tsx`
- `frontend/src/components/pdf/version-compare.tsx`

---

### 4. Système d'annotations amélioré

**Objectif**: Réponses en fil de discussion + statut "refusé" avec motif.

**4.1 Backend - Modifications**

**Nouvelle table `annotation_replies`**:
```sql
CREATE TABLE annotation_replies (
    id SERIAL PRIMARY KEY,
    annotation_id INTEGER REFERENCES annotations(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW()
);
```

**Modification table `annotations`**:
```sql
ALTER TABLE annotations
ADD COLUMN status VARCHAR(20) DEFAULT 'open'
    CHECK (status IN ('open', 'resolved', 'rejected'));
ALTER TABLE annotations
ADD COLUMN status_reason TEXT;
ALTER TABLE annotations
ADD COLUMN resolved_in_version INTEGER REFERENCES files(id);
```

**Nouveaux endpoints**:
- `GET /api/annotations/:id/replies` - Liste des réponses
- `POST /api/annotations/:id/replies` - Ajouter une réponse
- `PUT /api/annotations/:id/status` - Changer le statut (resolved/rejected + motif)

**4.2 Frontend - Modifications**

**Annotation card améliorée**:
- Affichage du statut (ouvert, résolu, refusé)
- Badge couleur selon statut (bleu=ouvert, vert=résolu, rouge=refusé)
- Bouton "Répondre" pour ouvrir le fil
- Motif du refus visible si refusé
- Version de résolution affichée

**Fil de réponses**:
- Liste des réponses sous l'annotation
- Champ de saisie pour nouvelle réponse
- Avatar et nom de l'auteur
- Horodatage

**Actions annotation**:
- Bouton "Valider" → statut resolved
- Bouton "Refuser" → dialog avec champ motif → statut rejected
- Bouton "Rouvrir" si déjà traité

**Fichiers à modifier**:
- `backend/src/routes/annotations.js`
- `frontend/src/types/index.ts`
- `frontend/src/lib/api/annotations.ts`
- `frontend/src/app/(app)/projects/[id]/pages/[pageId]/page.tsx`

**Fichiers à créer**:
- `frontend/src/components/annotations/annotation-replies.tsx`
- `frontend/src/components/annotations/annotation-status-dialog.tsx`
- `backend/src/routes/annotation-replies.js` (ou intégré à annotations.js)

---

### 5. Upload PDF avec Page Labels

**Objectif**: S'assurer que les pages s'affectent correctement selon leurs page-labels.

**État actuel**: Le backend supporte déjà les page labels (`use_page_labels` param).

**Vérifications/améliorations**:
- Vérifier que le paramètre `use_page_labels=true` est bien envoyé par défaut
- Afficher un feedback à l'utilisateur sur le mode de mapping utilisé
- Gestion des erreurs de parsing de labels

**Frontend - Améliorations**:
- Afficher "Mode: Page Labels" ou "Mode: Séquentiel" après upload
- Option pour forcer le mode séquentiel si les labels sont incorrects
- Preview des pages mappées avant confirmation

**Fichiers à modifier**:
- `frontend/src/app/(app)/projects/[id]/page.tsx` - Section upload PDF

---

### 6. Téléchargement avec annotations

**Objectif**: Télécharger version complète, sélection de pages, ou page seule avec annotations lisibles dans Acrobat.

**6.1 Backend - Améliorations**

**Nouveau endpoint pour téléchargement multi-pages**:
```
GET /api/files/download-project/:projectId
Query params:
  - pages: "1,2,5-10" (sélection)
  - include_annotations: true/false
  - format: "merged" | "zip"
```

**Amélioration embedding annotations**:
- Vérifier la compatibilité Acrobat des annotations XFDF
- Inclure les dessins (ink annotations)
- Inclure les surlignages avec texte sélectionné

**6.2 Frontend - Interface téléchargement**

**Au niveau projet**:
- Bouton "Télécharger le projet"
- Options: tout, sélection, avec/sans annotations
- Sélection multiple de pages via checkboxes

**Au niveau page**:
- Options actuelles (Télécharger, PDF Annoté) OK
- Vérifier que ça fonctionne

**Import annotations depuis PDF uploadé**:
- Lors d'un upload, proposer d'importer les annotations existantes du PDF
- Checkbox "Importer les annotations du PDF"

**Fichiers à créer**:
- `backend/src/routes/project-download.js`
- `frontend/src/components/projects/download-dialog.tsx`

---

### 7. Option "Simplifier noms" - Meilleure intégration

**Problème actuel**: L'option est visible mais mal placée, et devrait être décochée par défaut.

**Solution proposée**:

**Approche 1 - Paramètre global utilisateur** (Recommandée):
- Ajouter une préférence utilisateur pour ce setting
- Stockée dans la table users ou une table user_preferences
- Valeur par défaut: false (ne pas simplifier)
- Accessible dans les paramètres utilisateur

**Approche 2 - Paramètre projet**:
- Stocker la préférence au niveau du projet
- Héritée par tous les uploads du projet

**Implémentation Approche 1**:

Backend:
```sql
ALTER TABLE users ADD COLUMN sanitize_filenames BOOLEAN DEFAULT false;
```
- Modifier `PUT /api/users/me` pour accepter ce champ

Frontend:
- Ajouter dans la page paramètres
- Initialiser les checkboxes avec la valeur utilisateur
- Permettre override ponctuel lors de l'upload

**Fichiers à modifier**:
- `backend/src/routes/users.js`
- `frontend/src/app/(app)/settings/page.tsx`
- `frontend/src/app/(app)/projects/[id]/page.tsx`
- `frontend/src/app/(app)/projects/[id]/pages/[pageId]/page.tsx`
- `frontend/src/components/projects/project-files-tab.tsx`

---

## Ordre d'implémentation recommandé

1. **Page Paramètres Utilisateur** - Rapide, indépendant
2. **Édition Projet** - Rapide, indépendant
3. **Option Simplifier noms** - Dépend de #1 pour les préférences
4. **Annotations améliorées** - Plus complexe, nécessite migration DB
5. **Versioning PDF viewer** - Complexe côté frontend
6. **Upload Page Labels** - Vérification/amélioration
7. **Téléchargement multi-pages** - Dépend du bon fonctionnement de #6

---

## Migrations base de données requises

```sql
-- Migration 1: Préférences utilisateur
ALTER TABLE users ADD COLUMN IF NOT EXISTS sanitize_filenames BOOLEAN DEFAULT false;

-- Migration 2: Statut annotations amélioré
ALTER TABLE annotations
ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'open';
ALTER TABLE annotations
ADD COLUMN IF NOT EXISTS status_reason TEXT;
ALTER TABLE annotations
ADD COLUMN IF NOT EXISTS resolved_in_version INTEGER;

-- Migration 3: Réponses aux annotations
CREATE TABLE IF NOT EXISTS annotation_replies (
    id SERIAL PRIMARY KEY,
    annotation_id INTEGER NOT NULL REFERENCES annotations(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Migration 4: Contrainte sur le statut
ALTER TABLE annotations
ADD CONSTRAINT annotation_status_check
CHECK (status IN ('open', 'resolved', 'rejected'));

-- Index pour les performances
CREATE INDEX IF NOT EXISTS idx_annotation_replies_annotation_id
ON annotation_replies(annotation_id);
```

---

## Risques et considérations

1. **Migration annotations existantes**: Les annotations existantes avec `resolved=true` doivent être migrées vers `status='resolved'`

2. **Rétrocompatibilité API**: L'ancien champ `resolved` doit continuer à fonctionner (le garder comme alias)

3. **Performance téléchargement**: Le merge de PDFs multi-pages peut être lent, prévoir un système async avec notification

4. **Stockage annotations**: Les réponses peuvent augmenter significativement le volume de données

---

## Décisions validées

1. **Versioning annotations**: Toutes les annotations cumulées avec filtre par version possible. Badge indiquant la version de création pour chaque annotation.

2. **Téléchargement multi-pages**: Proposer les deux options (PDF fusionné et ZIP).

3. **Comparaison de versions**: Mode côte à côte avec scroll synchronisé.
