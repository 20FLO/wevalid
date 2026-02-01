const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validation');
const logger = require('../utils/logger');
const { parseString, Builder } = require('xml2js');
const { promisify } = require('util');
const parseXML = promisify(parseString);
const { sendMentionNotification, parseMentions } = require('../utils/emailService');

router.use(authenticateToken);

// Récupérer toutes les annotations d'une page
router.get('/page/:pageId', async (req, res) => {
  const { pageId } = req.params;
  const { file_id } = req.query; // Optional: filter by file version

  try {
    let query = `
      SELECT a.*,
             u.first_name || ' ' || u.last_name as author_name,
             u.role as author_role,
             COALESCE(a.status, CASE WHEN a.resolved THEN 'resolved' ELSE 'open' END) as status,
             rv.version as resolved_in_version_number,
             (SELECT COUNT(*) FROM annotation_replies ar WHERE ar.annotation_id = a.id) as reply_count,
             cf.version as created_in_version,
             cf.id as created_in_file_id
      FROM annotations a
      JOIN users u ON a.created_by = u.id
      LEFT JOIN files rv ON a.resolved_in_version = rv.id
      LEFT JOIN files cf ON a.created_in_file_id = cf.id
      WHERE a.page_id = $1
    `;
    const params = [pageId];

    // If file_id is provided, include annotations from that version and earlier
    if (file_id) {
      query += ` AND (a.created_in_file_id IS NULL OR a.created_in_file_id <= $2)`;
      params.push(file_id);
    }

    query += ` ORDER BY a.created_at DESC`;

    const result = await pool.query(query, params);

    res.json({ annotations: result.rows });
  } catch (error) {
    logger.error('Erreur lors de la récupération des annotations:', error);
    res.status(500).json({ error: { message: 'Erreur serveur' } });
  }
});

// Créer une annotation (tous les membres authentifiés)
router.post('/', validate(schemas.createAnnotation), async (req, res) => {
  const { page_id, type, content, position, color, file_id } = req.validatedBody;

  try {
    const pageCheck = await pool.query('SELECT id FROM pages WHERE id = $1', [page_id]);
    if (pageCheck.rows.length === 0) {
      return res.status(404).json({ error: { message: 'Page non trouvée' } });
    }

    // If file_id provided, verify it belongs to this page
    if (file_id) {
      const fileCheck = await pool.query('SELECT id FROM files WHERE id = $1 AND page_id = $2', [file_id, page_id]);
      if (fileCheck.rows.length === 0) {
        return res.status(400).json({ error: { message: 'Fichier invalide pour cette page' } });
      }
    }

    const result = await pool.query(
      `INSERT INTO annotations (page_id, type, content, position, color, created_by, created_in_file_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'open')
       RETURNING *`,
      [page_id, type, content, JSON.stringify(position), color, req.user.id, file_id || null]
    );

    const annotation = result.rows[0];

    logger.info('Annotation créée:', {
      annotationId: annotation.id,
      pageId: page_id,
      fileId: file_id,
      createdBy: req.user.id
    });

    // Vérifier les mentions et envoyer des notifications
    if (content) {
      const mentionedNames = parseMentions(content);
      if (mentionedNames.length > 0) {
        // Récupérer les infos de la page et du projet
        const pageInfo = await pool.query(
          `SELECT p.page_number, pr.title as project_title, pr.id as project_id
           FROM pages p
           JOIN projects pr ON p.project_id = pr.id
           WHERE p.id = $1`,
          [page_id]
        );
        const pageData = pageInfo.rows[0];

        // Récupérer les membres du projet qui correspondent aux noms mentionnés
        const membersResult = await pool.query(
          `SELECT u.id, u.email, u.first_name, u.last_name
           FROM project_members pm
           JOIN users u ON pm.user_id = u.id
           WHERE pm.project_id = $1 AND u.is_active = true`,
          [pageData.project_id]
        );

        // Récupérer les infos de l'auteur
        const authorResult = await pool.query(
          'SELECT first_name, last_name, role FROM users WHERE id = $1',
          [req.user.id]
        );
        const author = authorResult.rows[0];
        const authorName = `${author.first_name} ${author.last_name}`;
        const frontendUrl = process.env.FRONTEND_URL || 'https://wevalid.fr';

        // Pour chaque membre, vérifier si son nom est mentionné
        for (const member of membersResult.rows) {
          const fullName = `${member.first_name} ${member.last_name}`;
          const isMentioned = mentionedNames.some(name =>
            name.toLowerCase() === fullName.toLowerCase()
          );

          if (isMentioned && member.id !== req.user.id) {
            sendMentionNotification({
              recipientEmail: member.email,
              recipientName: fullName,
              mentionedByName: authorName,
              mentionedByRole: author.role,
              projectTitle: pageData.project_title,
              pageNumber: pageData.page_number,
              commentText: content,
              pageUrl: `${frontendUrl}/projects/${pageData.project_id}/pages/${page_id}`
            }).catch(err => {
              logger.error('Erreur envoi notification mention:', { error: err.message, to: member.email });
            });
          }
        }
      }
    }

    res.status(201).json({
      message: 'Annotation créée avec succès',
      annotation
    });
  } catch (error) {
    logger.error('Erreur lors de la création de l\'annotation:', error);
    res.status(500).json({ error: { message: 'Erreur serveur' } });
  }
});

