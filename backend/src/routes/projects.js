const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validation');
const logger = require('../utils/logger');
const { sendProjectInvitationNotification } = require('../utils/emailService');

// Tous les endpoints nécessitent authentification
router.use(authenticateToken);

// Lister tous les projets
router.get('/', async (req, res) => {
  try {
    const { status, search, publisher_id, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    let query = `
      SELECT p.*,
             u.first_name || ' ' || u.last_name as creator_name,
             pub.name as publisher_name,
             COUNT(DISTINCT pg.id) as total_pages_count,
             COUNT(DISTINCT CASE WHEN pg.status = 'bat_valide' THEN pg.id END) as validated_pages_count
      FROM projects p
      LEFT JOIN users u ON p.created_by = u.id
      LEFT JOIN publishers pub ON p.publisher_id = pub.id
      LEFT JOIN pages pg ON p.id = pg.project_id
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;

    // Admin voit tout, éditeur aussi
    // Fabricant voit les projets de ses maisons d'édition
    // Autres rôles seulement les projets où ils sont membres
    if (req.user.role === 'fabricant') {
      query += ` AND (
        p.publisher_id IN (SELECT publisher_id FROM user_publishers WHERE user_id = $${paramIndex})
        OR p.id IN (SELECT project_id FROM project_members WHERE user_id = $${paramIndex})
      )`;
      params.push(req.user.id);
      paramIndex++;
    } else if (!['admin', 'editeur'].includes(req.user.role)) {
      query += ` AND p.id IN (
        SELECT DISTINCT project_id FROM project_members WHERE user_id = $${paramIndex}
      )`;
      params.push(req.user.id);
      paramIndex++;
    }

    if (status) {
      query += ` AND p.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (search) {
      query += ` AND (p.title ILIKE $${paramIndex} OR p.isbn ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (publisher_id) {
      query += ` AND p.publisher_id = $${paramIndex}`;
      params.push(publisher_id);
      paramIndex++;
    }

    query += ` GROUP BY p.id, u.first_name, u.last_name, pub.name ORDER BY p.updated_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    // Compter le total avec les mêmes filtres
    let countParams = [];
    let countParamIndex = 1;
    let countQuery = `SELECT COUNT(DISTINCT p.id) FROM projects p WHERE 1=1`;

    if (req.user.role === 'fabricant') {
      countQuery += ` AND (
        p.publisher_id IN (SELECT publisher_id FROM user_publishers WHERE user_id = $${countParamIndex})
        OR p.id IN (SELECT project_id FROM project_members WHERE user_id = $${countParamIndex})
      )`;
      countParams.push(req.user.id);
      countParamIndex++;
    } else if (!['admin', 'editeur'].includes(req.user.role)) {
      countQuery += ` AND p.id IN (SELECT DISTINCT project_id FROM project_members WHERE user_id = $${countParamIndex})`;
      countParams.push(req.user.id);
      countParamIndex++;
    }

    if (status) {
      countQuery += ` AND p.status = $${countParamIndex}`;
      countParams.push(status);
      countParamIndex++;
    }

    if (search) {
      countQuery += ` AND (p.title ILIKE $${countParamIndex} OR p.isbn ILIKE $${countParamIndex})`;
      countParams.push(`%${search}%`);
      countParamIndex++;
    }

    if (publisher_id) {
      countQuery += ` AND p.publisher_id = $${countParamIndex}`;
      countParams.push(publisher_id);
      countParamIndex++;
    }

    const countResult = await pool.query(countQuery, countParams);

    res.json({
      projects: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].count)
      }
    });
  } catch (error) {
    logger.error('Erreur lors de la récupération des projets:', error);
    res.status(500).json({ error: { message: 'Erreur serveur' } });
  }
});

