const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validation');
const logger = require('../utils/logger');

router.use(authenticateToken);

// Lister toutes les pages d'un projet
router.get('/project/:projectId', async (req, res) => {
  const { projectId } = req.params;

  try {
    const result = await pool.query(
      `SELECT p.*, 
              COUNT(DISTINCT f.id) as files_count,
              COUNT(DISTINCT a.id) as annotations_count
       FROM pages p
       LEFT JOIN files f ON p.id = f.page_id
       LEFT JOIN annotations a ON p.id = a.page_id
       WHERE p.project_id = $1
       GROUP BY p.id
       ORDER BY p.page_number`,
      [projectId]
    );

    res.json({ pages: result.rows });
  } catch (error) {
    logger.error('Erreur lors de la récupération des pages:', error);
    res.status(500).json({ error: { message: 'Erreur serveur' } });
  }
});

// Récupérer une page spécifique
router.get('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `SELECT p.*, 
              json_agg(DISTINCT jsonb_build_object('id', f.id, 'filename', f.filename, 'file_type', f.file_type, 'file_size', f.file_size, 'uploaded_at', f.uploaded_at)) FILTER (WHERE f.id IS NOT NULL) as files,
              json_agg(DISTINCT jsonb_build_object('id', a.id, 'type', a.type, 'content', a.content, 'created_by', a.created_by, 'created_at', a.created_at)) FILTER (WHERE a.id IS NOT NULL) as annotations
       FROM pages p
       LEFT JOIN files f ON p.id = f.page_id
       LEFT JOIN annotations a ON p.id = a.page_id
       WHERE p.id = $1
       GROUP BY p.id`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: { message: 'Page non trouvée' } });
    }

    res.json({ page: result.rows[0] });
  } catch (error) {
    logger.error('Erreur lors de la récupération de la page:', error);
    res.status(500).json({ error: { message: 'Erreur serveur' } });
  }
});

// Mettre à jour le statut d'une page
router.patch('/:id/status', validate(schemas.updatePageStatus), async (req, res) => {
  const { id } = req.params;
  const { status } = req.validatedBody;

  try {
    // Récupérer la page actuelle
    const pageResult = await pool.query('SELECT * FROM pages WHERE id = $1', [id]);
    
    if (pageResult.rows.length === 0) {
      return res.status(404).json({ error: { message: 'Page non trouvée' } });
    }

    const currentPage = pageResult.rows[0];

    // Vérifier les transitions autorisées selon le rôle
    const allowedTransitions = {
      'auteur': ['elements_recus'],
      'editeur': ['maquette_a_valider', 'en_corrections', 'bat_valide'],
      'photograveur': ['maquette_validee_photogravure', 'en_bat'],
      'fabricant': ['envoye_imprimeur'],
      'graphiste': ['en_maquette', 'en_peaufinage']
    };

    if (!allowedTransitions[req.user.role]?.includes(status)) {
      return res.status(403).json({ 
        error: { 
          message: `Votre rôle (${req.user.role}) ne permet pas de passer à ce statut` 
        } 
      });
    }

    // Mettre à jour le statut
    const result = await pool.query(
      `UPDATE pages SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [status, id]
    );

    // Enregistrer dans l'historique
    await pool.query(
      `INSERT INTO workflow_history (page_id, from_status, to_status, changed_by, notes)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, currentPage.status, status, req.user.id, `Changement de statut par ${req.user.role}`]
    );

    logger.info('Statut de page mis à jour:', { 
      pageId: id, 
      fromStatus: currentPage.status, 
      toStatus: status, 
      changedBy: req.user.id 
    });

    res.json({
      message: 'Statut mis à jour avec succès',
      page: result.rows[0]
    });
  } catch (error) {
    logger.error('Erreur lors de la mise à jour du statut:', error);
    res.status(500).json({ error: { message: 'Erreur serveur' } });
  }
});

// Récupérer l'historique des changements de statut
router.get('/:id/history', async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `SELECT wh.*, u.first_name || ' ' || u.last_name as changed_by_name, u.role as changed_by_role
       FROM workflow_history wh
       JOIN users u ON wh.changed_by = u.id
       WHERE wh.page_id = $1
       ORDER BY wh.changed_at DESC`,
      [id]
    );

    res.json({ history: result.rows });
  } catch (error) {
    logger.error('Erreur lors de la récupération de l\'historique:', error);
    res.status(500).json({ error: { message: 'Erreur serveur' } });
  }
});

module.exports = router;