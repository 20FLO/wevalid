const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');
const logger = require('../utils/logger');

// Middleware de vérification du token JWT
async function authenticateToken(req, res, next) {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({ error: { message: 'Token d\'authentification manquant' } });
    }

    jwt.verify(token, process.env.JWT_SECRET, async (err, decoded) => {
      if (err) {
        logger.warn('Token invalide:', { error: err.message });
        return res.status(403).json({ error: { message: 'Token invalide ou expiré' } });
      }

      // Récupérer l'utilisateur depuis la DB
      const result = await pool.query(
        'SELECT id, email, role, first_name, last_name, is_active FROM users WHERE id = $1',
        [decoded.userId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: { message: 'Utilisateur non trouvé' } });
      }

      const user = result.rows[0];

      if (!user.is_active) {
        return res.status(403).json({ error: { message: 'Compte utilisateur désactivé' } });
      }

      req.user = user;
      next();
    });
  } catch (error) {
    logger.error('Erreur authentification:', error);
    return res.status(500).json({ error: { message: 'Erreur serveur' } });
  }
}

// Middleware de vérification des rôles
function authorizeRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: { message: 'Non authentifié' } });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ 
        error: { 
          message: 'Accès refusé : privilèges insuffisants',
          requiredRoles: allowedRoles,
          userRole: req.user.role
        } 
      });
    }

    next();
  };
}

module.exports = { authenticateToken, authorizeRoles };