// Mettre à jour une annotation
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { content, position, color, resolved } = req.body;

  try {
    const currentAnnotation = await pool.query(
      'SELECT * FROM annotations WHERE id = $1',
      [id]
    );

    if (currentAnnotation.rows.length === 0) {
      return res.status(404).json({ error: { message: 'Annotation non trouvée' } });
    }

    const annotation = currentAnnotation.rows[0];

    if (req.user.role !== 'admin' &&
        annotation.created_by !== req.user.id &&
        typeof resolved === 'undefined') {
      return res.status(403).json({ error: { message: 'Seul le créateur peut modifier cette annotation' } });
    }

    const updates = {};
    if (content) updates.content = content;
    if (position) updates.position = JSON.stringify(position);
    if (color) updates.color = color;
    // Backward compatibility: resolved boolean maps to status
    if (typeof resolved === 'boolean') {
      updates.resolved = resolved;
      updates.status = resolved ? 'resolved' : 'open';
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: { message: 'Aucune donnée à mettre à jour' } });
    }

    const fields = Object.keys(updates);
    const values = Object.values(updates);
    const setClause = fields.map((field, index) => `${field} = $${index + 1}`).join(', ');

    const result = await pool.query(
      `UPDATE annotations SET ${setClause}, updated_at = NOW() WHERE id = $${fields.length + 1} RETURNING *`,
      [...values, id]
    );

    logger.info('Annotation mise à jour:', { annotationId: id, updatedBy: req.user.id });

    res.json({
      message: 'Annotation mise à jour avec succès',
      annotation: result.rows[0]
    });
  } catch (error) {
    logger.error('Erreur lors de la mise à jour de l\'annotation:', error);
    res.status(500).json({ error: { message: 'Erreur serveur' } });
  }
});

// Changer le statut d'une annotation (open, resolved, rejected)
router.put('/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status, status_reason, resolved_in_version } = req.body;

  if (!status || !['open', 'resolved', 'rejected'].includes(status)) {
    return res.status(400).json({
      error: { message: 'Statut invalide. Valeurs acceptées: open, resolved, rejected' }
    });
  }

  try {
    const currentAnnotation = await pool.query(
      'SELECT * FROM annotations WHERE id = $1',
      [id]
    );

    if (currentAnnotation.rows.length === 0) {
      return res.status(404).json({ error: { message: 'Annotation non trouvée' } });
    }

    // Only admin/editeur can reject, anyone can resolve
    if (status === 'rejected' && req.user.role !== 'admin' && req.user.role !== 'editeur') {
      return res.status(403).json({
        error: { message: 'Seuls les administrateurs et éditeurs peuvent refuser une annotation' }
      });
    }

    const updates = {
      status,
      resolved: status === 'resolved',
      status_reason: status === 'rejected' ? (status_reason || null) : null,
      resolved_in_version: status === 'resolved' ? (resolved_in_version || null) : null
    };

    const result = await pool.query(
      `UPDATE annotations
       SET status = $1, resolved = $2, status_reason = $3, resolved_in_version = $4, updated_at = NOW()
       WHERE id = $5
       RETURNING *`,
      [updates.status, updates.resolved, updates.status_reason, updates.resolved_in_version, id]
    );

    logger.info('Statut annotation mis à jour:', {
      annotationId: id,
      newStatus: status,
      updatedBy: req.user.id
    });

    res.json({
      message: 'Statut mis à jour avec succès',
      annotation: result.rows[0]
    });
  } catch (error) {
    logger.error('Erreur lors du changement de statut:', error);
    res.status(500).json({ error: { message: 'Erreur serveur' } });
  }
});

