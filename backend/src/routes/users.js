const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const logger = require('../utils/logger');
const bcrypt = require('bcrypt');

router.use(authenticateToken);

// Lister tous les utilisateurs (réservé aux éditeurs et fabricants)
router.get('/', authorizeRoles('editeur', 'fabricant'), async (req, res) => {
  try {
    const { role, search } = req.query;

    let query = 'SELECT id, email, first_name, last_name, role, is_active, created_at, last_login FROM users WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (role) {
      query += ` AND role = $${paramIndex}`;
      params.push(role);
      paramIndex++;
    }

    if (search) {
      query += ` AND (first_name ILIKE $${paramIndex} OR last_name ILIKE $${paramIndex} OR email ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    query += ' ORDER BY created_at DESC';

    const result = await pool.query(query, params);

    res.json({ users: result.rows });
  } catch (error) {
    logger.error('Erreur lors de la récupération des utilisateurs:', error);
    res.status(500).json({ error: { message: 'Erreur serveur' } });
  }
});

// Récupérer son propre profil
router.get('/me', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, email, first_name, last_name, role, is_active, created_at, last_login FROM users WHERE id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: { message: 'Utilisateur non trouvé' } });
    }

    res.json({ user: result.rows[0] });
  } catch (error) {
    logger.error('Erreur lors de la récupération du profil:', error);
    res.status(500).json({ error: { message: 'Erreur serveur' } });
  }
});

// Récupérer un utilisateur spécifique
router.get('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      'SELECT id, email, first_name, last_name, role, is_active, created_at, last_login FROM users WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: { message: 'Utilisateur non trouvé' } });
    }

    res.json({ user: result.rows[0] });
  } catch (error) {
    logger.error('Erreur lors de la récupération de l\'utilisateur:', error);
    res.status(500).json({ error: { message: 'Erreur serveur' } });
  }
});

// Mettre à jour son propre profil
router.put('/me', async (req, res) => {
  const { first_name, last_name, email } = req.body;

  try {
    const updates = {};
    if (first_name) updates.first_name = first_name;
    if (last_name) updates.last_name = last_name;
    if (email) {
      // Vérifier que l'email n'est pas déjà utilisé
      const emailCheck = await pool.query(
        'SELECT id FROM users WHERE email = $1 AND id != $2',
        [email, req.user.id]
      );
      if (emailCheck.rows.length > 0) {
        return res.status(409).json({ error: { message: 'Cet email est déjà utilisé' } });
      }
      updates.email = email;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: { message: 'Aucune donnée à mettre à jour' } });
    }

    const fields = Object.keys(updates);
    const values = Object.values(updates);
    const setClause = fields.map((field, index) => `${field} = $${index + 1}`).join(', ');

    const result = await pool.query(
      `UPDATE users SET ${setClause}, updated_at = NOW() WHERE id = $${fields.length + 1} 
       RETURNING id, email, first_name, last_name, role, is_active`,
      [...values, req.user.id]
    );

    logger.info('Profil mis à jour:', { userId: req.user.id });

    res.json({
      message: 'Profil mis à jour avec succès',
      user: result.rows[0]
    });
  } catch (error) {
    logger.error('Erreur lors de la mise à jour du profil:', error);
    res.status(500).json({ error: { message: 'Erreur serveur' } });
  }
});

// Changer son mot de passe
router.put('/me/password', async (req, res) => {
  const { current_password, new_password } = req.body;

  if (!current_password || !new_password) {
    return res.status(400).json({ error: { message: 'current_password et new_password requis' } });
  }

  if (new_password.length < 8) {
    return res.status(400).json({ error: { message: 'Le nouveau mot de passe doit contenir au moins 8 caractères' } });
  }

  try {
    // Récupérer le mot de passe actuel
    const result = await pool.query(
      'SELECT password_hash FROM users WHERE id = $1',
      [req.user.id]
    );

    const user = result.rows[0];

    // Vérifier le mot de passe actuel
    const isValid = await bcrypt.compare(current_password, user.password_hash);

    if (!isValid) {
      return res.status(401).json({ error: { message: 'Mot de passe actuel incorrect' } });
    }

    // Hasher le nouveau mot de passe
    const newHashedPassword = await bcrypt.hash(new_password, 12);

    // Mettre à jour
    await pool.query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [newHashedPassword, req.user.id]
    );

    logger.info('Mot de passe changé:', { userId: req.user.id });

    res.json({ message: 'Mot de passe changé avec succès' });
  } catch (error) {
    logger.error('Erreur lors du changement de mot de passe:', error);
    res.status(500).json({ error: { message: 'Erreur serveur' } });
  }
});

// Désactiver/Activer un utilisateur (admin uniquement)
router.patch('/:id/status', authorizeRoles('editeur', 'fabricant'), async (req, res) => {
  const { id } = req.params;
  const { is_active } = req.body;

  if (typeof is_active !== 'boolean') {
    return res.status(400).json({ error: { message: 'is_active doit être un boolean' } });
  }

  try {
    const result = await pool.query(
      'UPDATE users SET is_active = $1, updated_at = NOW() WHERE id = $2 RETURNING id, email, is_active',
      [is_active, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: { message: 'Utilisateur non trouvé' } });
    }

    logger.info('Statut utilisateur changé:', { 
      userId: id, 
      isActive: is_active, 
      changedBy: req.user.id 
    });

    res.json({
      message: `Utilisateur ${is_active ? 'activé' : 'désactivé'} avec succès`,
      user: result.rows[0]
    });
  } catch (error) {
    logger.error('Erreur lors du changement de statut:', error);
    res.status(500).json({ error: { message: 'Erreur serveur' } });
  }
});

module.exports = router;