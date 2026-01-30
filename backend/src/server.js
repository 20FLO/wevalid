// Charge .env seulement s'il existe (pour le développement local)
const fs = require('fs');
if (fs.existsSync('.env')) {
  require('dotenv').config();
}

const express = require('express');
const helmet = require('helmet');  // ⬅️ CETTE LIGNE EST CRITIQUE
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const logger = require('./utils/logger');
const { connectDB } = require('./config/database');
const { connectRedis } = require('./config/redis');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy (pour Synology reverse proxy)
app.set('trust proxy', 1);

// CORS
app.use(cors({
  origin: true,
  credentials: true
}));

// Middlewares de sécurité
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' }, // Permet l'accès aux images/fichiers depuis d'autres origines
}));

// Rate limiting global - plus permissif pour le développement
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5000, // limite par IP augmentée
  message: 'Trop de requêtes depuis cette IP, veuillez réessayer plus tard.',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// Body parsing
app.use(express.json({ limit: '1000mb' }));
app.use(express.urlencoded({ extended: true, limit: '1000mb' }));

// Servir le frontend statique
app.use(express.static('/app/frontend'));

// Logging des requêtes
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, { ip: req.ip });
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    version: '0.1.0'
  });
});

// Routes API
app.use('/api/auth', require('./routes/auth'));
app.use('/api/projects', require('./routes/projects'));
app.use('/api/pages', require('./routes/pages'));
app.use('/api/files', require('./routes/files'));
app.use('/api/users', require('./routes/users'));
app.use('/api/workflows', require('./routes/workflows'));
app.use('/api/annotations', require('./routes/annotations'));
app.use('/api/publishers', require('./routes/publishers'));
app.use('/api/project-files', require('./routes/project-files'));

// Gestion des erreurs 404
app.use((req, res) => {
  res.status(404).json({ 
    error: { 
      message: 'Route non trouvée',
      path: req.path
    } 
  });
});

// Gestion globale des erreurs
app.use((err, req, res, next) => {
  logger.error('Error:', { 
    message: err.message, 
    stack: err.stack,
    path: req.path 
  });
  
  res.status(err.status || 500).json({
    error: {
      message: err.message || 'Erreur interne du serveur',
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    }
  });
});

// Démarrage du serveur
async function startServer() {
  try {
    // Connexion à la base de données
    await connectDB();
    logger.info('✓ PostgreSQL connecté');
    
    // Connexion à Redis
    await connectRedis();
    logger.info('✓ Redis connecté');
    
    // Démarrage du serveur Express
    app.listen(PORT, '0.0.0.0', () => {
      logger.info(`🚀 Wevalid backend démarré sur le port ${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV}`);
      logger.info(`Frontend URL: ${process.env.FRONTEND_URL}`);
    });
  } catch (error) {
    logger.error('Échec du démarrage du serveur:', error);
    process.exit(1);
  }
}

startServer();

// Gestion de l'arrêt gracieux
process.on('SIGTERM', () => {
  logger.info('SIGTERM reçu, arrêt gracieux en cours...');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT reçu, arrêt gracieux en cours...');
  process.exit(0);
});