// ============================================
// RÉPONSES AUX ANNOTATIONS (Fil de discussion)
// ============================================

// Récupérer les réponses d'une annotation
router.get('/:id/replies', async (req, res) => {
  const { id } = req.params;

  try {
    const annotationCheck = await pool.query('SELECT id FROM annotations WHERE id = $1', [id]);
    if (annotationCheck.rows.length === 0) {
      return res.status(404).json({ error: { message: 'Annotation non trouvée' } });
    }

    const result = await pool.query(
      `SELECT ar.*,
              u.first_name || ' ' || u.last_name as author_name,
              u.role as author_role
       FROM annotation_replies ar
       LEFT JOIN users u ON ar.created_by = u.id
       WHERE ar.annotation_id = $1
       ORDER BY ar.created_at ASC`,
      [id]
    );

    res.json({ replies: result.rows });
  } catch (error) {
    logger.error('Erreur lors de la récupération des réponses:', error);
    res.status(500).json({ error: { message: 'Erreur serveur' } });
  }
});

// Ajouter une réponse à une annotation
router.post('/:id/replies', async (req, res) => {
  const { id } = req.params;
  const { content } = req.body;

  if (!content || content.trim().length === 0) {
    return res.status(400).json({ error: { message: 'Le contenu de la réponse est requis' } });
  }

  try {
    const annotationCheck = await pool.query('SELECT id, page_id FROM annotations WHERE id = $1', [id]);
    if (annotationCheck.rows.length === 0) {
      return res.status(404).json({ error: { message: 'Annotation non trouvée' } });
    }

    const result = await pool.query(
      `INSERT INTO annotation_replies (annotation_id, content, created_by)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [id, content.trim(), req.user.id]
    );

    const reply = result.rows[0];

    // Get author info
    const userResult = await pool.query(
      `SELECT first_name || ' ' || last_name as author_name, role as author_role
       FROM users WHERE id = $1`,
      [req.user.id]
    );

    reply.author_name = userResult.rows[0]?.author_name;
    reply.author_role = userResult.rows[0]?.author_role;

    logger.info('Réponse ajoutée:', {
      annotationId: id,
      replyId: reply.id,
      createdBy: req.user.id
    });

    // Vérifier les mentions et envoyer des notifications
    const mentionedNames = parseMentions(content);
    if (mentionedNames.length > 0) {
      const pageId = annotationCheck.rows[0].page_id;

      // Récupérer les infos de la page et du projet
      const pageInfo = await pool.query(
        `SELECT p.page_number, pr.title as project_title, pr.id as project_id
         FROM pages p
         JOIN projects pr ON p.project_id = pr.id
         WHERE p.id = $1`,
        [pageId]
      );
      const pageData = pageInfo.rows[0];

      // Récupérer les membres du projet
      const membersResult = await pool.query(
        `SELECT u.id, u.email, u.first_name, u.last_name
         FROM project_members pm
         JOIN users u ON pm.user_id = u.id
         WHERE pm.project_id = $1 AND u.is_active = true`,
        [pageData.project_id]
      );

      const frontendUrl = process.env.FRONTEND_URL || 'https://wevalid.fr';

      // Pour chaque membre, vérifier si son nom est mentionné
      for (const member of membersResult.rows) {
        const fullName = `${member.first_name} ${member.last_name}`;
        const isMentioned = mentionedNames.some(name =>
          name.toLowerCase() === fullName.toLowerCase()
        );

        if (isMentioned && member.id !== req.user.id) {
          sendMentionNotification({
            recipientEmail: member.email,
            recipientName: fullName,
            mentionedByName: reply.author_name,
            mentionedByRole: reply.author_role,
            projectTitle: pageData.project_title,
            pageNumber: pageData.page_number,
            commentText: content,
            pageUrl: `${frontendUrl}/projects/${pageData.project_id}/pages/${pageId}`
          }).catch(err => {
            logger.error('Erreur envoi notification mention:', { error: err.message, to: member.email });
          });
        }
      }
    }

    res.status(201).json({
      message: 'Réponse ajoutée avec succès',
      reply
    });
  } catch (error) {
    logger.error('Erreur lors de l\'ajout de la réponse:', error);
    res.status(500).json({ error: { message: 'Erreur serveur' } });
  }
});

// Supprimer une réponse (admin, editeur, ou auteur de la réponse)
router.delete('/:annotationId/replies/:replyId', async (req, res) => {
  const { annotationId, replyId } = req.params;

  try {
    const reply = await pool.query(
      'SELECT created_by FROM annotation_replies WHERE id = $1 AND annotation_id = $2',
      [replyId, annotationId]
    );

    if (reply.rows.length === 0) {
      return res.status(404).json({ error: { message: 'Réponse non trouvée' } });
    }

    if (req.user.role !== 'admin' &&
        req.user.role !== 'editeur' &&
        reply.rows[0].created_by !== req.user.id) {
      return res.status(403).json({ error: { message: 'Accès refusé' } });
    }

    await pool.query('DELETE FROM annotation_replies WHERE id = $1', [replyId]);

    logger.info('Réponse supprimée:', {
      annotationId,
      replyId,
      deletedBy: req.user.id
    });

    res.json({ message: 'Réponse supprimée avec succès' });
  } catch (error) {
    logger.error('Erreur lors de la suppression de la réponse:', error);
    res.status(500).json({ error: { message: 'Erreur serveur' } });
  }
});

// Supprimer une annotation (admin + éditeur + auteur de l'annotation)
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const annotation = await pool.query('SELECT created_by FROM annotations WHERE id = $1', [id]);

    if (annotation.rows.length === 0) {
      return res.status(404).json({ error: { message: 'Annotation non trouvée' } });
    }

    if (req.user.role !== 'admin' &&
        req.user.role !== 'editeur' &&
        annotation.rows[0].created_by !== req.user.id) {
      return res.status(403).json({ error: { message: 'Accès refusé' } });
    }

    await pool.query('DELETE FROM annotations WHERE id = $1', [id]);

    logger.info('Annotation supprimée:', { annotationId: id, deletedBy: req.user.id });

    res.json({ message: 'Annotation supprimée avec succès' });
  } catch (error) {
    logger.error('Erreur lors de la suppression de l\'annotation:', error);
    res.status(500).json({ error: { message: 'Erreur serveur' } });
  }
});

// ============================================
// EXPORT XFDF (WeValid → Acrobat)
// ============================================

router.get('/page/:pageId/export-xfdf', async (req, res) => {
  const { pageId } = req.params;

  try {
    const pageResult = await pool.query(
      `SELECT p.*, f.original_filename, f.filename
       FROM pages p
       LEFT JOIN files f ON f.page_id = p.id AND f.is_current = true
       WHERE p.id = $1`,
      [pageId]
    );

    if (pageResult.rows.length === 0) {
      return res.status(404).json({ error: { message: 'Page non trouvée' } });
    }

    const page = pageResult.rows[0];

    const annotationsResult = await pool.query(
      `SELECT a.*, u.first_name || ' ' || u.last_name as author_name
       FROM annotations a
       JOIN users u ON a.created_by = u.id
       WHERE a.page_id = $1
       ORDER BY a.created_at`,
      [pageId]
    );

    const annotations = annotationsResult.rows;
    const xfdf = generateXFDF(page, annotations);

    const filename = `annotations_page_${page.page_number}.xfdf`;
    res.setHeader('Content-Type', 'application/vnd.adobe.xfdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(xfdf);

    logger.info('Export XFDF:', { pageId, annotationsCount: annotations.length, exportedBy: req.user.id });
  } catch (error) {
    logger.error('Erreur export XFDF:', error);
    res.status(500).json({ error: { message: 'Erreur serveur' } });
  }
});

// ============================================
// IMPORT XFDF (Acrobat → WeValid)
// ============================================

router.post('/page/:pageId/import-xfdf', async (req, res) => {
  const { pageId } = req.params;
  const { xfdf } = req.body;

  if (!xfdf) {
    return res.status(400).json({ error: { message: 'Contenu XFDF requis' } });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const pageCheck = await client.query('SELECT id, project_id FROM pages WHERE id = $1', [pageId]);
    if (pageCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: { message: 'Page non trouvée' } });
    }

    const parsed = await parseXML(xfdf);
    const importedAnnotations = parseXFDFAnnotations(parsed);

    const createdAnnotations = [];

    for (const annot of importedAnnotations) {
      const result = await client.query(
        `INSERT INTO annotations (page_id, type, content, position, color, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          pageId,
          annot.type,
          annot.content,
          JSON.stringify(annot.position),
          annot.color || '#FFFF00',
          req.user.id
        ]
      );
      createdAnnotations.push(result.rows[0]);
    }

    await client.query('COMMIT');

    logger.info('Import XFDF:', { 
      pageId, 
      importedCount: createdAnnotations.length, 
      importedBy: req.user.id 
    });

    res.status(201).json({
      message: `${createdAnnotations.length} annotations importées avec succès`,
      annotations: createdAnnotations
    });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Erreur import XFDF:', error);
    res.status(500).json({ error: { message: 'Erreur lors du parsing XFDF: ' + error.message } });
  } finally {
    client.release();
  }
});

