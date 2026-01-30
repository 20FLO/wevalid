const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const upload = require('../middleware/upload');
const logger = require('../utils/logger');
const path = require('path');
const fs = require('fs').promises;
const sharp = require('sharp');
const { extractAnnotationsFromPDF } = require('../utils/pdfAnnotations');

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

// Upload de fichier(s) pour une page (admin + fabricant + auteurs + éditeurs)
router.post('/upload', authorizeRoles('admin', 'fabricant', 'auteur', 'editeur'), upload.array('files', 10), async (req, res) => {
  const { page_id, extract_annotations } = req.body;

  if (!page_id) {
    return res.status(400).json({ error: { message: 'page_id requis' } });
  }

  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: { message: 'Aucun fichier uploadé' } });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const pageCheck = await client.query('SELECT id, project_id FROM pages WHERE id = $1', [page_id]);
    if (pageCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: { message: 'Page non trouvée' } });
    }

    const uploadedFiles = [];
    let extractedAnnotationsCount = 0;

    for (const file of req.files) {
      await client.query(
        'UPDATE files SET is_current = false WHERE page_id = $1 AND is_current = true',
        [page_id]
      );

      const versionResult = await client.query(
        'SELECT COALESCE(MAX(version), 0) + 1 as next_version FROM files WHERE page_id = $1',
        [page_id]
      );
      const nextVersion = versionResult.rows[0].next_version;

      let thumbnailPath = null;
      
      if (file.mimetype === 'application/pdf') {
        thumbnailPath = await generatePDFThumbnail(file.path);
        
        // Extraire les annotations du PDF si demandé ou par défaut
        if (extract_annotations !== 'false') {
          const extractedAnnotations = await extractAnnotationsFromPDF(file.path);
          
          for (const annot of extractedAnnotations) {
            if (annot.content && annot.content.trim()) {
              await client.query(
                `INSERT INTO annotations (page_id, type, content, position, color, created_by)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [
                  page_id,
                  annot.type,
                  annot.content,
                  JSON.stringify(annot.position),
                  annot.color,
                  req.user.id
                ]
              );
              extractedAnnotationsCount++;
            }
          }
        }
      } else if (file.mimetype.startsWith('image/')) {
        thumbnailPath = await generateImageThumbnail(file.path);
      }

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
          true,
          nextVersion
        ]
      );

      uploadedFiles.push(result.rows[0]);

      logger.info('Fichier uploadé (version):', { 
        pageId: page_id, 
        version: nextVersion,
        filename: file.originalname,
        uploadedBy: req.user.id,
        annotationsExtracted: extractedAnnotationsCount
      });
    }

    await client.query('COMMIT');

    res.status(201).json({
      message: 'Fichiers uploadés avec succès',
      files: uploadedFiles,
      annotations_extracted: extractedAnnotationsCount
    });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Erreur lors de l\'upload:', error);
    res.status(500).json({ error: { message: 'Erreur serveur' } });
  } finally {
    client.release();
  }
});

// Upload PDF complet avec découpage auto (admin + fabricant + auteurs + éditeurs)
router.post('/upload-complete-pdf', authorizeRoles('admin', 'fabricant', 'auteur', 'editeur'), upload.single('file'), async (req, res) => {
  const project_id = req.body.project_id || req.query.project_id;
  const extract_annotations = req.body.extract_annotations !== 'false';
  const start_page = parseInt(req.body.start_page) || 1; // Page de départ (folio)

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

    const projectCheck = await client.query('SELECT id, total_pages FROM projects WHERE id = $1', [project_id]);
    if (projectCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: { message: 'Projet non trouvé' } });
    }

    const project = projectCheck.rows[0];
    const pdfPageCount = await countPDFPages(req.file.path);

    logger.info('PDF complet uploadé:', { 
      filename: req.file.originalname, 
      pagesInPDF: pdfPageCount,
      pagesInProject: project.total_pages 
    });

    const uploadedFiles = await splitAndAssignPDF(
      req.file.path,
      project_id,
      pdfPageCount,
      req.user.id,
      client,
      extract_annotations,
      start_page
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
    const result = await pool.query('SELECT * FROM files WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: { message: 'Fichier non trouvé' } });
    }

    const file = result.rows[0];

    try {
      await fs.access(file.file_path);
    } catch {
      return res.status(404).json({ error: { message: 'Fichier physique introuvable' } });
    }

    res.download(file.file_path, file.original_filename);

    logger.info('Fichier téléchargé:', { fileId: id, downloadedBy: req.user.id });
  } catch (error) {
    logger.error('Erreur lors du téléchargement:', error);
    res.status(500).json({ error: { message: 'Erreur serveur' } });
  }
});

// Supprimer un fichier (admin + fabricant + éditeurs, ou l'uploader)
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

    if (req.user.role !== 'admin') {
      if (file.uploaded_by !== req.user.id && 
          req.user.role !== 'editeur' && 
          req.user.role !== 'fabricant') {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: { message: 'Accès refusé' } });
      }
    }

    try {
      await fs.unlink(file.file_path);
      if (file.thumbnail_path) {
        await fs.unlink(file.thumbnail_path);
      }
    } catch (error) {
      logger.warn('Erreur lors de la suppression des fichiers physiques:', error);
    }

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

async function generatePDFThumbnail(pdfPath) {
  try {
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execPromise = promisify(exec);

    const thumbnailFilename = `thumb_${path.basename(pdfPath, '.pdf')}.jpg`;
    const thumbnailPath = path.join('/app/storage/thumbnails', thumbnailFilename);

    await execPromise(
      `gs -dSAFER -dBATCH -dNOPAUSE -sDEVICE=jpeg -r150 -dFirstPage=1 -dLastPage=1 -sOutputFile=${thumbnailPath} ${pdfPath}`
    );

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

async function splitAndAssignPDF(pdfPath, projectId, pdfPageCount, userId, client, extractAnnotations = true, startPage = 1) {
  try {
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execPromise = promisify(exec);

    // Get project pages starting from the specified page number
    const pagesResult = await client.query(
      'SELECT id, page_number FROM pages WHERE project_id = $1 AND page_number >= $2 ORDER BY page_number',
      [projectId, startPage]
    );

    const projectPages = pagesResult.rows;
    const uploadedFiles = [];
    const maxPages = Math.min(pdfPageCount, projectPages.length);

    logger.info(`Découpage en cours: ${maxPages} pages à traiter (départ page ${startPage})...`);

    for (let i = 0; i < maxPages; i++) {
      const pdfPageNum = i + 1; // Page number in the PDF (1-indexed)
      const projectPage = projectPages[i]; // Corresponding project page

      await client.query(
        'UPDATE files SET is_current = false WHERE page_id = $1 AND is_current = true',
        [projectPage.id]
      );

      const versionResult = await client.query(
        'SELECT COALESCE(MAX(version), 0) + 1 as next_version FROM files WHERE page_id = $1',
        [projectPage.id]
      );
      const nextVersion = versionResult.rows[0].next_version;

      const timestamp = Date.now();
      const randomString = Math.random().toString(36).substring(7);
      const outputFilename = `${timestamp}-${randomString}-page${projectPage.page_number}.pdf`;
      const outputPath = path.join('/app/storage/uploads', outputFilename);

      // Extract the pdfPageNum-th page from the PDF
      await execPromise(
        `gs -dSAFER -dBATCH -dNOPAUSE -sDEVICE=pdfwrite -dFirstPage=${pdfPageNum} -dLastPage=${pdfPageNum} -sOutputFile=${outputPath} ${pdfPath}`
      );

      const thumbnailPath = await generatePDFThumbnail(outputPath);
      const stats = await fs.stat(outputPath);

      // Extraire les annotations de la page si demandé
      if (extractAnnotations) {
        const extractedAnnotations = await extractAnnotationsFromPDF(outputPath);
        for (const annot of extractedAnnotations) {
          if (annot.content && annot.content.trim()) {
            await client.query(
              `INSERT INTO annotations (page_id, type, content, position, color, created_by)
               VALUES ($1, $2, $3, $4, $5, $6)`,
              [
                projectPage.id,
                annot.type,
                annot.content,
                JSON.stringify(annot.position),
                annot.color,
                userId
              ]
            );
          }
        }
      }

      const result = await client.query(
        `INSERT INTO files (page_id, filename, original_filename, file_path, thumbnail_path, file_type, file_size, uploaded_by, is_current, version)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [
          projectPage.id,
          outputFilename,
          `page_${projectPage.page_number}.pdf`,
          outputPath,
          thumbnailPath,
          'application/pdf',
          stats.size,
          userId,
          true,
          nextVersion
        ]
      );

      uploadedFiles.push(result.rows[0]);

      if ((i + 1) % 10 === 0) {
        logger.info(`Progression découpage: ${i + 1}/${maxPages} pages`);
      }
    }

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
