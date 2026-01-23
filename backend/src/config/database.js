const { Pool } = require('pg');
const logger = require('../utils/logger');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  logger.error('Erreur PostgreSQL inattendue:', err);
  process.exit(-1);
});

async function connectDB() {
  try {
    const client = await pool.connect();
    await client.query('SELECT NOW()');
    client.release();
    logger.info('Connexion PostgreSQL établie');
  } catch (error) {
    logger.error('Erreur de connexion PostgreSQL:', error);
    throw error;
  }
}

module.exports = { pool, connectDB };