// ============================================
// FONCTIONS UTILITAIRES XFDF
// ============================================

function generateXFDF(page, annotations) {
  const pdfFilename = page.original_filename || page.filename || 'document.pdf';

  let xfdf = `<?xml version="1.0" encoding="UTF-8"?>
<xfdf xmlns="http://ns.adobe.com/xfdf/" xml:space="preserve">
  <f href="${pdfFilename}"/>
  <annots>`;

  // Process annotations with their index (number)
  annotations.forEach((annot, index) => {
    const annotNumber = index + 1; // 1-based numbering
    const position = typeof annot.position === 'string' ? JSON.parse(annot.position) : annot.position;
    const rect = positionToRect(position);
    const color = hexToRGB(annot.color || '#FFFF00');
    const date = formatXFDFDate(annot.created_at);

    // Include number in the content for easy identification
    const contentWithNumber = `[${annotNumber}] ${annot.content || ''}`;
    const statusLabel = annot.resolved ? ' ✓' : '';

    switch (annot.type) {
      case 'comment':
      case 'question':
        xfdf += `
    <text page="0" rect="${rect}" color="${color}"
          title="${escapeXML(annot.author_name)}${statusLabel}"
          subject="#${annotNumber} ${annot.type === 'question' ? 'Question' : 'Commentaire'}"
          date="${date}"
          name="wevalid-${annot.id}"
          flags="print"
          icon="Comment">
      <contents>${escapeXML(contentWithNumber)}</contents>
    </text>`;
        break;

      case 'correction':
        xfdf += `
    <text page="0" rect="${rect}" color="#FF0000"
          title="${escapeXML(annot.author_name)}${statusLabel}"
          subject="#${annotNumber} Correction"
          date="${date}"
          name="wevalid-${annot.id}"
          flags="print"
          icon="Key">
      <contents>${escapeXML(contentWithNumber)}</contents>
    </text>`;
        break;

      case 'validation':
        xfdf += `
    <stamp page="0" rect="${rect}" color="#00FF00"
           title="${escapeXML(annot.author_name)}${statusLabel}"
           subject="#${annotNumber} Validation"
           date="${date}"
           name="wevalid-${annot.id}"
           flags="print"
           icon="Approved">
      <contents>${escapeXML(contentWithNumber)}</contents>
    </stamp>`;
        break;

      case 'highlight':
        xfdf += `
    <highlight page="0" rect="${rect}" color="${color}"
               title="${escapeXML(annot.author_name)}${statusLabel}"
               subject="#${annotNumber} Surlignage"
               date="${date}"
               name="wevalid-${annot.id}"
               flags="print">
      <contents>${escapeXML(contentWithNumber)}</contents>
    </highlight>`;
        break;

      case 'ink':
        xfdf += `
    <ink page="0" rect="${rect}" color="${color}"
         title="${escapeXML(annot.author_name)}${statusLabel}"
         subject="#${annotNumber} Dessin"
         date="${date}"
         name="wevalid-${annot.id}"
         flags="print">
      <contents>${escapeXML(contentWithNumber)}</contents>
    </ink>`;
        break;

      default:
        xfdf += `
    <text page="0" rect="${rect}" color="${color}"
          title="${escapeXML(annot.author_name)}${statusLabel}"
          subject="#${annotNumber} Note"
          date="${date}"
          name="wevalid-${annot.id}"
          flags="print">
      <contents>${escapeXML(contentWithNumber)}</contents>
    </text>`;
    }
  });

  xfdf += `
  </annots>
</xfdf>`;

  return xfdf;
}

