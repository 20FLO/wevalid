const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const upload = require('../middleware/upload');
const logger = require('../utils/logger');
const path = require('path');
const fs = require('fs').promises;
const sharp = require('sharp');

// ============================================
// ENDPOINT PUBLIC - Miniatures (pas d'auth)
// ============================================

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

// ============================================
// TOUS LES AUTRES ENDPOINTS NÉCESSITENT AUTH
// ============================================

router.use(authenticateToken);

// Upload de fichier(s) pour une page
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
      // Marquer les anciens fichiers comme is_current = false
      await client.query(
        'UPDATE files SET is_current = false WHERE page_id = $1 AND is_current = true',
        [page_id]
      );

      // Récupérer le numéro de version suivant
      const versionResult = await client.query(
        'SELECT COALESCE(MAX(version), 0) + 1 as next_version FROM files WHERE page_id = $1',
        [page_id]
      );
      const nextVersion = versionResult.rows[0].next_version;

      // Générer une miniature si c'est un PDF ou une image
      let thumbnailPath = null;
      
      if (file.mimetype === 'application/pdf') {
        thumbnailPath = await generatePDFThumbnail(file.path);
      } else if (file.mimetype.startsWith('image/')) {
        thumbnailPath = await generateImageThumbnail(file.path);
      }

      // Insérer dans la DB avec is_current = true et version
      const result = await client.query(
        `INSERT INTO files (page_id, filename, original_filename, file_path, thumbnail_path, file_type, file_size, uploaded_by, is_current, version)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [
          page_id,
          file.filename,
          file.originalname,
          file.path,
          thumbnailPath,
          file.mimetype,
          file.size,
          req.user.id,
          true, // is_current
          nextVersion // version
        ]
      );

      uploadedFiles.push(result.rows[0]);

      logger.info('Fichier uploadé (version):', { 
        pageId: page_id, 
        version: nextVersion,
        filename: file.originalname,
        uploadedBy: req.user.id 
      });
    }

    await client.query('COMMIT');

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

// ============================================
// UPLOAD PDF COMPLET AVEC DÉCOUPAGE AUTO
// ============================================

router.post('/upload-complete-pdf', upload.single('file'), async (req, res) => {
  console.log('=== DEBUG UPLOAD ===');
  console.log('Headers:', req.headers);
  console.log('Body:', req.body);
  console.log('File:', req.file);
  console.log('Query:', req.query);
  console.log('===================');

  const project_id = req.body.project_id || req.query.project_id;

  if (!project_id) {
    return res.status(400).json({ error: { message: 'project_id requis' } });
  }

  if (!req.file) {
    return res.status(400).json({ error: { message: 'Aucun fichier uploadé' } });
  }

  if (req.file.mimetype !== 'application/pdf') {
    return res.status(400).json({ error: { message: 'Le fichier doit être un PDF' } });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Vérifier que le projet existe
    const projectCheck = await client.query('SELECT id, total_pages FROM projects WHERE id = $1', [project_id]);
    if (projectCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: { message: 'Projet non trouvé' } });
    }

    const project = projectCheck.rows[0];

    // Compter le nombre de pages du PDF
    const pdfPageCount = await countPDFPages(req.file.path);

    logger.info('PDF complet uploadé:', { 
      filename: req.file.originalname, 
      pagesInPDF: pdfPageCount,
      pagesInProject: project.total_pages 
    });

    // Découper le PDF et assigner aux pages
    const uploadedFiles = await splitAndAssignPDF(
      req.file.path, 
      project_id, 
      pdfPageCount,
      req.user.id,
      client
    );

    await client.query('COMMIT');

    logger.info('PDF découpé et assigné:', { 
      projectId: project_id, 
      filesCreated: uploadedFiles.length 
    });

    res.status(201).json({
      message: `PDF découpé avec succès en ${uploadedFiles.length} pages`,
      files: uploadedFiles,
      stats: {
        pdf_pages: pdfPageCount,
        project_pages: project.total_pages,
        files_created: uploadedFiles.length
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Erreur lors du traitement du PDF complet:', error);
    res.status(500).json({ error: { message: 'Erreur serveur: ' + error.message } });
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

// Récupérer l'historique des versions d'une page
router.get('/page/:pageId/history', async (req, res) => {
  const { pageId } = req.params;

  try {
    const result = await pool.query(
      `SELECT f.*, u.first_name || ' ' || u.last_name as uploaded_by_name
       FROM files f
       LEFT JOIN users u ON f.uploaded_by = u.id
       WHERE f.page_id = $1
       ORDER BY f.version DESC`,
      [pageId]
    );

    res.json({ 
      page_id: pageId,
      versions: result.rows 
    });
  } catch (error) {
    logger.error('Erreur récupération historique versions:', error);
    res.status(500).json({ error: { message: 'Erreur serveur' } });
  }
});

// ============================================
// FONCTIONS UTILITAIRES
// ============================================

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

// Compter le nombre de pages d'un PDF
// Compter le nombre de pages d'un PDF
async function countPDFPages(pdfPath) {
  try {
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execPromise = promisify(exec);

    const { stdout } = await execPromise(`pdfinfo "${pdfPath}" | grep "^Pages:" | awk '{print $2}'`);
    const pageCount = parseInt(stdout.trim());
    
    if (isNaN(pageCount) || pageCount <= 0) {
      throw new Error('Nombre de pages invalide');
    }
    
    return pageCount;
  } catch (error) {
    logger.error('Erreur comptage pages PDF:', error);
    throw new Error('Impossible de compter les pages du PDF');
  }
}

// Découper un PDF et assigner aux pages du projet
async function splitAndAssignPDF(pdfPath, projectId, pdfPageCount, userId, client) {
  try {
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execPromise = promisify(exec);

    // Récupérer les pages du projet
    const pagesResult = await client.query(
      'SELECT id, page_number FROM pages WHERE project_id = $1 ORDER BY page_number',
      [projectId]
    );

    const projectPages = pagesResult.rows;
    const uploadedFiles = [];

    // Limiter au nombre de pages du PDF ou du projet
    const maxPages = Math.min(pdfPageCount, projectPages.length);

    logger.info(`Découpage en cours: ${maxPages} pages à traiter...`);

    for (let i = 0; i < maxPages; i++) {
      const pageNum = i + 1;
      const projectPage = projectPages[i];

      // Marquer les anciens fichiers de cette page comme is_current = false
      await client.query(
        'UPDATE files SET is_current = false WHERE page_id = $1 AND is_current = true',
        [projectPage.id]
      );

      // Récupérer le numéro de version suivant
      const versionResult = await client.query(
        'SELECT COALESCE(MAX(version), 0) + 1 as next_version FROM files WHERE page_id = $1',
        [projectPage.id]
      );
      const nextVersion = versionResult.rows[0].next_version;

      // Créer un nom de fichier unique
      const timestamp = Date.now();
      const randomString = Math.random().toString(36).substring(7);
      const outputFilename = `${timestamp}-${randomString}-page${pageNum}.pdf`;
      const outputPath = path.join('/app/storage/uploads', outputFilename);

      // Extraire la page avec ghostscript
      await execPromise(
        `gs -dSAFER -dBATCH -dNOPAUSE -sDEVICE=pdfwrite -dFirstPage=${pageNum} -dLastPage=${pageNum} -sOutputFile=${outputPath} ${pdfPath}`
      );

      // Générer la miniature
      const thumbnailPath = await generatePDFThumbnail(outputPath);

      // Récupérer la taille du fichier
      const stats = await fs.stat(outputPath);

      // Insérer dans la DB
      const result = await client.query(
        `INSERT INTO files (page_id, filename, original_filename, file_path, thumbnail_path, file_type, file_size, uploaded_by, is_current, version)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [
          projectPage.id,
          outputFilename,
          `page_${pageNum}.pdf`,
          outputPath,
          thumbnailPath,
          'application/pdf',
          stats.size,
          userId,
          true, // is_current
          nextVersion // version
        ]
      );

      uploadedFiles.push(result.rows[0]);

      // Log progression tous les 10 pages
      if (pageNum % 10 === 0) {
        logger.info(`Progression découpage: ${pageNum}/${maxPages} pages`);
      }
    }

    // Supprimer le PDF original uploadé
    try {
      await fs.unlink(pdfPath);
    } catch (error) {
      logger.warn('Impossible de supprimer le PDF original:', error);
    }

    return uploadedFiles;
  } catch (error) {
    logger.error('Erreur découpage PDF:', error);
    throw error;
  }
}

module.exports = router;