// Récupérer un projet spécifique
router.get('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `SELECT p.*,
              u.first_name || ' ' || u.last_name as creator_name,
              pub.name as publisher_name,
              COUNT(DISTINCT pg.id) as total_pages_count,
              COUNT(DISTINCT CASE WHEN pg.status = 'bat_valide' THEN pg.id END) as validated_pages_count
       FROM projects p
       LEFT JOIN users u ON p.created_by = u.id
       LEFT JOIN publishers pub ON p.publisher_id = pub.id
       LEFT JOIN pages pg ON p.id = pg.project_id
       WHERE p.id = $1
       GROUP BY p.id, u.first_name, u.last_name, pub.name`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: { message: 'Projet non trouvé' } });
    }

    const project = result.rows[0];

    // Admin et éditeur voient tout
    // Fabricant voit si le projet est dans une de ses maisons ou s'il est membre
    // Autres doivent être membres
    if (req.user.role === 'fabricant') {
      const accessCheck = await pool.query(
        `SELECT 1 FROM projects p
         WHERE p.id = $1 AND (
           p.publisher_id IN (SELECT publisher_id FROM user_publishers WHERE user_id = $2)
           OR p.id IN (SELECT project_id FROM project_members WHERE user_id = $2)
         )`,
        [id, req.user.id]
      );
      if (accessCheck.rows.length === 0) {
        return res.status(403).json({ error: { message: 'Accès refusé à ce projet' } });
      }
    } else if (!['admin', 'editeur'].includes(req.user.role)) {
      const memberCheck = await pool.query(
        'SELECT 1 FROM project_members WHERE project_id = $1 AND user_id = $2',
        [id, req.user.id]
      );

      if (memberCheck.rows.length === 0) {
        return res.status(403).json({ error: { message: 'Accès refusé à ce projet' } });
      }
    }

    // Récupérer les membres du projet
    const membersResult = await pool.query(
      `SELECT u.id, u.email, u.first_name, u.last_name, u.role, pm.added_at
       FROM project_members pm
       JOIN users u ON pm.user_id = u.id
       WHERE pm.project_id = $1
       ORDER BY pm.added_at`,
      [id]
    );

    project.members = membersResult.rows;

    res.json({ project });
  } catch (error) {
    logger.error('Erreur lors de la récupération du projet:', error);
    res.status(500).json({ error: { message: 'Erreur serveur' } });
  }
});

// Créer un nouveau projet (admin + fabricant + éditeurs)
router.post('/', authorizeRoles('admin', 'editeur', 'fabricant'), validate(schemas.createProject), async (req, res) => {
  const { title, isbn, description, total_pages, publisher_id, width_mm, height_mm } = req.validatedBody;

  // Vérifier que le fabricant a accès à la maison d'édition
  if (req.user.role === 'fabricant' && publisher_id) {
    const accessCheck = await pool.query(
      'SELECT 1 FROM user_publishers WHERE publisher_id = $1 AND user_id = $2',
      [publisher_id, req.user.id]
    );
    if (accessCheck.rows.length === 0) {
      return res.status(403).json({ error: { message: 'Vous n\'avez pas accès à cette maison d\'édition' } });
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Créer le projet
    const projectResult = await client.query(
      `INSERT INTO projects (title, isbn, description, total_pages, publisher_id, width_mm, height_mm, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'draft', $8)
       RETURNING *`,
      [title, isbn, description, total_pages, publisher_id, width_mm, height_mm, req.user.id]
    );

    const project = projectResult.rows[0];

    // Créer les pages automatiquement
    const pageInserts = [];
    for (let i = 1; i <= total_pages; i++) {
      pageInserts.push(`(${project.id}, ${i}, 'attente_elements')`);
    }

    if (pageInserts.length > 0) {
      await client.query(
        `INSERT INTO pages (project_id, page_number, status) VALUES ${pageInserts.join(', ')}`
      );
    }

    // Ajouter le créateur comme membre
    await client.query(
      'INSERT INTO project_members (project_id, user_id) VALUES ($1, $2)',
      [project.id, req.user.id]
    );

    await client.query('COMMIT');

    logger.info('Nouveau projet créé:', { projectId: project.id, title, createdBy: req.user.id });

    res.status(201).json({
      message: 'Projet créé avec succès',
      project
    });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Erreur lors de la création du projet:', error);
    res.status(500).json({ error: { message: 'Erreur serveur' } });
  } finally {
    client.release();
  }
});

// Mettre à jour un projet (admin + fabricant + éditeurs)
router.put('/:id', authorizeRoles('admin', 'editeur', 'fabricant'), validate(schemas.updateProject), async (req, res) => {
  const { id } = req.params;
  const updates = req.validatedBody;

  try {
    // Vérifier que le projet existe
    const checkResult = await pool.query('SELECT id FROM projects WHERE id = $1', [id]);
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: { message: 'Projet non trouvé' } });
    }

    // Construire la requête de mise à jour
    const fields = Object.keys(updates);
    const values = Object.values(updates);
    const setClause = fields.map((field, index) => `${field} = $${index + 1}`).join(', ');

    const result = await pool.query(
      `UPDATE projects SET ${setClause}, updated_at = NOW() WHERE id = $${fields.length + 1} RETURNING *`,
      [...values, id]
    );

    logger.info('Projet mis à jour:', { projectId: id, updatedBy: req.user.id });

    res.json({
      message: 'Projet mis à jour avec succès',
      project: result.rows[0]
    });
  } catch (error) {
    logger.error('Erreur lors de la mise à jour du projet:', error);
    res.status(500).json({ error: { message: 'Erreur serveur' } });
  }
});

// Supprimer un projet (admin uniquement)
router.delete('/:id', authorizeRoles('admin'), async (req, res) => {
  const { id } = req.params;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Vérifier que le projet existe
    const checkResult = await client.query('SELECT id FROM projects WHERE id = $1', [id]);
    if (checkResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: { message: 'Projet non trouvé' } });
    }

    // Supprimer les dépendances
    await client.query('DELETE FROM annotations WHERE page_id IN (SELECT id FROM pages WHERE project_id = $1)', [id]);
    await client.query('DELETE FROM files WHERE page_id IN (SELECT id FROM pages WHERE project_id = $1)', [id]);
    await client.query('DELETE FROM pages WHERE project_id = $1', [id]);
    await client.query('DELETE FROM project_members WHERE project_id = $1', [id]);
    await client.query('DELETE FROM projects WHERE id = $1', [id]);

    await client.query('COMMIT');

    logger.info('Projet supprimé:', { projectId: id, deletedBy: req.user.id });

    res.json({ message: 'Projet supprimé avec succès' });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Erreur lors de la suppression du projet:', error);
    res.status(500).json({ error: { message: 'Erreur serveur' } });
  } finally {
    client.release();
  }
});

// Ajouter un membre au projet (admin + éditeurs + fabricant)
router.post('/:id/members', authorizeRoles('admin', 'editeur', 'fabricant'), async (req, res) => {
  const { id } = req.params;
  const { user_id } = req.body;

  try {
    // Vérifier que le projet existe
    const projectCheck = await pool.query('SELECT id FROM projects WHERE id = $1', [id]);
    if (projectCheck.rows.length === 0) {
      return res.status(404).json({ error: { message: 'Projet non trouvé' } });
    }

    // Vérifier que l'utilisateur existe
    const userCheck = await pool.query('SELECT id, first_name, last_name, role FROM users WHERE id = $1', [user_id]);
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: { message: 'Utilisateur non trouvé' } });
    }

    // Vérifier s'il n'est pas déjà membre
    const memberCheck = await pool.query(
      'SELECT 1 FROM project_members WHERE project_id = $1 AND user_id = $2',
      [id, user_id]
    );

    if (memberCheck.rows.length > 0) {
      return res.status(409).json({ error: { message: 'Cet utilisateur est déjà membre du projet' } });
    }

    // Ajouter le membre
    await pool.query(
      'INSERT INTO project_members (project_id, user_id) VALUES ($1, $2)',
      [id, user_id]
    );

    logger.info('Membre ajouté au projet:', { projectId: id, userId: user_id, addedBy: req.user.id });

    // Récupérer les infos du projet et de l'inviteur pour l'email
    const projectResult = await pool.query(
      'SELECT title FROM projects WHERE id = $1',
      [id]
    );
    const inviterResult = await pool.query(
      'SELECT first_name, last_name FROM users WHERE id = $1',
      [req.user.id]
    );
    const membersResult = await pool.query(
      `SELECT u.first_name, u.last_name, u.role
       FROM project_members pm
       JOIN users u ON pm.user_id = u.id
       WHERE pm.project_id = $1`,
      [id]
    );

    const newMember = userCheck.rows[0];
    const project = projectResult.rows[0];
    const inviter = inviterResult.rows[0];
    const frontendUrl = process.env.FRONTEND_URL || 'https://wevalid.fr';

    // Envoyer l'email de notification (sans bloquer)
    sendProjectInvitationNotification({
      recipientEmail: newMember.email,
      recipientName: `${newMember.first_name} ${newMember.last_name}`,
      projectTitle: project.title,
      invitedByName: `${inviter.first_name} ${inviter.last_name}`,
      role: newMember.role,
      projectUrl: `${frontendUrl}/projects/${id}`,
      members: membersResult.rows
    }).catch(err => {
      logger.error('Erreur envoi notification ajout projet:', { error: err.message, to: newMember.email });
    });

    res.status(201).json({
      message: 'Membre ajouté avec succès',
      user: userCheck.rows[0]
    });
  } catch (error) {
    logger.error('Erreur lors de l\'ajout du membre:', error);
    res.status(500).json({ error: { message: 'Erreur serveur' } });
  }
});

// Retirer un membre du projet (admin + éditeurs + fabricant)
router.delete('/:id/members/:userId', authorizeRoles('admin', 'editeur', 'fabricant'), async (req, res) => {
  const { id, userId } = req.params;

  try {
    const result = await pool.query(
      'DELETE FROM project_members WHERE project_id = $1 AND user_id = $2 RETURNING *',
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: { message: 'Membre non trouvé dans ce projet' } });
    }

    logger.info('Membre retiré du projet:', { projectId: id, userId, removedBy: req.user.id });

    res.json({ message: 'Membre retiré avec succès' });
  } catch (error) {
    logger.error('Erreur lors du retrait du membre:', error);
    res.status(500).json({ error: { message: 'Erreur serveur' } });
  }
});

module.exports = router;
