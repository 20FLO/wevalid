const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');
const { getRedisClient } = require('../config/redis');
const { validate, schemas } = require('../middleware/validation');
const logger = require('../utils/logger');

// Inscription
router.post('/register', validate(schemas.register), async (req, res) => {
  const { email, password, first_name, last_name, role } = req.validatedBody;

  try {
    // Vérifier si l'email existe déjà
    const existingUser = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    
    if (existingUser.rows.length > 0) {
      return res.status(409).json({ error: { message: 'Cet email est déjà utilisé' } });
    }

    // Hasher le mot de passe
    const hashedPassword = await bcrypt.hash(password, 12);

    // Créer l'utilisateur
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, role, is_active)
       VALUES ($1, $2, $3, $4, $5, true)
       RETURNING id, email, first_name, last_name, role, created_at`,
      [email, hashedPassword, first_name, last_name, role]
    );

    const user = result.rows[0];
    logger.info('Nouvel utilisateur créé:', { userId: user.id, email: user.email, role: user.role });

    res.status(201).json({
      message: 'Utilisateur créé avec succès',
      user: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        role: user.role,
        created_at: user.created_at
      }
    });
  } catch (error) {
    logger.error('Erreur lors de l\'inscription:', error);
    res.status(500).json({ error: { message: 'Erreur serveur' } });
  }
});

// Connexion
router.post('/login', validate(schemas.login), async (req, res) => {
  const { email, password } = req.validatedBody;

  try {
    // Récupérer l'utilisateur
    const result = await pool.query(
      'SELECT id, email, password_hash, first_name, last_name, role, is_active FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: { message: 'Email ou mot de passe incorrect' } });
    }

    const user = result.rows[0];

    if (!user.is_active) {
      return res.status(403).json({ error: { message: 'Compte désactivé' } });
    }

    // Vérifier le mot de passe
    const isValidPassword = await bcrypt.compare(password, user.password_hash);

    if (!isValidPassword) {
      return res.status(401).json({ error: { message: 'Email ou mot de passe incorrect' } });
    }

    // Générer les tokens
    const accessToken = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    const refreshToken = jwt.sign(
      { userId: user.id },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: '7d' }
    );

    // Stocker le refresh token dans Redis
    const redis = getRedisClient();
    await redis.setEx(`refresh_token:${user.id}`, 7 * 24 * 60 * 60, refreshToken);

    // Mettre à jour la dernière connexion
    await pool.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);

    logger.info('Connexion réussie:', { userId: user.id, email: user.email });

    res.json({
      message: 'Connexion réussie',
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        role: user.role
      }
    });
  } catch (error) {
    logger.error('Erreur lors de la connexion:', error);
    res.status(500).json({ error: { message: 'Erreur serveur' } });
  }
});

// Rafraîchir le token
router.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(401).json({ error: { message: 'Refresh token manquant' } });
  }

  try {
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);

    // Vérifier dans Redis
    const redis = getRedisClient();
    const storedToken = await redis.get(`refresh_token:${decoded.userId}`);

    if (storedToken !== refreshToken) {
      return res.status(403).json({ error: { message: 'Refresh token invalide' } });
    }

    // Récupérer l'utilisateur
    const result = await pool.query(
      'SELECT id, email, role FROM users WHERE id = $1 AND is_active = true',
      [decoded.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: { message: 'Utilisateur non trouvé' } });
    }

    const user = result.rows[0];

    // Générer un nouveau access token
    const newAccessToken = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    res.json({
      accessToken: newAccessToken
    });
  } catch (error) {
    logger.error('Erreur lors du rafraîchissement du token:', error);
    res.status(403).json({ error: { message: 'Refresh token invalide ou expiré' } });
  }
});

// Déconnexion
router.post('/logout', async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(400).json({ error: { message: 'Refresh token manquant' } });
  }

  try {
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);

    // Supprimer le refresh token de Redis
    const redis = getRedisClient();
    await redis.del(`refresh_token:${decoded.userId}`);

    logger.info('Déconnexion réussie:', { userId: decoded.userId });

    res.json({ message: 'Déconnexion réussie' });
  } catch (error) {
    logger.error('Erreur lors de la déconnexion:', error);
    res.status(500).json({ error: { message: 'Erreur serveur' } });
  }
});

module.exports = router;