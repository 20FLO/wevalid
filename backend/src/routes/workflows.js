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
    'graphiste': ['elements_recus'],
    'admin': ['elements_recus', 'en_maquette'] // Admin peut forcer
  },
  'elements_recus': {
    'editeur': ['ok_pour_maquette'],
    'fabricant': ['ok_pour_maquette'],
    'admin': ['ok_pour_maquette', 'attente_elements']
  },
  'ok_pour_maquette': {
    'graphiste': ['en_maquette'],
    'editeur': ['en_maquette'],
    'admin': ['en_maquette', 'elements_recus']
  },
  'en_maquette': {
    'graphiste': ['maquette_a_valider'],
    'editeur': ['maquette_a_valider'],
    'admin': ['maquette_a_valider', 'ok_pour_maquette']
  },
  'maquette_a_valider': {
    'editeur': ['maquette_validee_photogravure', 'pour_corrections'],
    'fabricant': ['maquette_validee_photogravure', 'pour_corrections'],
    'auteur': ['maquette_validee_photogravure', 'pour_corrections'],
    'admin': ['maquette_validee_photogravure', 'pour_corrections', 'en_maquette']
  },
  'maquette_validee_photogravure': {
    'photograveur': ['en_bat'],
    'graphiste': ['en_peaufinage'],
    'editeur': ['en_peaufinage'],
    'admin': ['en_bat', 'en_peaufinage', 'maquette_a_valider']
  },
  'en_peaufinage': {
    'graphiste': ['maquette_a_valider'],
    'editeur': ['maquette_a_valider'],
    'admin': ['maquette_a_valider', 'maquette_validee_photogravure']
  },
  'pour_corrections': {
    'graphiste': ['maquette_a_valider'],
    'auteur': ['maquette_a_valider'],
    'admin': ['maquette_a_valider', 'en_bat']
  },
  'en_bat': {
    'photograveur': ['bat_valide'],
    'editeur': ['pour_corrections', 'bat_valide'],
    'admin': ['bat_valide', 'pour_corrections', 'maquette_validee_photogravure']
  },
  'bat_valide': {
    'editeur': ['dernieres_corrections', 'envoye_imprimeur'],
    'fabricant': ['dernieres_corrections', 'envoye_imprimeur'],
    'admin': ['dernieres_corrections', 'envoye_imprimeur', 'en_bat'] // Admin peut débloquer
  },
  'dernieres_corrections': {
    'graphiste': ['bat_valide'],
    'editeur': ['bat_valide'],
    'admin': ['bat_valide', 'maquette_a_valider'] // Admin peut revenir plus loin
  },
  'envoye_imprimeur': {
    'admin': ['dernieres_corrections', 'bat_valide'] // Seul admin peut revenir
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
  'dernieres_corrections': 'Dernières corrections',
  'envoye_imprimeur': 'Envoyé imprimeur'
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
  'dernieres_corrections': ['graphiste', 'editeur'], // Notifier pour corrections finales
  'envoye_imprimeur': ['fabricant', 'editeur']
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

// Dashboard projet - stats détaillées
router.get('/dashboard/:projectId', async (req, res) => {
  const { projectId } = req.params;

  try {
    // Infos projet
    const projectResult = await pool.query(
      'SELECT * FROM projects WHERE id = $1',
      [projectId]
    );

    if (projectResult.rows.length === 0) {
      return res.status(404).json({ error: { message: 'Projet non trouvé' } });
    }

    const project = projectResult.rows[0];

    // Stats pages par statut
    const pageStats = await pool.query(`
      SELECT status, COUNT(*) as count
      FROM pages
      WHERE project_id = $1
      GROUP BY status
    `, [projectId]);

    // Convertir en objet
    const pagesByStatus = {};
    let totalPagesCreated = 0;
    pageStats.rows.forEach(row => {
      pagesByStatus[row.status] = parseInt(row.count);
      totalPagesCreated += parseInt(row.count);
    });

    // Calculer les progressions
    const inMaquette = (pagesByStatus['en_maquette'] || 0) +
                       (pagesByStatus['maquette_a_valider'] || 0) +
                       (pagesByStatus['maquette_validee_photogravure'] || 0) +
                       (pagesByStatus['en_peaufinage'] || 0) +
                       (pagesByStatus['en_corrections'] || 0) +
                       (pagesByStatus['en_bat'] || 0) +
                       (pagesByStatus['bat_valide'] || 0) +
                       (pagesByStatus['envoye_imprimeur'] || 0);

    const validated = (pagesByStatus['bat_valide'] || 0) +
                      (pagesByStatus['envoye_imprimeur'] || 0);

    const totalPages = project.total_pages || totalPagesCreated;

    // Fichiers projet
    const filesResult = await pool.query(
      'SELECT COUNT(*) as count FROM project_files WHERE project_id = $1',
      [projectId]
    );

    // Activité récente
    const activityResult = await pool.query(`
      SELECT
        wh.id,
        wh.from_status,
        wh.to_status,
        wh.changed_at,
        wh.notes,
        p.page_number,
        u.first_name || ' ' || u.last_name as changed_by_name
      FROM workflow_history wh
      JOIN pages p ON wh.page_id = p.id
      JOIN users u ON wh.changed_by = u.id
      WHERE p.project_id = $1
      ORDER BY wh.changed_at DESC
      LIMIT 10
    `, [projectId]);

    res.json({
      project_id: parseInt(projectId),
      project_title: project.title,
      total_pages: totalPages,
      pages_created: totalPagesCreated,
      pages_by_status: pagesByStatus,
      progress: {
        maquette_count: inMaquette,
        maquette_percent: totalPages > 0 ? Math.round((inMaquette / totalPages) * 100) : 0,
        validation_count: validated,
        validation_percent: totalPages > 0 ? Math.round((validated / totalPages) * 100) : 0
      },
      files_count: parseInt(filesResult.rows[0].count),
      recent_activity: activityResult.rows.map(a => ({
        ...a,
        from_status_label: statusLabels[a.from_status] || a.from_status,
        to_status_label: statusLabels[a.to_status] || a.to_status
      }))
    });
  } catch (error) {
    logger.error('Erreur dashboard projet:', error);
    res.status(500).json({ error: { message: 'Erreur serveur' } });
  }
});

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

module.exports = router;
