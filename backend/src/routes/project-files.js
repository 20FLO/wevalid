const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { pool } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const logger = require('../utils/logger');
const { sanitizeFilename } = require('../utils/sanitize');

// Configuration multer pour upload
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const projectId = req.params.projectId;
    const uploadDir = path.join('/app/storage/project-files', projectId.toString());
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const sanitized = sanitizeFilename(file.originalname);
    cb(null, uniqueSuffix + '_' + sanitized);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB max
  fileFilter: (req, file, cb) => {
    // Types acceptés: Word, RTF, PDF, images
    const allowedMimes = [
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/rtf',
      'text/rtf',
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'image/tiff',
      'image/svg+xml',
      'application/zip',
      'application/x-zip-compressed'
    ];

    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Type de fichier non autorisé: ${file.mimetype}`));
    }
  }
});

router.use(authenticateToken);

// GET /project-files/:projectId - Liste des fichiers du projet
router.get('/:projectId', async (req, res) => {
  const { projectId } = req.params;
  const { category } = req.query;

  try {
    // Vérifier accès au projet
    const projectCheck = await pool.query(
      'SELECT id FROM projects WHERE id = $1',
      [projectId]
    );
    if (projectCheck.rows.length === 0) {
      return res.status(404).json({ error: { message: 'Projet non trouvé' } });
    }

    let query = `
      SELECT pf.*,
             u.first_name || ' ' || u.last_name as uploader_name,
             (SELECT COUNT(*) FROM project_files WHERE parent_file_id = pf.id) as versions_count
      FROM project_files pf
      LEFT JOIN users u ON pf.uploaded_by = u.id
      WHERE pf.project_id = $1 AND pf.parent_file_id IS NULL
    `;
    const params = [projectId];

    if (category) {
      query += ' AND pf.category = $2';
      params.push(category);
    }

    query += ' ORDER BY pf.uploaded_at DESC';

    const result = await pool.query(query, params);

    res.json({ files: result.rows });
  } catch (error) {
    logger.error('Erreur récupération fichiers projet:', error);
    res.status(500).json({ error: { message: 'Erreur serveur' } });
  }
});

// POST /project-files/:projectId/upload - Upload fichier(s)
router.post('/:projectId/upload', upload.array('files', 20), async (req, res) => {
  const { projectId } = req.params;
  const { category = 'document', description } = req.body;

  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: { message: 'Aucun fichier fourni' } });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Vérifier accès au projet
    const projectCheck = await client.query(
      'SELECT id FROM projects WHERE id = $1',
      [projectId]
    );
    if (projectCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: { message: 'Projet non trouvé' } });
    }

    const uploadedFiles = [];

    for (const file of req.files) {
      // Déterminer la catégorie automatiquement si non spécifiée
      let fileCategory = category;
      if (file.mimetype.startsWith('image/')) {
        fileCategory = 'image';
      } else if (file.mimetype.includes('word') || file.mimetype.includes('rtf')) {
        fileCategory = 'document';
      }

      const result = await client.query(
        `INSERT INTO project_files
         (project_id, filename, original_filename, file_path, file_type, file_size, category, description, uploaded_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [
          projectId,
          file.filename,
          file.originalname,
          file.path,
          file.mimetype,
          file.size,
          fileCategory,
          description || null,
          req.user.id
        ]
      );

      uploadedFiles.push(result.rows[0]);
    }

    await client.query('COMMIT');

    logger.info('Fichiers projet uploadés:', {
      projectId,
      count: uploadedFiles.length,
      uploadedBy: req.user.id
    });

    res.status(201).json({
      message: `${uploadedFiles.length} fichier(s) uploadé(s)`,
      files: uploadedFiles
    });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Erreur upload fichiers projet:', error);
    res.status(500).json({ error: { message: 'Erreur serveur' } });
  } finally {
    client.release();
  }
});

// GET /project-files/download/:id - Télécharger un fichier
router.get('/download/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      'SELECT * FROM project_files WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: { message: 'Fichier non trouvé' } });
    }

    const file = result.rows[0];

    res.download(file.file_path, file.original_filename);
  } catch (error) {
    logger.error('Erreur téléchargement fichier projet:', error);
    res.status(500).json({ error: { message: 'Erreur serveur' } });
  }
});

