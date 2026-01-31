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
const { embedAnnotationsInPDF } = require('../utils/pdfAnnotationEmbed');
const { extractPageLabels, parsePageLabel, createPageMapping } = require('../utils/pdfPageLabels');

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
  const start_page = parseInt(req.body.start_page) || null; // Page de départ (folio) - null = auto-detect via Page Labels
  const use_page_labels = req.body.use_page_labels !== 'false'; // Utiliser les Page Labels par défaut

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

    // 1. Sauvegarder le PDF global dans project_files
    const globalPdfResult = await client.query(
      `INSERT INTO project_files (project_id, filename, original_filename, file_path, file_type, file_size, category, description, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        project_id,
        req.file.filename,
        req.file.originalname,
        req.file.path,
        req.file.mimetype,
        req.file.size,
        'document',
        `PDF source - ${pdfPageCount} pages`,
        req.user.id
      ]
    );
    const globalPdfFile = globalPdfResult.rows[0];

    logger.info('PDF global sauvegardé dans project_files:', {
      projectFileId: globalPdfFile.id,
      filename: req.file.originalname
    });

    // 2. Extraire les Page Labels si demandé
    let pageLabels = [];
    let mappingMode = 'sequential';

    if (use_page_labels) {
      try {
        pageLabels = await extractPageLabels(req.file.path);
        if (pageLabels.length > 0) {
          mappingMode = 'page_labels';
          logger.info('Page Labels extraits:', { count: pageLabels.length, labels: pageLabels.slice(0, 5) });
        }
      } catch (labelError) {
        logger.warn('Impossible d\'extraire les Page Labels:', labelError.message);
      }
    }

    // 3. Découper et assigner les pages
    const uploadedFiles = await splitAndAssignPDF(
      req.file.path,
      project_id,
      pdfPageCount,
      req.user.id,
      client,
      extract_annotations,
      start_page || 1, // Fallback to 1 if not specified
      pageLabels,
      globalPdfFile.id // Passer l'ID du PDF global pour la liaison
    );

    await client.query('COMMIT');

    logger.info('PDF découpé et assigné:', {
      projectId: project_id,
      filesCreated: uploadedFiles.length,
      mappingMode
    });

    res.status(201).json({
      message: `PDF découpé avec succès en ${uploadedFiles.length} pages`,
      global_pdf: globalPdfFile,
      files: uploadedFiles,
      stats: {
        pdf_pages: pdfPageCount,
        project_pages: project.total_pages,
        files_created: uploadedFiles.length,
        mapping_mode: mappingMode,
        page_labels_found: pageLabels.length
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

// Télécharger un PDF avec annotations incrustées
router.get('/download-annotated/:id', async (req, res) => {
  const { id } = req.params;

  try {
    // Get file info
    const fileResult = await pool.query(
      `SELECT f.*, p.page_number, p.id as page_id
       FROM files f
       JOIN pages p ON f.page_id = p.id
       WHERE f.id = $1`,
      [id]
    );

    if (fileResult.rows.length === 0) {
      return res.status(404).json({ error: { message: 'Fichier non trouvé' } });
    }

    const file = fileResult.rows[0];

    // Check if it's a PDF
    if (file.file_type !== 'application/pdf') {
      return res.status(400).json({ error: { message: 'Seuls les PDFs peuvent avoir des annotations incrustées' } });
    }

    // Check file exists
    try {
      await fs.access(file.file_path);
    } catch {
      return res.status(404).json({ error: { message: 'Fichier physique introuvable' } });
    }

    // Get annotations for this page
    const annotResult = await pool.query(
      `SELECT a.*, u.first_name || ' ' || u.last_name as author_name,
              ROW_NUMBER() OVER (ORDER BY a.created_at) as marker_number
       FROM annotations a
       LEFT JOIN users u ON a.created_by = u.id
       WHERE a.page_id = $1
       ORDER BY a.created_at`,
      [file.page_id]
    );

    const annotations = annotResult.rows;

    if (annotations.length === 0) {
      // No annotations, just return original file
      return res.download(file.file_path, file.original_filename);
    }

    // Embed annotations into PDF
    const annotatedPdfBuffer = await embedAnnotationsInPDF(file.file_path, annotations);

    // Generate filename
    const baseName = file.original_filename.replace(/\.pdf$/i, '');
    const annotatedFilename = `${baseName}_annote.pdf`;

    // Send the annotated PDF
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${annotatedFilename}"`);
    res.send(annotatedPdfBuffer);

    logger.info('PDF annoté téléchargé:', {
      fileId: id,
      annotationsCount: annotations.length,
      downloadedBy: req.user.id
    });

  } catch (error) {
    logger.error('Erreur lors du téléchargement annoté:', error);
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

// ============================================
// TÉLÉCHARGEMENT MULTI-PAGES
// ============================================

// Télécharger plusieurs pages en un seul PDF
router.post('/download-multi', async (req, res) => {
  const { page_ids, include_annotations = true } = req.body;

  if (!page_ids || !Array.isArray(page_ids) || page_ids.length === 0) {
    return res.status(400).json({ error: { message: 'page_ids requis (tableau de IDs de pages)' } });
  }

  try {
    // Get files for each page (latest version)
    const filesResult = await pool.query(
      `SELECT f.*, p.page_number, p.project_id
       FROM files f
       JOIN pages p ON f.page_id = p.id
       WHERE f.page_id = ANY($1) AND f.is_current = true
       ORDER BY p.page_number`,
      [page_ids]
    );

    if (filesResult.rows.length === 0) {
      return res.status(404).json({ error: { message: 'Aucun fichier trouvé pour ces pages' } });
    }

    const files = filesResult.rows;
    const projectId = files[0].project_id;

    // Verify all pages belong to same project
    const allSameProject = files.every(f => f.project_id === projectId);
    if (!allSameProject) {
      return res.status(400).json({ error: { message: 'Toutes les pages doivent appartenir au même projet' } });
    }

    // Check if all files are PDFs
    const allPdfs = files.every(f => f.file_type === 'application/pdf');
    if (!allPdfs) {
      return res.status(400).json({ error: { message: 'Toutes les pages doivent être des PDFs' } });
    }

    // Get project name for filename
    const projectResult = await pool.query('SELECT title FROM projects WHERE id = $1', [projectId]);
    const projectTitle = projectResult.rows[0]?.title || 'projet';

    // Create temp output file
    const timestamp = Date.now();
    const outputFilename = `${timestamp}-merged.pdf`;
    const outputPath = path.join('/app/storage/uploads', outputFilename);

    // If including annotations, we need to embed them first
    let filesToMerge = files.map(f => f.file_path);

    if (include_annotations) {
      filesToMerge = [];

      for (const file of files) {
        // Get annotations for this page
        const annotationsResult = await pool.query(
          `SELECT a.*, u.first_name || ' ' || u.last_name as author_name
           FROM annotations a
           JOIN users u ON a.created_by = u.id
           WHERE a.page_id = $1
           ORDER BY a.created_at`,
          [file.page_id]
        );

        const annotations = annotationsResult.rows;

        if (annotations.length > 0) {
          // Embed annotations
          const annotatedPath = await embedAnnotationsInPDF(file.file_path, annotations);
          filesToMerge.push(annotatedPath);
        } else {
          filesToMerge.push(file.file_path);
        }
      }
    }

    // Merge PDFs using Ghostscript
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execPromise = promisify(exec);

    const inputFiles = filesToMerge.map(f => `"${f}"`).join(' ');
    await execPromise(
      `gs -dSAFER -dBATCH -dNOPAUSE -sDEVICE=pdfwrite -sOutputFile="${outputPath}" ${inputFiles}`
    );

    // Clean up temp annotated files
    if (include_annotations) {
      for (const tempPath of filesToMerge) {
        if (tempPath.includes('annotated-') && tempPath !== files.find(f => f.file_path === tempPath)?.file_path) {
          try {
            await fs.unlink(tempPath);
          } catch (e) {
            // Ignore cleanup errors
          }
        }
      }
    }

    // Send the merged file
    const sanitizedTitle = projectTitle.replace(/[^a-zA-Z0-9-_]/g, '_').substring(0, 50);
    const downloadName = `${sanitizedTitle}_pages_${files[0].page_number}-${files[files.length - 1].page_number}.pdf`;

    res.download(outputPath, downloadName, async (err) => {
      // Clean up merged file after download
      try {
        await fs.unlink(outputPath);
      } catch (e) {
        // Ignore cleanup errors
      }

      if (err) {
        logger.error('Erreur envoi fichier fusionné:', err);
      }
    });

    logger.info('Téléchargement multi-pages:', {
      projectId,
      pageCount: files.length,
      includeAnnotations: include_annotations,
      downloadedBy: req.user.id
    });

  } catch (error) {
    logger.error('Erreur téléchargement multi-pages:', error);
    res.status(500).json({ error: { message: 'Erreur serveur' } });
  }
});

// Télécharger toutes les pages d'un projet
router.get('/download-project/:projectId', async (req, res) => {
  const { projectId } = req.params;
  const includeAnnotations = req.query.annotations !== 'false';

  try {
    // Get all pages with their latest files
    const filesResult = await pool.query(
      `SELECT f.*, p.page_number
       FROM files f
       JOIN pages p ON f.page_id = p.id
       WHERE p.project_id = $1 AND f.is_current = true AND f.file_type = 'application/pdf'
       ORDER BY p.page_number`,
      [projectId]
    );

    if (filesResult.rows.length === 0) {
      return res.status(404).json({ error: { message: 'Aucun fichier PDF trouvé pour ce projet' } });
    }

    const files = filesResult.rows;

    // Get project name
    const projectResult = await pool.query('SELECT title FROM projects WHERE id = $1', [projectId]);
    const projectTitle = projectResult.rows[0]?.title || 'projet';

    // Create temp output file
    const timestamp = Date.now();
    const outputFilename = `${timestamp}-complete.pdf`;
    const outputPath = path.join('/app/storage/uploads', outputFilename);

    let filesToMerge = files.map(f => f.file_path);

    if (includeAnnotations) {
      filesToMerge = [];

      for (const file of files) {
        const annotationsResult = await pool.query(
          `SELECT a.*, u.first_name || ' ' || u.last_name as author_name
           FROM annotations a
           JOIN users u ON a.created_by = u.id
           WHERE a.page_id = $1
           ORDER BY a.created_at`,
          [file.page_id]
        );

        const annotations = annotationsResult.rows;

        if (annotations.length > 0) {
          const annotatedPath = await embedAnnotationsInPDF(file.file_path, annotations);
          filesToMerge.push(annotatedPath);
        } else {
          filesToMerge.push(file.file_path);
        }
      }
    }

    // Merge PDFs
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execPromise = promisify(exec);

    const inputFiles = filesToMerge.map(f => `"${f}"`).join(' ');
    await execPromise(
      `gs -dSAFER -dBATCH -dNOPAUSE -sDEVICE=pdfwrite -sOutputFile="${outputPath}" ${inputFiles}`
    );

    // Cleanup temp files
    if (includeAnnotations) {
      for (const tempPath of filesToMerge) {
        if (tempPath.includes('annotated-')) {
          try {
            await fs.unlink(tempPath);
          } catch (e) {
            // Ignore
          }
        }
      }
    }

    const sanitizedTitle = projectTitle.replace(/[^a-zA-Z0-9-_]/g, '_').substring(0, 50);
    const downloadName = `${sanitizedTitle}_complet.pdf`;

    res.download(outputPath, downloadName, async () => {
      try {
        await fs.unlink(outputPath);
      } catch (e) {
        // Ignore
      }
    });

    logger.info('Téléchargement projet complet:', {
      projectId,
      pageCount: files.length,
      includeAnnotations,
      downloadedBy: req.user.id
    });

  } catch (error) {
    logger.error('Erreur téléchargement projet:', error);
    res.status(500).json({ error: { message: 'Erreur serveur' } });
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

async function splitAndAssignPDF(pdfPath, projectId, pdfPageCount, userId, client, extractAnnotations = true, startPage = 1, pageLabels = [], globalPdfId = null) {
  try {
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execPromise = promisify(exec);

    // Get all project pages
    const pagesResult = await client.query(
      'SELECT id, page_number FROM pages WHERE project_id = $1 ORDER BY page_number',
      [projectId]
    );

    const projectPages = pagesResult.rows;
    const uploadedFiles = [];

    // Créer un index des pages projet par numéro
    const projectPagesByNumber = {};
    for (const page of projectPages) {
      projectPagesByNumber[page.page_number] = page;
    }

    // Déterminer le mapping PDF -> pages projet
    let pageMapping = [];

    if (pageLabels.length > 0) {
      // Utiliser les Page Labels pour le mapping
      logger.info('Utilisation des Page Labels pour le mapping...');

      for (let pdfPageNum = 1; pdfPageNum <= pdfPageCount; pdfPageNum++) {
        const labelInfo = pageLabels.find(l => l.pdfPage === pdfPageNum);
        let targetPageNumber = null;

        if (labelInfo && labelInfo.label) {
          // Essayer de parser le label pour obtenir un numéro de page
          targetPageNumber = parsePageLabel(labelInfo.label);
        }

        // Si pas de label ou label non parsable, utiliser le mapping séquentiel
        if (!targetPageNumber) {
          targetPageNumber = startPage + pdfPageNum - 1;
        }

        if (projectPagesByNumber[targetPageNumber]) {
          pageMapping.push({
            pdfPage: pdfPageNum,
            projectPage: projectPagesByNumber[targetPageNumber],
            label: labelInfo?.label || String(targetPageNumber)
          });
        }
      }
    } else {
      // Mapping séquentiel classique
      logger.info(`Mapping séquentiel à partir de la page ${startPage}...`);

      for (let i = 0; i < pdfPageCount; i++) {
        const pdfPageNum = i + 1;
        const targetPageNumber = startPage + i;

        if (projectPagesByNumber[targetPageNumber]) {
          pageMapping.push({
            pdfPage: pdfPageNum,
            projectPage: projectPagesByNumber[targetPageNumber],
            label: String(targetPageNumber)
          });
        }
      }
    }

    logger.info(`Découpage en cours: ${pageMapping.length} pages à traiter...`);

    for (let i = 0; i < pageMapping.length; i++) {
      const { pdfPage, projectPage, label } = pageMapping[i];

      // Marquer les anciens fichiers comme non-courants
      await client.query(
        'UPDATE files SET is_current = false WHERE page_id = $1 AND is_current = true',
        [projectPage.id]
      );

      // Obtenir le prochain numéro de version
      const versionResult = await client.query(
        'SELECT COALESCE(MAX(version), 0) + 1 as next_version FROM files WHERE page_id = $1',
        [projectPage.id]
      );
      const nextVersion = versionResult.rows[0].next_version;

      // Générer le nom du fichier de sortie
      const timestamp = Date.now();
      const randomString = Math.random().toString(36).substring(7);
      const outputFilename = `${timestamp}-${randomString}-page${projectPage.page_number}.pdf`;
      const outputPath = path.join('/app/storage/uploads', outputFilename);

      // Extraire la page du PDF
      await execPromise(
        `gs -dSAFER -dBATCH -dNOPAUSE -sDEVICE=pdfwrite -dFirstPage=${pdfPage} -dLastPage=${pdfPage} -sOutputFile="${outputPath}" "${pdfPath}"`
      );

      // Générer la miniature
      const thumbnailPath = await generatePDFThumbnail(outputPath);
      const stats = await fs.stat(outputPath);

      // Extraire les annotations de la page si demandé
      if (extractAnnotations) {
        try {
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
        } catch (annotError) {
          logger.warn(`Erreur extraction annotations page ${pdfPage}:`, annotError.message);
        }
      }

      // Insérer le fichier dans la base
      // Try with source tracking columns first, fallback if they don't exist
      let result;
      try {
        result = await client.query(
          `INSERT INTO files (page_id, filename, original_filename, file_path, thumbnail_path, file_type, file_size, uploaded_by, is_current, version, source_project_file_id, source_pdf_page)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
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
            nextVersion,
            globalPdfId, // Lien vers le PDF source
            pdfPage // Numéro de page dans le PDF source
          ]
        );
      } catch (insertError) {
        // Fallback: columns might not exist yet
        if (insertError.message.includes('source_project_file_id') || insertError.message.includes('source_pdf_page')) {
          logger.warn('Source tracking columns not found, inserting without them');
          result = await client.query(
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
        } else {
          throw insertError;
        }
      }

      uploadedFiles.push({
        ...result.rows[0],
        mapped_from_label: label
      });

      if ((i + 1) % 10 === 0) {
        logger.info(`Progression découpage: ${i + 1}/${pageMapping.length} pages`);
      }
    }

    // Note: On ne supprime plus le PDF original car il est maintenant sauvegardé dans project_files

    return uploadedFiles;
  } catch (error) {
    logger.error('Erreur découpage PDF:', error);
    throw error;
  }
}

module.exports = router;
