const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const logger = require('../utils/logger');

router.use(authenticateToken);

// Récupérer les transitions autorisées pour un statut donné
router.get('/transitions/:status', async (req, res) => {
  const { status } = req.params;
  const userRole = req.user.role;

  // Définition des transitions possibles par statut et rôle
  const workflowRules = {
    'attente_elements': {
      'auteur': ['elements_recus'],
      'editeur': ['elements_recus'],
      'graphiste': ['elements_recus']
    },
    'elements_recus': {
      'editeur': ['en_maquette'],
      'graphiste': ['en_maquette']
    },
    'en_maquette': {
      'graphiste': ['maquette_a_valider'],
      'editeur': ['maquette_a_valider']
    },
    'maquette_a_valider': {
      'editeur': ['maquette_validee_photogravure', 'en_corrections'],
      'fabricant': ['maquette_validee_photogravure', 'en_corrections']
    },
    'maquette_validee_photogravure': {
      'photograveur': ['en_bat'],
      'graphiste': ['en_peaufinage'],
      'editeur': ['en_peaufinage']
    },
    'en_peaufinage': {
      'graphiste': ['maquette_a_valider'],
      'editeur': ['maquette_a_valider']
    },
    'en_corrections': {
      'graphiste': ['maquette_a_valider'],
      'auteur': ['maquette_a_valider']
    },
    'en_bat': {
      'photograveur': ['bat_valide'],
      'editeur': ['en_corrections', 'bat_valide']
    },
    'bat_valide': {
      'editeur': ['envoye_imprimeur'],
      'fabricant': ['envoye_imprimeur']
    },
    'envoye_imprimeur': {
      // État final, pas de transition
    }
  };

  const allowedTransitions = workflowRules[status]?.[userRole] || [];

  res.json({
    current_status: status,
    user_role: userRole,
    allowed_transitions: allowedTransitions
  });
});

// Récupérer les statistiques de workflow pour un projet
router.get('/stats/:projectId', async (req, res) => {
  const { projectId } = req.params;

  try {
    const result = await pool.query(
      `SELECT 
         status,
         COUNT(*) as count
       FROM pages
       WHERE project_id = $1
       GROUP BY status
       ORDER BY status`,
      [projectId]
    );

    // Calculer les pourcentages
    const total = result.rows.reduce((sum, row) => sum + parseInt(row.count), 0);
    const stats = result.rows.map(row => ({
      status: row.status,
      count: parseInt(row.count),
      percentage: total > 0 ? Math.round((parseInt(row.count) / total) * 100) : 0
    }));

    res.json({ 
      project_id: projectId,
      total_pages: total,
      stats 
    });
  } catch (error) {
    logger.error('Erreur lors de la récupération des stats workflow:', error);
    res.status(500).json({ error: { message: 'Erreur serveur' } });
  }
});

// Récupérer l'historique complet du workflow d'un projet
router.get('/history/:projectId', async (req, res) => {
  const { projectId } = req.params;

  try {
    const result = await pool.query(
      `SELECT 
         wh.*,
         p.page_number,
         u.first_name || ' ' || u.last_name as changed_by_name,
         u.role as changed_by_role
       FROM workflow_history wh
       JOIN pages p ON wh.page_id = p.id
       JOIN users u ON wh.changed_by = u.id
       WHERE p.project_id = $1
       ORDER BY wh.changed_at DESC
       LIMIT 100`,
      [projectId]
    );

    res.json({ history: result.rows });
  } catch (error) {
    logger.error('Erreur lors de la récupération de l\'historique workflow:', error);
    res.status(500).json({ error: { message: 'Erreur serveur' } });
  }
});

module.exports = router;