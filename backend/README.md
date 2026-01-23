# Wevalid Backend API

Documentation complète de l'API REST du backend Wevalid.

## Table des matières

- [Configuration](#configuration)
- [Authentification](#authentification)
- [Routes API](#routes-api)
  - [Auth](#auth)
  - [Projects](#projects)
  - [Pages](#pages)
  - [Files](#files)
  - [Users](#users)
  - [Workflows](#workflows)
  - [Annotations](#annotations)
- [Rôles utilisateurs](#rôles-utilisateurs)
- [Workflow des pages](#workflow-des-pages)

---

## Configuration

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

# Frontend (CORS)
FRONTEND_URL=https://wevalid.rmax.synology.me

# SMTP (optionnel)
SMTP_HOST=ssl.ovh.net
SMTP_PORT=465
SMTP_USER=xxx
SMTP_PASS=xxx
```

### URLs

| Environnement | URL |
|--------------|-----|
| Production | https://wevalid.rmax.synology.me |
| Local | http://localhost:7801 |

---

## Authentification

### Format du header

```
Authorization: Bearer <accessToken>
```

### Flux d'authentification

1. **Login** → `POST /api/auth/login` → Récupère `accessToken` + `refreshToken`
2. **Requêtes** → Ajouter `Authorization: Bearer <accessToken>` dans les headers
3. **Token expiré** → `POST /api/auth/refresh` avec le `refreshToken`
4. **Logout** → `POST /api/auth/logout` avec le `refreshToken`

### Durée des tokens

- **accessToken** : 1 heure
- **refreshToken** : 7 jours (stocké dans Redis)

---

## Routes API

### Auth

#### `POST /api/auth/register`

Créer un nouveau compte utilisateur.

**Auth requise :** Non

**Body :**
```json
{
  "email": "user@example.com",
  "password": "Password123!",
  "first_name": "Jean",
  "last_name": "Dupont",
  "role": "auteur"
}
```

| Champ | Type | Requis | Validation |
|-------|------|--------|------------|
| email | string | ✅ | Format email |
| password | string | ✅ | Min 8 caractères |
| first_name | string | ✅ | 2-50 caractères |
| last_name | string | ✅ | 2-50 caractères |
| role | string | ✅ | `auteur`, `editeur`, `photograveur`, `fabricant`, `graphiste` |

**Réponse (201) :**
```json
{
  "message": "Utilisateur créé avec succès",
  "user": {
    "id": 1,
    "email": "user@example.com",
    "first_name": "Jean",
    "last_name": "Dupont",
    "role": "auteur",
    "created_at": "2024-01-01T00:00:00Z"
  }
}
```

**Erreurs :**
- `409` : Email déjà utilisé

---

#### `POST /api/auth/login`

Se connecter.

**Auth requise :** Non

**Body :**
```json
{
  "email": "user@example.com",
  "password": "Password123!"
}
```

**Réponse (200) :**
```json
{
  "message": "Connexion réussie",
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": 1,
    "email": "user@example.com",
    "first_name": "Jean",
    "last_name": "Dupont",
    "role": "auteur"
  }
}
```

**Erreurs :**
- `401` : Email ou mot de passe incorrect
- `403` : Compte désactivé

---

#### `POST /api/auth/refresh`

Rafraîchir le token d'accès.

**Auth requise :** Non

**Body :**
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Réponse (200) :**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Erreurs :**
- `401` : Refresh token manquant
- `403` : Refresh token invalide

---

#### `POST /api/auth/logout`

Se déconnecter.

**Auth requise :** Non

**Body :**
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Réponse (200) :**
```json
{
  "message": "Déconnexion réussie"
}
```

---

### Projects

#### `GET /api/projects`

Lister tous les projets.

**Auth requise :** ✅ Oui

**Query params :**

| Param | Type | Défaut | Description |
|-------|------|--------|-------------|
| status | string | - | Filtrer par statut |
| search | string | - | Recherche titre/ISBN |
| page | number | 1 | Page de pagination |
| limit | number | 20 | Items par page |

**Réponse (200) :**
```json
{
  "projects": [
    {
      "id": 1,
      "title": "Guide du Photographe",
      "isbn": "978-2-1234-5678-9",
      "description": "Un guide complet",
      "total_pages": 150,
      "status": "in_progress",
      "created_by": 1,
      "creator_name": "Marie Dupont",
      "total_pages_count": 150,
      "validated_pages_count": 30,
      "created_at": "2024-01-01T00:00:00Z",
      "updated_at": "2024-01-01T00:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 1
  }
}
```

> **Note :** Les utilisateurs non-éditeur/fabricant ne voient que leurs projets.

---

#### `GET /api/projects/:id`

Récupérer un projet avec ses membres.

**Auth requise :** ✅ Oui

**Réponse (200) :**
```json
{
  "project": {
    "id": 1,
    "title": "Guide du Photographe",
    "members": [
      {
        "id": 1,
        "email": "editeur@wevalid.com",
        "first_name": "Marie",
        "last_name": "Dupont",
        "role": "editeur",
        "added_at": "2024-01-01T00:00:00Z"
      }
    ]
  }
}
```

**Erreurs :**
- `403` : Accès refusé (non membre)
- `404` : Projet non trouvé

---

#### `POST /api/projects`

Créer un nouveau projet.

**Auth requise :** ✅ Oui
**Rôles autorisés :** `editeur`, `fabricant`

**Body :**
```json
{
  "title": "Mon nouveau livre",
  "isbn": "978-2-1234-5678-0",
  "description": "Description du projet",
  "total_pages": 200
}
```

| Champ | Type | Requis | Validation |
|-------|------|--------|------------|
| title | string | ✅ | 1-200 caractères |
| isbn | string | ❌ | Format ISBN (10-17 chiffres/tirets) |
| description | string | ❌ | Max 1000 caractères |
| total_pages | number | ✅ | 1-10000 |

**Réponse (201) :**
```json
{
  "message": "Projet créé avec succès",
  "project": { ... }
}
```

> **Note :** Crée automatiquement toutes les pages avec le statut `attente_elements`.

---

#### `PUT /api/projects/:id`

Mettre à jour un projet.

**Auth requise :** ✅ Oui
**Rôles autorisés :** `editeur`, `fabricant`

**Body (tous les champs optionnels) :**
```json
{
  "title": "Nouveau titre",
  "isbn": "978-2-9999-9999-9",
  "description": "Nouvelle description",
  "total_pages": 250,
  "status": "in_progress"
}
```

| Statut | Description |
|--------|-------------|
| `draft` | Brouillon |
| `in_progress` | En cours |
| `bat` | BAT |
| `completed` | Terminé |
| `archived` | Archivé |

---

#### `DELETE /api/projects/:id`

Supprimer un projet.

**Auth requise :** ✅ Oui
**Rôles autorisés :** `editeur`, `fabricant`

> ⚠️ Supprime en cascade : annotations, fichiers, pages, membres.

---

#### `POST /api/projects/:id/members`

Ajouter un membre au projet.

**Auth requise :** ✅ Oui
**Rôles autorisés :** `editeur`, `fabricant`

**Body :**
```json
{
  "user_id": 3
}
```

**Erreurs :**
- `404` : Utilisateur non trouvé
- `409` : Déjà membre du projet

---

#### `DELETE /api/projects/:id/members/:userId`

Retirer un membre du projet.

**Auth requise :** ✅ Oui
**Rôles autorisés :** `editeur`, `fabricant`

---

### Pages

#### `GET /api/pages/project/:projectId`

Lister les pages d'un projet.

**Auth requise :** ✅ Oui

**Réponse (200) :**
```json
{
  "pages": [
    {
      "id": 1,
      "project_id": 1,
      "page_number": 1,
      "status": "bat_valide",
      "files_count": 2,
      "annotations_count": 5,
      "latest_file_id": 12,
      "created_at": "2024-01-01T00:00:00Z",
      "updated_at": "2024-01-01T00:00:00Z"
    }
  ]
}
```

---

#### `GET /api/pages/:id`

Récupérer une page avec ses fichiers et annotations.

**Auth requise :** ✅ Oui

**Réponse (200) :**
```json
{
  "page": {
    "id": 1,
    "page_number": 1,
    "status": "bat_valide",
    "files": [
      {
        "id": 1,
        "filename": "page1_v2.pdf",
        "file_type": "application/pdf",
        "file_size": 2048576,
        "uploaded_at": "2024-01-01T00:00:00Z"
      }
    ],
    "annotations": [
      {
        "id": 1,
        "type": "comment",
        "content": "Corriger la typo",
        "created_by": 1,
        "created_at": "2024-01-01T00:00:00Z"
      }
    ]
  }
}
```

---

#### `PATCH /api/pages/:id/status`

Changer le statut d'une page.

**Auth requise :** ✅ Oui

**Body :**
```json
{
  "status": "maquette_a_valider"
}
```

**Transitions autorisées par rôle :**

| Rôle | Statuts autorisés |
|------|-------------------|
| auteur | `elements_recus` |
| editeur | `maquette_a_valider`, `en_corrections`, `bat_valide` |
| photograveur | `maquette_validee_photogravure`, `en_bat` |
| fabricant | `envoye_imprimeur` |
| graphiste | `en_maquette`, `en_peaufinage` |

**Erreurs :**
- `403` : Transition non autorisée pour ce rôle

---

#### `GET /api/pages/:id/history`

Historique des changements de statut d'une page.

**Auth requise :** ✅ Oui

**Réponse (200) :**
```json
{
  "history": [
    {
      "id": 1,
      "from_status": "en_maquette",
      "to_status": "maquette_a_valider",
      "changed_by": 3,
      "changed_by_name": "Sophie Bernard",
      "changed_by_role": "graphiste",
      "notes": "Changement de statut par graphiste",
      "changed_at": "2024-01-01T00:00:00Z"
    }
  ]
}
```

---

### Files

#### `POST /api/files/upload`

Uploader des fichiers.

**Auth requise :** ✅ Oui
**Content-Type :** `multipart/form-data`

**Form data :**
- `files` : Fichiers (max 10, 100 MB chacun)
- `page_id` : ID de la page

**Types acceptés :**
- Images : JPEG, PNG, GIF, WebP, TIFF, BMP, PSD
- Documents : PDF, TXT, DOC, DOCX, RTF
- Archives : ZIP, RAR

**Réponse (201) :**
```json
{
  "message": "Fichiers uploadés avec succès",
  "files": [
    {
      "id": 1,
      "page_id": 1,
      "filename": "1704067200000-abc123.pdf",
      "original_filename": "mon-document.pdf",
      "file_path": "/app/storage/uploads/...",
      "thumbnail_path": "/app/storage/thumbnails/...",
      "file_type": "application/pdf",
      "file_size": 2048576,
      "is_current": true,
      "version": 1,
      "uploaded_at": "2024-01-01T00:00:00Z"
    }
  ]
}
```

> **Note :** Les miniatures sont générées automatiquement pour PDFs et images.

---

#### `POST /api/files/upload-complete-pdf`

Uploader un PDF complet et le découper par page.

**Auth requise :** ✅ Oui
**Content-Type :** `multipart/form-data`

**Form data :**
- `file` : Fichier PDF unique
- `project_id` : ID du projet

**Réponse (201) :**
```json
{
  "message": "PDF découpé avec succès en 150 pages",
  "files": [ ... ],
  "stats": {
    "pdf_pages": 150,
    "project_pages": 150,
    "files_created": 150
  }
}
```

> Utilise Ghostscript pour découper le PDF et assigne chaque page au projet.

---

#### `GET /api/files/download/:id`

Télécharger un fichier.

**Auth requise :** ✅ Oui

---

#### `GET /api/files/thumbnail/:id`

Récupérer la miniature d'un fichier.

**Auth requise :** ❌ Non (public)

---

#### `DELETE /api/files/:id`

Supprimer un fichier.

**Auth requise :** ✅ Oui
**Permissions :** Uploadeur, éditeur ou fabricant

---

#### `GET /api/files/page/:pageId/history`

Historique des versions de fichiers d'une page.

**Auth requise :** ✅ Oui

**Réponse (200) :**
```json
{
  "page_id": 1,
  "versions": [
    {
      "id": 2,
      "version": 2,
      "is_current": true,
      "uploaded_by_name": "Sophie Bernard",
      "uploaded_at": "2024-01-02T00:00:00Z"
    },
    {
      "id": 1,
      "version": 1,
      "is_current": false,
      "uploaded_by_name": "Jean Martin",
      "uploaded_at": "2024-01-01T00:00:00Z"
    }
  ]
}
```

---

### Users

#### `GET /api/users`

Lister tous les utilisateurs.

**Auth requise :** ✅ Oui
**Rôles autorisés :** `editeur`, `fabricant`

**Query params :**
- `role` : Filtrer par rôle
- `search` : Recherche nom/email

---

#### `GET /api/users/me`

Récupérer son propre profil.

**Auth requise :** ✅ Oui

---

#### `GET /api/users/:id`

Récupérer un utilisateur.

**Auth requise :** ✅ Oui

---

#### `PUT /api/users/me`

Mettre à jour son profil.

**Auth requise :** ✅ Oui

**Body (tous optionnels) :**
```json
{
  "first_name": "Jean",
  "last_name": "Martin",
  "email": "jean.martin@example.com"
}
```

---

#### `PUT /api/users/me/password`

Changer son mot de passe.

**Auth requise :** ✅ Oui

**Body :**
```json
{
  "current_password": "Password123!",
  "new_password": "NewPassword456!"
}
```

---

#### `PATCH /api/users/:id/status`

Activer/Désactiver un utilisateur.

**Auth requise :** ✅ Oui
**Rôles autorisés :** `editeur`, `fabricant`

**Body :**
```json
{
  "is_active": false
}
```

---

### Workflows

#### `GET /api/workflows/transitions/:status`

Récupérer les transitions autorisées pour un statut.

**Auth requise :** ✅ Oui

**Réponse (200) :**
```json
{
  "current_status": "en_maquette",
  "user_role": "graphiste",
  "allowed_transitions": ["maquette_a_valider"]
}
```

---

#### `GET /api/workflows/stats/:projectId`

Statistiques de workflow d'un projet.

**Auth requise :** ✅ Oui

**Réponse (200) :**
```json
{
  "project_id": 1,
  "total_pages": 150,
  "stats": [
    { "status": "bat_valide", "count": 30, "percentage": 20 },
    { "status": "en_bat", "count": 30, "percentage": 20 },
    { "status": "en_maquette", "count": 60, "percentage": 40 },
    { "status": "attente_elements", "count": 30, "percentage": 20 }
  ]
}
```

---

#### `GET /api/workflows/history/:projectId`

Historique complet du workflow d'un projet.

**Auth requise :** ✅ Oui

> Retourne les 100 dernières transitions.

---

### Annotations

#### `GET /api/annotations/page/:pageId`

Récupérer les annotations d'une page.

**Auth requise :** ✅ Oui

**Réponse (200) :**
```json
{
  "annotations": [
    {
      "id": 1,
      "page_id": 1,
      "type": "comment",
      "content": "Corriger la typo ligne 5",
      "position": {
        "x": 100,
        "y": 200,
        "width": 150,
        "height": 50,
        "page_number": 1
      },
      "color": "#FFFF00",
      "resolved": false,
      "created_by": 1,
      "author_name": "Marie Dupont",
      "author_role": "editeur",
      "created_at": "2024-01-01T00:00:00Z"
    }
  ]
}
```

---

#### `POST /api/annotations`

Créer une annotation.

**Auth requise :** ✅ Oui

**Body :**
```json
{
  "page_id": 1,
  "type": "comment",
  "content": "Corriger cette typo",
  "position": {
    "x": 100,
    "y": 200,
    "width": 150,
    "height": 50,
    "page_number": 1
  },
  "color": "#FFFF00"
}
```

| Type | Description |
|------|-------------|
| `comment` | Commentaire textuel |
| `highlight` | Surlignage |
| `drawing` | Dessin libre |
| `stamp` | Tampon/Cachet |

---

#### `PUT /api/annotations/:id`

Mettre à jour une annotation.

**Auth requise :** ✅ Oui

**Body (tous optionnels) :**
```json
{
  "content": "Nouveau contenu",
  "position": { ... },
  "color": "#FF0000",
  "resolved": true
}
```

> **Note :** Seul le créateur peut modifier le contenu. Tout le monde peut marquer `resolved`.

---

#### `DELETE /api/annotations/:id`

Supprimer une annotation.

**Auth requise :** ✅ Oui
**Permissions :** Créateur, éditeur ou fabricant

---

## Rôles utilisateurs

| Rôle | Description | Permissions spéciales |
|------|-------------|----------------------|
| `auteur` | Auteur/Créateur de contenu | Upload fichiers |
| `editeur` | Éditeur | **Toutes les permissions admin** |
| `graphiste` | Graphiste/Maquettiste | Gestion maquettes |
| `photograveur` | Photograveur | Gestion photogravure et BAT |
| `fabricant` | Fabricant/Imprimeur | **Toutes les permissions admin** |

---

## Workflow des pages

```
┌─────────────────────┐
│  attente_elements   │ ← État initial
└──────────┬──────────┘
           │ auteur/editeur/graphiste
           ▼
┌─────────────────────┐
│   elements_recus    │
└──────────┬──────────┘
           │ editeur/graphiste
           ▼
┌─────────────────────┐
│     en_maquette     │
└──────────┬──────────┘
           │ graphiste/editeur
           ▼
┌─────────────────────┐      ┌─────────────────────┐
│ maquette_a_valider  │◄─────│   en_corrections    │
└──────────┬──────────┘      └─────────────────────┘
           │ editeur/fabricant         ▲
           ▼                           │
┌─────────────────────┐      ┌─────────┴───────────┐
│ maquette_validee_   │      │    en_peaufinage    │
│   photogravure      │──────►                     │
└──────────┬──────────┘      └─────────────────────┘
           │ photograveur
           ▼
┌─────────────────────┐
│       en_bat        │
└──────────┬──────────┘
           │ photograveur/editeur
           ▼
┌─────────────────────┐
│     bat_valide      │
└──────────┬──────────┘
           │ editeur/fabricant
           ▼
┌─────────────────────┐
│  envoye_imprimeur   │ ← État final
└─────────────────────┘
```

---

## Format des erreurs

Toutes les erreurs suivent ce format :

```json
{
  "error": {
    "message": "Description de l'erreur",
    "details": [
      {
        "field": "email",
        "message": "Format email invalide"
      }
    ]
  }
}
```

---

## Comptes de test

| Email | Mot de passe | Rôle |
|-------|--------------|------|
| editeur@wevalid.com | Password123! | Éditeur |
| auteur@wevalid.com | Password123! | Auteur |
| graphiste@wevalid.com | Password123! | Graphiste |
| photograveur@wevalid.com | Password123! | Photograveur |
| fabricant@wevalid.com | Password123! | Fabricant |

---

## Stockage des fichiers

Les fichiers sont stockés dans :
- **Uploads** : `/app/storage/uploads/`
- **Miniatures** : `/app/storage/thumbnails/`
- **Temporaire** : `/app/storage/temp/`

En production (NAS Synology) : `/volume1/docker/wevalid/storage/`
