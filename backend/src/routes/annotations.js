const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validation');
const logger = require('../utils/logger');
const { parseString, Builder } = require('xml2js');
const { promisify } = require('util');
const parseXML = promisify(parseString);

router.use(authenticateToken);

// Récupérer toutes les annotations d'une page
router.get('/page/:pageId', async (req, res) => {
  const { pageId } = req.params;

  try {
    const result = await pool.query(
      `SELECT a.*,
              u.first_name || ' ' || u.last_name as author_name,
              u.role as author_role
       FROM annotations a
       JOIN users u ON a.created_by = u.id
       WHERE a.page_id = $1
       ORDER BY a.created_at DESC`,
      [pageId]
    );

    res.json({ annotations: result.rows });
  } catch (error) {
    logger.error('Erreur lors de la récupération des annotations:', error);
    res.status(500).json({ error: { message: 'Erreur serveur' } });
  }
});

// Créer une annotation (tous les membres authentifiés)
router.post('/', validate(schemas.createAnnotation), async (req, res) => {
  const { page_id, type, content, position, color } = req.validatedBody;

  try {
    const pageCheck = await pool.query('SELECT id FROM pages WHERE id = $1', [page_id]);
    if (pageCheck.rows.length === 0) {
      return res.status(404).json({ error: { message: 'Page non trouvée' } });
    }

    const result = await pool.query(
      `INSERT INTO annotations (page_id, type, content, position, color, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [page_id, type, content, JSON.stringify(position), color, req.user.id]
    );

    const annotation = result.rows[0];

    logger.info('Annotation créée:', {
      annotationId: annotation.id,
      pageId: page_id,
      createdBy: req.user.id
    });

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
    if (typeof resolved === 'boolean') updates.resolved = resolved;

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

  for (const annot of annotations) {
    const position = typeof annot.position === 'string' ? JSON.parse(annot.position) : annot.position;
    const rect = positionToRect(position);
    const color = hexToRGB(annot.color || '#FFFF00');
    const date = formatXFDFDate(annot.created_at);

    switch (annot.type) {
      case 'comment':
      case 'question':
        xfdf += `
    <text page="0" rect="${rect}" color="${color}" 
          title="${escapeXML(annot.author_name)}" 
          subject="${annot.type === 'question' ? 'Question' : 'Commentaire'}"
          date="${date}" 
          name="wevalid-${annot.id}"
          flags="print"
          icon="Comment">
      <contents>${escapeXML(annot.content)}</contents>
    </text>`;
        break;

      case 'correction':
        xfdf += `
    <text page="0" rect="${rect}" color="#FF0000" 
          title="${escapeXML(annot.author_name)}" 
          subject="Correction"
          date="${date}"
          name="wevalid-${annot.id}"
          flags="print"
          icon="Key">
      <contents>${escapeXML(annot.content)}</contents>
    </text>`;
        break;

      case 'validation':
        xfdf += `
    <stamp page="0" rect="${rect}" color="#00FF00"
           title="${escapeXML(annot.author_name)}"
           subject="Validation"
           date="${date}"
           name="wevalid-${annot.id}"
           flags="print"
           icon="Approved">
      <contents>${escapeXML(annot.content)}</contents>
    </stamp>`;
        break;

      case 'highlight':
        xfdf += `
    <highlight page="0" rect="${rect}" color="${color}"
               title="${escapeXML(annot.author_name)}"
               date="${date}"
               name="wevalid-${annot.id}"
               flags="print">
      <contents>${escapeXML(annot.content || '')}</contents>
    </highlight>`;
        break;

      default:
        xfdf += `
    <text page="0" rect="${rect}" color="${color}"
          title="${escapeXML(annot.author_name)}"
          date="${date}"
          name="wevalid-${annot.id}"
          flags="print">
      <contents>${escapeXML(annot.content)}</contents>
    </text>`;
    }
  }

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
