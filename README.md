# WeValid - Plateforme de validation éditoriale

Application de gestion de workflow pour la production éditoriale (livres, magazines).

**Production** : `https://wevalid.rmax.synology.me`

---

## Table des matières

- [Architecture](#architecture)
- [Accès serveur](#accès-serveur)
- [Développement](#développement)
- [Déploiement](#déploiement)
- [API Reference](#api-reference)
- [Rôles utilisateurs](#rôles-utilisateurs)
- [Workflow des pages](#workflow-des-pages)
- [Base de données](#base-de-données)

---

## Architecture

```
├── backend/           # API Node.js/Express
│   └── src/
│       ├── routes/    # Endpoints API
│       ├── middleware/# Auth, validation
│       ├── config/    # DB, Redis
│       └── utils/     # Logger, email
├── frontend/          # Next.js 14 (App Router)
│   └── src/
│       ├── app/       # Pages
│       ├── components/# Composants React
│       ├── hooks/     # Hooks custom
│       └── lib/api/   # Client API
├── init-scripts/      # Migrations SQL
└── storage/           # Fichiers (PDFs, thumbnails)
```

---

## Accès serveur

### Via Portainer (recommandé)
Interface web Docker déjà configurée sur le NAS.

### Via SSH
```bash
ssh admin@wevalid.rmax.synology.me
```

### Commandes Docker
```bash
# Logs
docker logs wevalid-backend --tail 50

# Console PostgreSQL
docker exec -it wevalid-db psql -U wevalid_user -d wevalid_prod

# Redémarrer
docker restart wevalid-backend
```

### Accès fichiers (SMB)
```
smb://wevalid.rmax.synology.me
```

### Variables d'environnement

```env
# Base de données
DB_HOST=postgres
DB_PORT=5432
DB_NAME=wevalid_prod
DB_USER=wevalid_user
DB_PASSWORD=xxx

# Redis
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=xxx

# JWT
JWT_SECRET=xxx
JWT_REFRESH_SECRET=xxx

# Frontend
FRONTEND_URL=https://wevalid.rmax.synology.me
```

---

## Développement

### Prérequis
- Node.js 18+
- pnpm

### Installation
```bash
cd backend && pnpm install
cd frontend && pnpm install
```

### Frontend → API distante
```bash
cd frontend
NEXT_PUBLIC_API_URL=https://wevalid.rmax.synology.me/api pnpm dev
```

---

## Déploiement

```bash
# 1. Push
git push origin main

# 2. Sur le NAS (SSH ou Portainer console)
cd /volume1/docker/wevalid
git pull origin main
docker restart wevalid-backend

# 3. Migration SQL si nécessaire
docker exec -i wevalid-db psql -U wevalid_user -d wevalid_prod < init-scripts/02-publishers-migration.sql
```

---

## API Reference

### Authentification

Header requis sur toutes les routes (sauf `/health` et `/api/auth/*`) :
```
Authorization: Bearer <accessToken>
```

| Token | Durée |
|-------|-------|
| accessToken | 1 heure |
| refreshToken | 7 jours |

---

### Auth (`/api/auth`)

#### `POST /api/auth/login`
```json
{ "email": "user@example.com", "password": "Password123!" }
```
→ `{ accessToken, refreshToken, user }`

#### `POST /api/auth/refresh`
```json
{ "refreshToken": "..." }
```
→ `{ accessToken }`

#### `POST /api/auth/logout`
```json
{ "refreshToken": "..." }
```

---

### Publishers (`/api/publishers`) — NOUVEAU

Maisons d'édition avec contrôle d'accès.

| Route | Méthode | Accès | Description |
|-------|---------|-------|-------------|
| `/publishers` | GET | Auth | Liste (admin: toutes, fabricant: ses maisons) |
| `/publishers/:id` | GET | Auth | Détails + membres |
| `/publishers` | POST | Admin | Créer |
| `/publishers/:id` | PUT | Admin | Modifier |
| `/publishers/:id` | DELETE | Admin | Supprimer |
| `/publishers/:id/members` | POST | Admin | Ajouter membre |
| `/publishers/:id/members/:userId` | DELETE | Admin | Retirer membre |

**Réponse GET /publishers :**
```json
{
  "publishers": [{
    "id": 1,
    "name": "Éditions Dupont",
    "description": "...",
    "members_count": 5,
    "projects_count": 12
  }]
}
```

---

### Projects (`/api/projects`)

| Route | Méthode | Accès | Description |
|-------|---------|-------|-------------|
| `/projects` | GET | Auth | Liste (filtrable) |
| `/projects/:id` | GET | Auth | Détails + membres |
| `/projects` | POST | Éditeur/Fabricant | Créer |
| `/projects/:id` | PUT | Éditeur/Fabricant | Modifier |
| `/projects/:id` | DELETE | Admin | Supprimer |
| `/projects/:id/members` | POST | Éditeur/Fabricant | Ajouter membre |
| `/projects/:id/members/:userId` | DELETE | Éditeur/Fabricant | Retirer membre |

**Query params GET /projects :**
- `status` : `draft`, `in_progress`, `bat`, `completed`, `archived`
- `search` : Recherche titre/ISBN
- `publisher_id` : Filtrer par maison — NOUVEAU
- `page`, `limit` : Pagination

**Body POST /projects :**
```json
{
  "title": "Mon livre",
  "isbn": "978-2-1234-5678-0",
  "description": "...",
  "total_pages": 200,
  "publisher_id": 1,
  "width_mm": 210,
  "height_mm": 297
}
```

| Champ | Type | Requis | Validation |
|-------|------|--------|------------|
| title | string | ✅ | 1-200 car |
| total_pages | number | ✅ | 1-10000 |
| isbn | string | ❌ | Format ISBN |
| publisher_id | number | ❌ | — NOUVEAU |
| width_mm | number | ❌ | 50-1000 — NOUVEAU |
| height_mm | number | ❌ | 50-1000 — NOUVEAU |

---

### Pages (`/api/pages`)

| Route | Méthode | Description |
|-------|---------|-------------|
| `/pages/project/:projectId` | GET | Liste pages (inclut `latest_file_id`) |
| `/pages/:id` | GET | Détails + fichiers + annotations |
| `/pages/:id/status` | PATCH | Changer statut |
| `/pages/:id/history` | GET | Historique changements |

**Réponse GET /pages/project/:id :**
```json
{
  "pages": [{
    "id": 1,
    "page_number": 1,
    "status": "en_maquette",
    "files_count": 2,
    "annotations_count": 5,
    "latest_file_id": 42
  }]
}
```

---

### Files (`/api/files`)

| Route | Méthode | Description |
|-------|---------|-------------|
| `/files/upload` | POST | Upload fichier(s) (multipart) |
| `/files/upload-complete-pdf` | POST | Upload PDF complet (découpage auto) |
| `/files/download/:id` | GET | Télécharger |
| `/files/thumbnail/:id` | GET | Miniature (public) |
| `/files/:id` | DELETE | Supprimer |
| `/files/page/:pageId/history` | GET | Historique versions |

**Types acceptés :** PDF, JPEG, PNG, GIF, WebP, TIFF, PSD, DOC, DOCX

---

### Users (`/api/users`)

| Route | Méthode | Accès | Description |
|-------|---------|-------|-------------|
| `/users` | GET | Éditeur/Fabricant | Liste |
| `/users/me` | GET | Auth | Mon profil |
| `/users/:id` | GET | Auth | Profil utilisateur |
| `/users/me` | PUT | Auth | Modifier mon profil |
| `/users/me/password` | PUT | Auth | Changer mot de passe |
| `/users/:id/status` | PATCH | Admin | Activer/désactiver |

---

### Annotations (`/api/annotations`)

| Route | Méthode | Description |
|-------|---------|-------------|
| `/annotations/page/:pageId` | GET | Liste annotations |
| `/annotations` | POST | Créer |
| `/annotations/:id` | PUT | Modifier |
| `/annotations/:id` | DELETE | Supprimer |

**Types :** `comment`, `highlight`, `drawing`, `stamp`

---

### Workflows (`/api/workflows`)

| Route | Méthode | Description |
|-------|---------|-------------|
| `/workflows/transitions/:status` | GET | Transitions autorisées |
| `/workflows/stats/:projectId` | GET | Stats par statut |
| `/workflows/history/:projectId` | GET | Historique projet |

---

## Rôles utilisateurs

| Rôle | Projets visibles | Maisons visibles | Permissions |
|------|------------------|------------------|-------------|
| `admin` | Tous | Toutes | Tout |
| `editeur` | Tous | — | CRUD projets, pages, fichiers |
| `fabricant` | Ses maisons + assignés | Ses maisons | CRUD projets, pages, fichiers |
| `graphiste` | Assignés | — | Maquettes, annotations |
| `auteur` | Assignés | — | Upload, annotations |
| `photograveur` | Assignés | — | Photogravure, BAT |

---

## Workflow des pages

```
attente_elements
       ↓ auteur/editeur/graphiste
elements_recus
       ↓ editeur/fabricant
ok_pour_maquette
       ↓ graphiste/editeur
en_maquette
       ↓ graphiste/editeur
maquette_a_valider ←──────────────┐
       ↓ editeur/fabricant        │
       ├── pour_corrections ──────┤
       ↓                          │
maquette_validee_photogravure     │
       ├── en_peaufinage ─────────┘
       ↓ photograveur
en_bat
       ↓ photograveur/editeur
bat_valide
       ↓ editeur/fabricant
pdf_hd_ok (final)
```

---

## Base de données

### Migration Publishers (v2)

Fichier : `init-scripts/02-publishers-migration.sql`

```sql
CREATE TABLE publishers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE user_publishers (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    publisher_id INTEGER REFERENCES publishers(id) ON DELETE CASCADE,
    role VARCHAR(50) CHECK (role IN ('admin', 'member')),
    UNIQUE(user_id, publisher_id)
);

ALTER TABLE projects ADD COLUMN publisher_id INTEGER REFERENCES publishers(id);
ALTER TABLE projects ADD COLUMN width_mm INTEGER CHECK (width_mm BETWEEN 50 AND 1000);
ALTER TABLE projects ADD COLUMN height_mm INTEGER CHECK (height_mm BETWEEN 50 AND 1000);
```

### Stockage fichiers

| Type | Chemin |
|------|--------|
| Uploads | `/app/storage/uploads/` |
| Miniatures | `/app/storage/thumbnails/` |
| Production | `/volume1/docker/wevalid/storage/` |

---

## Comptes de test

| Email | Mot de passe | Rôle |
|-------|--------------|------|
| admin@wevalid.com | admin123 | admin |
| editeur@wevalid.com | password123 | editeur |
| fabricant@wevalid.com | password123 | fabricant |
| auteur@wevalid.com | password123 | auteur |
| graphiste@wevalid.com | password123 | graphiste |
| photograveur@wevalid.com | password123 | photograveur |
