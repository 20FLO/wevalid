const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const logger = require('../utils/logger');
const bcrypt = require('bcrypt');

router.use(authenticateToken);

// ============================================
// ROUTES /me EN PREMIER (avant /:id)
// ============================================

router.get('/me', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, email, first_name, last_name, role, is_active, created_at, last_login, COALESCE(sanitize_filenames, false) as sanitize_filenames FROM users WHERE id = $1',
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

router.put('/me', async (req, res) => {
  const { first_name, last_name, email, sanitize_filenames } = req.body;
  try {
    const updates = {};
    if (first_name) updates.first_name = first_name;
    if (last_name) updates.last_name = last_name;
    if (email) {
      const emailCheck = await pool.query(
        'SELECT id FROM users WHERE email = $1 AND id != $2',
        [email, req.user.id]
      );
      if (emailCheck.rows.length > 0) {
        return res.status(409).json({ error: { message: 'Cet email est déjà utilisé' } });
      }
      updates.email = email;
    }
    if (typeof sanitize_filenames === 'boolean') {
      updates.sanitize_filenames = sanitize_filenames;
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: { message: 'Aucune donnée à mettre à jour' } });
    }
    const fields = Object.keys(updates);
    const values = Object.values(updates);
    const setClause = fields.map((field, index) => `${field} = $${index + 1}`).join(', ');
    const result = await pool.query(
      `UPDATE users SET ${setClause}, updated_at = NOW() WHERE id = $${fields.length + 1}
       RETURNING id, email, first_name, last_name, role, is_active, COALESCE(sanitize_filenames, false) as sanitize_filenames`,
      [...values, req.user.id]
    );
    logger.info('Profil mis à jour:', { userId: req.user.id });
    res.json({ message: 'Profil mis à jour avec succès', user: result.rows[0] });
  } catch (error) {
    logger.error('Erreur lors de la mise à jour du profil:', error);
    res.status(500).json({ error: { message: 'Erreur serveur' } });
  }
});

router.put('/me/password', async (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) {
    return res.status(400).json({ error: { message: 'current_password et new_password requis' } });
  }
  if (new_password.length < 8) {
    return res.status(400).json({ error: { message: 'Le nouveau mot de passe doit contenir au moins 8 caractères' } });
  }
  try {
    const result = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    const user = result.rows[0];
    const isValid = await bcrypt.compare(current_password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: { message: 'Mot de passe actuel incorrect' } });
    }
    const newHashedPassword = await bcrypt.hash(new_password, 12);
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

// ============================================
// ROUTES GÉNÉRALES
// ============================================