// PUT /project-files/:id - Modifier métadonnées
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { description, category } = req.body;

  try {
    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(description);
    }
    if (category) {
      updates.push(`category = $${paramIndex++}`);
      values.push(category);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: { message: 'Aucune modification fournie' } });
    }

    values.push(id);
    const result = await pool.query(
      `UPDATE project_files SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: { message: 'Fichier non trouvé' } });
    }

    res.json({ message: 'Fichier modifié', file: result.rows[0] });
  } catch (error) {
    logger.error('Erreur modification fichier projet:', error);
    res.status(500).json({ error: { message: 'Erreur serveur' } });
  }
});

// DELETE /project-files/:id - Supprimer un fichier
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      'SELECT * FROM project_files WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: { message: 'Fichier non trouvé' } });
    }

    const file = result.rows[0];

    // Supprimer le fichier physique
    try {
      await fs.unlink(file.file_path);
    } catch (e) {
      logger.warn('Fichier physique non trouvé:', file.file_path);
    }

    // Supprimer de la BDD
    await pool.query('DELETE FROM project_files WHERE id = $1', [id]);

    logger.info('Fichier projet supprimé:', { fileId: id, deletedBy: req.user.id });

    res.json({ message: 'Fichier supprimé' });
  } catch (error) {
    logger.error('Erreur suppression fichier projet:', error);
    res.status(500).json({ error: { message: 'Erreur serveur' } });
  }
});

// POST /project-files/:id/new-version - Uploader nouvelle version
router.post('/:id/new-version', upload.single('file'), async (req, res) => {
  const { id } = req.params;

  if (!req.file) {
    return res.status(400).json({ error: { message: 'Aucun fichier fourni' } });
  }

  try {
    // Récupérer le fichier parent
    const parentResult = await pool.query(
      'SELECT * FROM project_files WHERE id = $1',
      [id]
    );

    if (parentResult.rows.length === 0) {
      return res.status(404).json({ error: { message: 'Fichier parent non trouvé' } });
    }

    const parent = parentResult.rows[0];

    // Trouver la dernière version
    const versionResult = await pool.query(
      `SELECT MAX(version) as max_version FROM project_files
       WHERE id = $1 OR parent_file_id = $1`,
      [id]
    );
    const newVersion = (versionResult.rows[0].max_version || 1) + 1;

    // Créer la nouvelle version
    const result = await pool.query(
      `INSERT INTO project_files
       (project_id, filename, original_filename, file_path, file_type, file_size, category, description, version, parent_file_id, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        parent.project_id,
        req.file.filename,
        req.file.originalname,
        req.file.path,
        req.file.mimetype,
        req.file.size,
        parent.category,
        parent.description,
        newVersion,
        parent.parent_file_id || parent.id, // Toujours pointer vers le fichier original
        req.user.id
      ]
    );

    logger.info('Nouvelle version uploadée:', {
      parentId: id,
      newVersion,
      uploadedBy: req.user.id
    });

    res.status(201).json({
      message: `Version ${newVersion} uploadée`,
      file: result.rows[0]
    });
  } catch (error) {
    logger.error('Erreur upload nouvelle version:', error);
    res.status(500).json({ error: { message: 'Erreur serveur' } });
  }
});

// GET /project-files/:id/versions - Historique des versions
router.get('/:id/versions', async (req, res) => {
  const { id } = req.params;

  try {
    // Récupérer le fichier et toutes ses versions
    const result = await pool.query(
      `SELECT pf.*, u.first_name || ' ' || u.last_name as uploader_name
       FROM project_files pf
       LEFT JOIN users u ON pf.uploaded_by = u.id
       WHERE pf.id = $1 OR pf.parent_file_id = $1
       ORDER BY pf.version DESC`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: { message: 'Fichier non trouvé' } });
    }

    res.json({ versions: result.rows });
  } catch (error) {
    logger.error('Erreur récupération versions:', error);
    res.status(500).json({ error: { message: 'Erreur serveur' } });
  }
});

module.exports = router;
