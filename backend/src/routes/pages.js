const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validation');
const logger = require('../utils/logger');
const { sendStatusChangeNotification } = require('../utils/emailService');

router.use(authenticateToken);

// Règles de transition par statut et rôle
const workflowRules = {
  'attente_elements': {
    'auteur': ['elements_recus'],
    'editeur': ['elements_recus'],
    'graphiste': ['elements_recus'],
    'admin': ['elements_recus', 'en_maquette']
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
    'admin': ['dernieres_corrections', 'envoye_imprimeur', 'en_bat']
  },
  'dernieres_corrections': {
    'graphiste': ['bat_valide'],
    'editeur': ['bat_valide'],
    'admin': ['bat_valide', 'maquette_a_valider']
  },
  'envoye_imprimeur': {
    'admin': ['dernieres_corrections', 'bat_valide']
  }
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
  'dernieres_corrections': ['graphiste', 'editeur'],
  'envoye_imprimeur': ['fabricant', 'editeur']
};

// Lister toutes les pages d'un projet
router.get('/project/:projectId', async (req, res) => {
  const { projectId } = req.params;

  try {
    const result = await pool.query(
      `SELECT p.*, 
              COUNT(DISTINCT f.id) as files_count,
              COUNT(DISTINCT a.id) as annotations_count,
              (
                SELECT f2.id 
                FROM files f2 
                WHERE f2.page_id = p.id 
                  AND f2.is_current = true
                ORDER BY f2.uploaded_at DESC 
                LIMIT 1
              ) as latest_file_id
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
  const isAdmin = req.user.role === 'admin';

  try {
    // Récupérer la page actuelle avec infos projet
    const pageResult = await pool.query(
      `SELECT p.*, pr.title as project_title, pr.id as project_id
       FROM pages p
       JOIN projects pr ON p.project_id = pr.id
       WHERE p.id = $1`,
      [id]
    );

    if (pageResult.rows.length === 0) {
      return res.status(404).json({ error: { message: 'Page non trouvée' } });
    }

    const currentPage = pageResult.rows[0];
    const currentStatus = currentPage.status;

    // Vérifier si la page a des fichiers PDF (pour la règle attente_elements)
    if (status === 'attente_elements' && !isAdmin) {
      const filesResult = await pool.query(
        `SELECT COUNT(*) as pdf_count FROM files
         WHERE page_id = $1 AND file_type = 'application/pdf'`,
        [id]
      );
      if (parseInt(filesResult.rows[0].pdf_count) > 0) {
        return res.status(400).json({
          error: {
            message: 'Impossible de mettre en attente une page qui contient un PDF. Contactez un administrateur pour débloquer.'
          }
        });
      }
    }

    // Vérifier les transitions autorisées selon le rôle
    const allowedTransitions = workflowRules[currentStatus]?.[req.user.role] || [];

    if (!allowedTransitions.includes(status)) {
      return res.status(403).json({
        error: {
          message: `Transition non autorisée: ${currentStatus} → ${status} pour le rôle ${req.user.role}`
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
      [id, currentStatus, status, req.user.id, `Changement de statut par ${req.user.role}`]
    );

    logger.info('Statut de page mis à jour:', { 
      pageId: id, 
      fromStatus: currentStatus, 
      toStatus: status, 
      changedBy: req.user.id 
    });

    // Envoyer les notifications par email
    const rolesToNotify = notificationRules[status] || [];
    
    if (rolesToNotify.length > 0) {
      // Récupérer les membres du projet avec les rôles concernés
      const membersResult = await pool.query(
        `SELECT DISTINCT u.id, u.email, u.first_name, u.last_name, u.role
         FROM users u
         JOIN project_members pm ON u.id = pm.user_id
         WHERE pm.project_id = $1 AND u.role = ANY($2) AND u.is_active = true`,
        [currentPage.project_id, rolesToNotify]
      );

      // Récupérer le nom de celui qui a fait le changement
      const changerResult = await pool.query(
        `SELECT first_name, last_name, role FROM users WHERE id = $1`,
        [req.user.id]
      );
      const changer = changerResult.rows[0];
      const changedByName = `${changer.first_name} ${changer.last_name}`;

      // Envoyer les emails en parallèle (sans bloquer la réponse)
      const frontendUrl = process.env.FRONTEND_URL || 'https://wevalid.rmax.synology.me';
      
      for (const member of membersResult.rows) {
        // Ne pas notifier celui qui a fait le changement
        if (member.id === req.user.id) continue;

        sendStatusChangeNotification({
          recipientEmail: member.email,
          recipientName: `${member.first_name} ${member.last_name}`,
          projectTitle: currentPage.project_title,
          pageNumber: currentPage.page_number,
          fromStatus: currentStatus,
          toStatus: status,
          changedByName: changedByName,
          changedByRole: changer.role,
          pageUrl: `${frontendUrl}/projects/${currentPage.project_id}/pages/${id}`
        }).catch(err => {
          logger.error('Erreur envoi notification:', { error: err.message, to: member.email });
        });
      }

      logger.info('Notifications envoyées:', { 
        pageId: id, 
        status: status,
        notifiedRoles: rolesToNotify,
        notifiedCount: membersResult.rows.filter(m => m.id !== req.user.id).length
      });
    }

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
