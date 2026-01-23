const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validation');
const logger = require('../utils/logger');

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

    // Admin peut tout modifier
    // Le créateur peut modifier son annotation
    // Tout le monde peut changer "resolved"
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

    // Admin a tous les droits
    // Éditeur peut supprimer toutes les annotations
    // Le créateur peut supprimer sa propre annotation
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

module.exports = router;