function parseXFDFAnnotations(parsed) {
  const annotations = [];
  
  if (!parsed.xfdf || !parsed.xfdf.annots || !parsed.xfdf.annots[0]) {
    return annotations;
  }

  const annots = parsed.xfdf.annots[0];
  const annotTypes = ['text', 'highlight', 'underline', 'strikeout', 'stamp', 'freetext', 'ink', 'square', 'circle'];

  for (const type of annotTypes) {
    if (annots[type]) {
      for (const annot of annots[type]) {
        const attr = annot.$ || {};
        const contents = annot.contents ? annot.contents[0] : '';
        
        annotations.push({
          type: mapAcrobatType(type, attr.icon),
          content: typeof contents === 'string' ? contents : (contents._ || ''),
          position: rectToPosition(attr.rect),
          color: rgbToHex(attr.color),
          acrobat_name: attr.name,
          acrobat_date: attr.date,
          author: attr.title
        });
      }
    }
  }

  return annotations;
}

function mapAcrobatType(acrobatType, icon) {
  const typeMap = {
    'text': 'comment',
    'highlight': 'highlight',
    'underline': 'highlight',
    'strikeout': 'correction',
    'stamp': 'validation',
    'freetext': 'comment',
    'ink': 'comment',
    'square': 'comment',
    'circle': 'comment'
  };

  if (acrobatType === 'text' && icon === 'Key') {
    return 'correction';
  }

  return typeMap[acrobatType] || 'comment';
}

