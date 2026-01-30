const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validation');
const logger = require('../utils/logger');

// Tous les endpoints nécessitent authentification
router.use(authenticateToken);

// Lister les maisons d'édition
// Admin voit toutes, Fabricant voit les siennes
router.get('/', async (req, res) => {
  try {
    const { search } = req.query;
    let query;
    let params = [];
    let paramIndex = 1;

    if (req.user.role === 'admin') {
      // Admin voit toutes les maisons d'édition
      query = `
        SELECT p.*,
               COUNT(DISTINCT up.user_id) as members_count,
               COUNT(DISTINCT pr.id) as projects_count
        FROM publishers p
        LEFT JOIN user_publishers up ON p.id = up.publisher_id
        LEFT JOIN projects pr ON p.id = pr.publisher_id
        WHERE 1=1
      `;
    } else if (req.user.role === 'fabricant') {
      // Fabricant voit seulement ses maisons
      query = `
        SELECT p.*,
               COUNT(DISTINCT up2.user_id) as members_count,
               COUNT(DISTINCT pr.id) as projects_count
        FROM publishers p
        INNER JOIN user_publishers up ON p.id = up.publisher_id AND up.user_id = $${paramIndex}
        LEFT JOIN user_publishers up2 ON p.id = up2.publisher_id
        LEFT JOIN projects pr ON p.id = pr.publisher_id
        WHERE 1=1
      `;
      params.push(req.user.id);
      paramIndex++;
    } else {
      // Autres rôles ne voient aucune maison
      return res.json({ publishers: [] });
    }

    if (search) {
      query += ` AND p.name ILIKE $${paramIndex}`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    query += ' GROUP BY p.id ORDER BY p.name ASC';

    const result = await pool.query(query, params);

    res.json({ publishers: result.rows });
  } catch (error) {
    logger.error('Erreur lors de la récupération des maisons d\'édition:', error);
    res.status(500).json({ error: { message: 'Erreur serveur' } });
  }
});

// Récupérer une maison d'édition spécifique avec ses membres
router.get('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    // Vérifier l'accès
    if (req.user.role !== 'admin') {
      const accessCheck = await pool.query(
        'SELECT 1 FROM user_publishers WHERE publisher_id = $1 AND user_id = $2',
        [id, req.user.id]
      );
      if (accessCheck.rows.length === 0) {
        return res.status(403).json({ error: { message: 'Accès refusé à cette maison d\'édition' } });
      }
    }

    const result = await pool.query(
      `SELECT p.*,
              COUNT(DISTINCT up.user_id) as members_count,
              COUNT(DISTINCT pr.id) as projects_count
       FROM publishers p
       LEFT JOIN user_publishers up ON p.id = up.publisher_id
       LEFT JOIN projects pr ON p.id = pr.publisher_id
       WHERE p.id = $1
       GROUP BY p.id`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: { message: 'Maison d\'édition non trouvée' } });
    }

    const publisher = result.rows[0];

    // Récupérer les membres
    const membersResult = await pool.query(
      `SELECT u.id, u.email, u.first_name, u.last_name, u.role, up.role as publisher_role, up.created_at as joined_at
       FROM user_publishers up
       JOIN users u ON up.user_id = u.id
       WHERE up.publisher_id = $1
       ORDER BY up.created_at`,
      [id]
    );

    publisher.members = membersResult.rows;

    res.json({ publisher });
  } catch (error) {
    logger.error('Erreur lors de la récupération de la maison d\'édition:', error);
    res.status(500).json({ error: { message: 'Erreur serveur' } });
  }
});

// Créer une maison d'édition (admin uniquement)
router.post('/', authorizeRoles('admin'), validate(schemas.createPublisher), async (req, res) => {
  const { name, description } = req.validatedBody;

  try {
    const result = await pool.query(
      `INSERT INTO publishers (name, description)
       VALUES ($1, $2)
       RETURNING *`,
      [name, description]
    );

    const publisher = result.rows[0];

    logger.info('Nouvelle maison d\'édition créée:', { publisherId: publisher.id, name, createdBy: req.user.id });

    res.status(201).json({
      message: 'Maison d\'édition créée avec succès',
      publisher
    });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: { message: 'Une maison d\'édition avec ce nom existe déjà' } });
    }
    logger.error('Erreur lors de la création de la maison d\'édition:', error);
    res.status(500).json({ error: { message: 'Erreur serveur' } });
  }
});

