const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const upload = require('../middleware/upload');
const logger = require('../utils/logger');
const path = require('path');
const fs = require('fs').promises;
const sharp = require('sharp');

router.use(authenticateToken);

// Upload de fichier(s)
router.post('/upload', upload.array('files', 10), async (req, res) => {
  const { page_id } = req.body;

  if (!page_id) {
    return res.status(400).json({ error: { message: 'page_id requis' } });
  }

  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: { message: 'Aucun fichier uploadé' } });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Vérifier que la page existe
    const pageCheck = await client.query('SELECT id, project_id FROM pages WHERE id = $1', [page_id]);
    if (pageCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: { message: 'Page non trouvée' } });
    }

    const uploadedFiles = [];

    for (const file of req.files) {
      // Générer une miniature si c'est un PDF ou une image
      let thumbnailPath = null;
      
      if (file.mimetype === 'application/pdf') {
        // Pour les PDF, on génère une miniature de la première page
        // (nécessite ghostscript installé dans le container)
        thumbnailPath = await generatePDFThumbnail(file.path);
      } else if (file.mimetype.startsWith('image/')) {
        // Pour les images, on crée une miniature
        thumbnailPath = await generateImageThumbnail(file.path);
      }

      // Insérer dans la DB
      const result = await client.query(
        `INSERT INTO files (page_id, filename, original_filename, file_path, thumbnail_path, file_type, file_size, uploaded_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          page_id,
          file.filename,
          file.originalname,
          file.path,
          thumbnailPath,
          file.mimetype,
          file.size,
          req.user.id
        ]
      );

      uploadedFiles.push(result.rows[0]);
    }

    await client.query('COMMIT');

    logger.info('Fichiers uploadés:', { 
      pageId: page_id, 
      filesCount: uploadedFiles.length, 
      uploadedBy: req.user.id 
    });

    res.status(201).json({
      message: 'Fichiers uploadés avec succès',
      files: uploadedFiles
    });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Erreur lors de l\'upload:', error);
    res.status(500).json({ error: { message: 'Erreur serveur' } });
  } finally {
    client.release();
  }
});

// Télécharger un fichier
router.get('/download/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      'SELECT * FROM files WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: { message: 'Fichier non trouvé' } });
    }

    const file = result.rows[0];
    const filePath = file.file_path;

    // Vérifier que le fichier existe
    try {
      await fs.access(filePath);
    } catch {
      return res.status(404).json({ error: { message: 'Fichier physique introuvable' } });
    }

    res.download(filePath, file.original_filename);

    logger.info('Fichier téléchargé:', { fileId: id, downloadedBy: req.user.id });
  } catch (error) {
    logger.error('Erreur lors du téléchargement:', error);
    res.status(500).json({ error: { message: 'Erreur serveur' } });
  }
});

// Récupérer la miniature d'un fichier
router.get('/thumbnail/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      'SELECT thumbnail_path, original_filename FROM files WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: { message: 'Fichier non trouvé' } });
    }

    const file = result.rows[0];

    if (!file.thumbnail_path) {
      return res.status(404).json({ error: { message: 'Pas de miniature disponible' } });
    }

    // Vérifier que le fichier existe
    try {
      await fs.access(file.thumbnail_path);
    } catch {
      return res.status(404).json({ error: { message: 'Miniature introuvable' } });
    }

    res.sendFile(path.resolve(file.thumbnail_path));
  } catch (error) {
    logger.error('Erreur lors de la récupération de la miniature:', error);
    res.status(500).json({ error: { message: 'Erreur serveur' } });
  }
});

// Supprimer un fichier
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const result = await client.query('SELECT * FROM files WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: { message: 'Fichier non trouvé' } });
    }

    const file = result.rows[0];

    // Vérifier les permissions (seulement le uploader, l'éditeur ou le fabricant peuvent supprimer)
    if (file.uploaded_by !== req.user.id && 
        req.user.role !== 'editeur' && 
        req.user.role !== 'fabricant') {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: { message: 'Accès refusé' } });
    }

    // Supprimer les fichiers physiques
    try {
      await fs.unlink(file.file_path);
      if (file.thumbnail_path) {
        await fs.unlink(file.thumbnail_path);
      }
    } catch (error) {
      logger.warn('Erreur lors de la suppression des fichiers physiques:', error);
    }

    // Supprimer de la DB
    await client.query('DELETE FROM files WHERE id = $1', [id]);

    await client.query('COMMIT');

    logger.info('Fichier supprimé:', { fileId: id, deletedBy: req.user.id });

    res.json({ message: 'Fichier supprimé avec succès' });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Erreur lors de la suppression:', error);
    res.status(500).json({ error: { message: 'Erreur serveur' } });
  } finally {
    client.release();
  }
});

// Fonction pour générer une miniature d'image
async function generateImageThumbnail(imagePath) {
  try {
    const thumbnailFilename = `thumb_${path.basename(imagePath)}`;
    const thumbnailPath = path.join('/app/storage/thumbnails', thumbnailFilename);

    await sharp(imagePath)
      .resize(300, 300, { fit: 'inside' })
      .jpeg({ quality: 80 })
      .toFile(thumbnailPath);

    return thumbnailPath;
  } catch (error) {
    logger.error('Erreur lors de la génération de miniature image:', error);
    return null;
  }
}

// Fonction pour générer une miniature de PDF
async function generatePDFThumbnail(pdfPath) {
  try {
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execPromise = promisify(exec);

    const thumbnailFilename = `thumb_${path.basename(pdfPath, '.pdf')}.jpg`;
    const thumbnailPath = path.join('/app/storage/thumbnails', thumbnailFilename);

    // Utiliser ghostscript pour extraire la première page
    await execPromise(
      `gs -dSAFER -dBATCH -dNOPAUSE -sDEVICE=jpeg -r150 -dFirstPage=1 -dLastPage=1 -sOutputFile=${thumbnailPath} ${pdfPath}`
    );

    // Redimensionner avec sharp
    await sharp(thumbnailPath)
      .resize(300, 300, { fit: 'inside' })
      .jpeg({ quality: 80 })
      .toFile(thumbnailPath + '.resized');

    await fs.rename(thumbnailPath + '.resized', thumbnailPath);

    return thumbnailPath;
  } catch (error) {
    logger.error('Erreur lors de la génération de miniature PDF:', error);
    return null;
  }
}

module.exports = router;