function positionToRect(position) {
  if (!position) return '0,0,100,100';
  const x = position.x || 0;
  const y = position.y || 0;
  const width = position.width || 50;
  const height = position.height || 50;
  return `${x},${y},${x + width},${y + height}`;
}

function rectToPosition(rect) {
  if (!rect) return { x: 0, y: 0, width: 50, height: 50 };
  const parts = rect.split(',').map(parseFloat);
  if (parts.length < 4) return { x: 0, y: 0, width: 50, height: 50 };
  return {
    x: parts[0],
    y: parts[1],
    width: parts[2] - parts[0],
    height: parts[3] - parts[1]
  };
}

function hexToRGB(hex) {
  if (!hex) return '#FFFF00';
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16) / 255;
  const g = parseInt(h.substring(2, 4), 16) / 255;
  const b = parseInt(h.substring(4, 6), 16) / 255;
  return `#${r.toFixed(6).substring(2)},${g.toFixed(6).substring(2)},${b.toFixed(6).substring(2)}`;
}

function rgbToHex(rgb) {
  if (!rgb) return '#FFFF00';
  if (rgb.startsWith('#') && rgb.length === 7) return rgb;
  
  const parts = rgb.replace('#', '').split(',').map(parseFloat);
  if (parts.length < 3) return '#FFFF00';
  
  const r = Math.round(parts[0] * 255).toString(16).padStart(2, '0');
  const g = Math.round(parts[1] * 255).toString(16).padStart(2, '0');
  const b = Math.round(parts[2] * 255).toString(16).padStart(2, '0');
  
  return `#${r}${g}${b}`.toUpperCase();
}

function formatXFDFDate(date) {
  if (!date) return '';
  const d = new Date(date);
  return `D:${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}`;
}

function escapeXML(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

module.exports = router;