router.get('/', authorizeRoles('admin', 'editeur', 'fabricant'), async (req, res) => {
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

router.post('/', authorizeRoles('admin'), async (req, res) => {
  const { email, password, first_name, last_name, role } = req.body;
  if (!email || !password || !first_name || !last_name || !role) {
    return res.status(400).json({ error: { message: 'Tous les champs sont requis' } });
  }
  const validRoles = ['admin', 'auteur', 'editeur', 'photograveur', 'fabricant', 'graphiste'];
  if (!validRoles.includes(role)) {
    return res.status(400).json({ error: { message: 'Rôle invalide' } });
  }
  try {
    const emailCheck = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (emailCheck.rows.length > 0) {
      return res.status(409).json({ error: { message: 'Cet email est déjà utilisé' } });
    }
    const password_hash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, email, first_name, last_name, role, is_active, created_at`,
      [email, password_hash, first_name, last_name, role]
    );
    logger.info('Utilisateur créé:', { userId: result.rows[0].id, createdBy: req.user.id });
    res.status(201).json({ message: 'Utilisateur créé avec succès', user: result.rows[0] });
  } catch (error) {
    logger.error('Erreur lors de la création de l\'utilisateur:', error);
    res.status(500).json({ error: { message: 'Erreur serveur' } });
  }
});

// ============================================
// ROUTES /:id EN DERNIER
// ============================================

router.get('/:id', authorizeRoles('admin', 'editeur', 'fabricant'), async (req, res) => {
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

router.put('/:id', authorizeRoles('admin'), async (req, res) => {
  const { id } = req.params;
  const { email, first_name, last_name, role, password } = req.body;
  try {
    const userCheck = await pool.query('SELECT id FROM users WHERE id = $1', [id]);
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: { message: 'Utilisateur non trouvé' } });
    }
    const updates = [];
    const values = [];
    let paramIndex = 1;
    if (email) {
      const emailCheck = await pool.query('SELECT id FROM users WHERE email = $1 AND id != $2', [email, id]);
      if (emailCheck.rows.length > 0) {
        return res.status(409).json({ error: { message: 'Cet email est déjà utilisé' } });
      }
      updates.push(`email = $${paramIndex}`);
      values.push(email);
      paramIndex++;
    }
    if (first_name) {
      updates.push(`first_name = $${paramIndex}`);
      values.push(first_name);
      paramIndex++;
    }
    if (last_name) {
      updates.push(`last_name = $${paramIndex}`);
      values.push(last_name);
      paramIndex++;
    }
    if (role) {
      const validRoles = ['admin', 'auteur', 'editeur', 'photograveur', 'fabricant', 'graphiste'];
      if (!validRoles.includes(role)) {
        return res.status(400).json({ error: { message: 'Rôle invalide' } });
      }
      updates.push(`role = $${paramIndex}`);
      values.push(role);
      paramIndex++;
    }
    if (password) {
      const password_hash = await bcrypt.hash(password, 12);
      updates.push(`password_hash = $${paramIndex}`);
      values.push(password_hash);
      paramIndex++;
    }
    if (updates.length === 0) {
      return res.status(400).json({ error: { message: 'Aucune donnée à mettre à jour' } });
    }
    updates.push('updated_at = NOW()');
    values.push(id);
    const result = await pool.query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex}
       RETURNING id, email, first_name, last_name, role, is_active`,
      values
    );
    logger.info('Utilisateur modifié:', { userId: id, modifiedBy: req.user.id });
    res.json({ message: 'Utilisateur modifié avec succès', user: result.rows[0] });
  } catch (error) {
    logger.error('Erreur lors de la modification de l\'utilisateur:', error);
    res.status(500).json({ error: { message: 'Erreur serveur' } });
  }
});

router.patch('/:id/status', authorizeRoles('admin'), async (req, res) => {
  const { id } = req.params;
  const { is_active } = req.body;
  if (typeof is_active !== 'boolean') {
    return res.status(400).json({ error: { message: 'is_active doit être un boolean' } });
  }
  if (parseInt(id) === req.user.id && !is_active) {
    return res.status(400).json({ error: { message: 'Vous ne pouvez pas vous désactiver vous-même' } });
  }
  try {
    const result = await pool.query(
      'UPDATE users SET is_active = $1, updated_at = NOW() WHERE id = $2 RETURNING id, email, is_active',
      [is_active, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: { message: 'Utilisateur non trouvé' } });
    }
    logger.info('Statut utilisateur changé:', { userId: id, isActive: is_active, changedBy: req.user.id });
    res.json({ message: `Utilisateur ${is_active ? 'activé' : 'désactivé'} avec succès`, user: result.rows[0] });
  } catch (error) {
    logger.error('Erreur lors du changement de statut:', error);
    res.status(500).json({ error: { message: 'Erreur serveur' } });
  }
});

router.delete('/:id', authorizeRoles('admin'), async (req, res) => {
  const { id } = req.params;
  if (parseInt(id) === req.user.id) {
    return res.status(400).json({ error: { message: 'Vous ne pouvez pas vous supprimer vous-même' } });
  }
  try {
    const result = await pool.query('DELETE FROM users WHERE id = $1 RETURNING id, email', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: { message: 'Utilisateur non trouvé' } });
    }
    logger.info('Utilisateur supprimé:', { userId: id, deletedBy: req.user.id });
    res.json({ message: 'Utilisateur supprimé avec succès' });
  } catch (error) {
    logger.error('Erreur lors de la suppression de l\'utilisateur:', error);
    res.status(500).json({ error: { message: 'Erreur serveur' } });
  }
});

module.exports = router;
