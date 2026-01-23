const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const logger = require('../utils/logger');

router.use(authenticateToken);

// Définition des transitions possibles par statut et rôle
const workflowRules = {
  'attente_elements': {
    'auteur': ['elements_recus'],
    'editeur': ['elements_recus'],
    'graphiste': ['elements_recus']
  },
  'elements_recus': {
    'editeur': ['ok_pour_maquette'],
    'fabricant': ['ok_pour_maquette']
  },
  'ok_pour_maquette': {
    'graphiste': ['en_maquette'],
    'editeur': ['en_maquette']
  },
  'en_maquette': {
    'graphiste': ['maquette_a_valider'],
    'editeur': ['maquette_a_valider']
  },
  'maquette_a_valider': {
    'editeur': ['maquette_validee_photogravure', 'pour_corrections'],
    'fabricant': ['maquette_validee_photogravure', 'pour_corrections'],
    'auteur': ['maquette_validee_photogravure', 'pour_corrections']
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
  'pour_corrections': {
    'graphiste': ['maquette_a_valider'],
    'auteur': ['maquette_a_valider']
  },
  'en_bat': {
    'photograveur': ['bat_valide'],
    'editeur': ['pour_corrections', 'bat_valide']
  },
  'bat_valide': {
    'editeur': ['pdf_hd_ok'],
    'fabricant': ['pdf_hd_ok']
  },
  'pdf_hd_ok': {
    // État final, pas de transition
  }
};

// Labels pour l'affichage
const statusLabels = {
  'attente_elements': 'Attente éléments',
  'elements_recus': 'Éléments reçus',
  'ok_pour_maquette': 'OK pour maquette',
  'en_maquette': 'En maquette',
  'maquette_a_valider': 'Maquette à valider',
  'maquette_validee_photogravure': 'Validée photogravure',
  'en_peaufinage': 'En peaufinage',
  'pour_corrections': 'Pour corrections',
  'en_bat': 'En BAT',
  'bat_valide': 'BAT validé',
  'pdf_hd_ok': 'PDF HD OK'
};

// Notifications par statut -> rôles à notifier
const notificationRules = {
  'elements_recus': ['fabricant', 'editeur'],
  'ok_pour_maquette': ['graphiste'],
  'maquette_a_valider': ['editeur', 'fabricant', 'auteur'],
  'maquette_validee_photogravure': ['fabricant'],
  'en_peaufinage': ['graphiste'],
  'pour_corrections': ['graphiste'],
  'en_bat': ['editeur', 'fabricant'],
  'bat_valide': ['editeur', 'fabricant'],
  'pdf_hd_ok': ['photograveur']
};

// Exporter pour utilisation dans pages.js
router.workflowRules = workflowRules;
router.statusLabels = statusLabels;
router.notificationRules = notificationRules;

// Récupérer les transitions autorisées pour un statut donné
router.get('/transitions/:status', async (req, res) => {
  const { status } = req.params;
  const userRole = req.user.role;

  const allowedTransitions = workflowRules[status]?.[userRole] || [];

  res.json({
    current_status: status,
    current_status_label: statusLabels[status] || status,
    user_role: userRole,
    allowed_transitions: allowedTransitions.map(s => ({
      status: s,
      label: statusLabels[s] || s
    }))
  });
});

// Récupérer tous les statuts possibles
router.get('/statuses', async (req, res) => {
  const statuses = Object.entries(statusLabels).map(([key, label]) => ({
    status: key,
    label: label
  }));
  res.json({ statuses });
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

    const total = result.rows.reduce((sum, row) => sum + parseInt(row.count), 0);
    const stats = result.rows.map(row => ({
      status: row.status,
      label: statusLabels[row.status] || row.status,
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

// Dashboard global - stats tous projets
router.get('/dashboard/overview', async (req, res) => {
  try {
    // Stats globales
    const globalStats = await pool.query(`
      SELECT 
        COUNT(DISTINCT p.id) as total_projects,
        COUNT(DISTINCT pg.id) as total_pages,
        COUNT(DISTINCT f.id) as total_files,
        COUNT(DISTINCT a.id) as total_annotations
      FROM projects p
      LEFT JOIN pages pg ON pg.project_id = p.id
      LEFT JOIN files f ON f.page_id = pg.id
      LEFT JOIN annotations a ON a.page_id = pg.id
    `);

    // Pages par statut (global)
    const pagesByStatus = await pool.query(`
      SELECT status, COUNT(*) as count
      FROM pages
      GROUP BY status
      ORDER BY status
    `);

    // Projets par statut
    const projectsByStatus = await pool.query(`
      SELECT status, COUNT(*) as count
      FROM projects
      GROUP BY status
      ORDER BY status
    `);

    // Activité récente (dernières 24h)
    const recentActivity = await pool.query(`
      SELECT 
        'annotation' as type,
        a.created_at,
        u.first_name || ' ' || u.last_name as user_name,
        p.title as project_title
      FROM annotations a
      JOIN users u ON a.created_by = u.id
      JOIN pages pg ON a.page_id = pg.id
      JOIN projects p ON pg.project_id = p.id
      WHERE a.created_at > NOW() - INTERVAL '24 hours'
      
      UNION ALL
      
      SELECT 
        'file' as type,
        f.created_at,
        u.first_name || ' ' || u.last_name as user_name,
        p.title as project_title
      FROM files f
      JOIN users u ON f.uploaded_by = u.id
      JOIN pages pg ON f.page_id = pg.id
      JOIN projects p ON pg.project_id = p.id
      WHERE f.created_at > NOW() - INTERVAL '24 hours'
      
      ORDER BY created_at DESC
      LIMIT 20
    `);

    // Progression par projet
    const projectsProgress = await pool.query(`
      SELECT 
        p.id,
        p.title,
        p.status,
        COUNT(pg.id) as total_pages,
        COUNT(CASE WHEN pg.status = 'bat_valide' THEN 1 END) as validated_pages
      FROM projects p
      LEFT JOIN pages pg ON pg.project_id = p.id
      GROUP BY p.id, p.title, p.status
      ORDER BY p.created_at DESC
      LIMIT 10
    `);

    res.json({
      global: globalStats.rows[0],
      pages_by_status: pagesByStatus.rows,
      projects_by_status: projectsByStatus.rows,
      recent_activity: recentActivity.rows,
      projects_progress: projectsProgress.rows.map(p => ({
        ...p,
        progress_percent: p.total_pages > 0 
          ? Math.round((p.validated_pages / p.total_pages) * 100) 
          : 0
      }))
    });
  } catch (error) {
    logger.error('Erreur dashboard overview:', error);
    res.status(500).json({ error: { message: 'Erreur serveur' } });
  }
});