// Mettre à jour une maison d'édition (admin uniquement)
router.put('/:id', authorizeRoles('admin'), validate(schemas.updatePublisher), async (req, res) => {
  const { id } = req.params;
  const updates = req.validatedBody;

  try {
    // Vérifier que la maison d'édition existe
    const checkResult = await pool.query('SELECT id FROM publishers WHERE id = $1', [id]);
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: { message: 'Maison d\'édition non trouvée' } });
    }

    // Construire la requête de mise à jour
    const fields = Object.keys(updates);
    if (fields.length === 0) {
      return res.status(400).json({ error: { message: 'Aucune donnée à mettre à jour' } });
    }

    const values = Object.values(updates);
    const setClause = fields.map((field, index) => `${field} = $${index + 1}`).join(', ');

    const result = await pool.query(
      `UPDATE publishers SET ${setClause}, updated_at = NOW() WHERE id = $${fields.length + 1} RETURNING *`,
      [...values, id]
    );

    logger.info('Maison d\'édition mise à jour:', { publisherId: id, updatedBy: req.user.id });

    res.json({
      message: 'Maison d\'édition mise à jour avec succès',
      publisher: result.rows[0]
    });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: { message: 'Une maison d\'édition avec ce nom existe déjà' } });
    }
    logger.error('Erreur lors de la mise à jour de la maison d\'édition:', error);
    res.status(500).json({ error: { message: 'Erreur serveur' } });
  }
});

// Supprimer une maison d'édition (admin uniquement)
router.delete('/:id', authorizeRoles('admin'), async (req, res) => {
  const { id } = req.params;

  try {
    // Vérifier que la maison d'édition existe
    const checkResult = await pool.query('SELECT id FROM publishers WHERE id = $1', [id]);
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: { message: 'Maison d\'édition non trouvée' } });
    }

    // Vérifier s'il y a des projets associés
    const projectsCheck = await pool.query('SELECT COUNT(*) FROM projects WHERE publisher_id = $1', [id]);
    if (parseInt(projectsCheck.rows[0].count) > 0) {
      return res.status(400).json({
        error: { message: 'Impossible de supprimer cette maison d\'édition car elle a des projets associés' }
      });
    }

    // Supprimer les associations user_publishers d'abord (cascade normalement gérée par FK)
    await pool.query('DELETE FROM user_publishers WHERE publisher_id = $1', [id]);
    await pool.query('DELETE FROM publishers WHERE id = $1', [id]);

    logger.info('Maison d\'édition supprimée:', { publisherId: id, deletedBy: req.user.id });

    res.json({ message: 'Maison d\'édition supprimée avec succès' });
  } catch (error) {
    logger.error('Erreur lors de la suppression de la maison d\'édition:', error);
    res.status(500).json({ error: { message: 'Erreur serveur' } });
  }
});

// Ajouter un membre à une maison d'édition (admin uniquement)
router.post('/:id/members', authorizeRoles('admin'), async (req, res) => {
  const { id } = req.params;
  const { user_id, role = 'member' } = req.body;

  if (!user_id) {
    return res.status(400).json({ error: { message: 'user_id requis' } });
  }

  if (!['admin', 'member'].includes(role)) {
    return res.status(400).json({ error: { message: 'Rôle invalide (admin ou member)' } });
  }

  try {
    // Vérifier que la maison d'édition existe
    const publisherCheck = await pool.query('SELECT id FROM publishers WHERE id = $1', [id]);
    if (publisherCheck.rows.length === 0) {
      return res.status(404).json({ error: { message: 'Maison d\'édition non trouvée' } });
    }

    // Vérifier que l'utilisateur existe
    const userCheck = await pool.query('SELECT id, first_name, last_name, email, role FROM users WHERE id = $1', [user_id]);
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: { message: 'Utilisateur non trouvé' } });
    }

    // Vérifier s'il n'est pas déjà membre
    const memberCheck = await pool.query(
      'SELECT 1 FROM user_publishers WHERE publisher_id = $1 AND user_id = $2',
      [id, user_id]
    );

    if (memberCheck.rows.length > 0) {
      return res.status(409).json({ error: { message: 'Cet utilisateur est déjà membre de cette maison d\'édition' } });
    }

    // Ajouter le membre
    await pool.query(
      'INSERT INTO user_publishers (publisher_id, user_id, role) VALUES ($1, $2, $3)',
      [id, user_id, role]
    );

    logger.info('Membre ajouté à la maison d\'édition:', { publisherId: id, userId: user_id, addedBy: req.user.id });

    res.status(201).json({
      message: 'Membre ajouté avec succès',
      user: userCheck.rows[0]
    });
  } catch (error) {
    logger.error('Erreur lors de l\'ajout du membre:', error);
    res.status(500).json({ error: { message: 'Erreur serveur' } });
  }
});

// Retirer un membre d'une maison d'édition (admin uniquement)
router.delete('/:id/members/:userId', authorizeRoles('admin'), async (req, res) => {
  const { id, userId } = req.params;

  try {
    const result = await pool.query(
      'DELETE FROM user_publishers WHERE publisher_id = $1 AND user_id = $2 RETURNING *',
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: { message: 'Membre non trouvé dans cette maison d\'édition' } });
    }

    logger.info('Membre retiré de la maison d\'édition:', { publisherId: id, userId, removedBy: req.user.id });

    res.json({ message: 'Membre retiré avec succès' });
  } catch (error) {
    logger.error('Erreur lors du retrait du membre:', error);
    res.status(500).json({ error: { message: 'Erreur serveur' } });
  }
});

module.exports = router;
