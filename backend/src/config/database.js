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

    // Run auto-migrations
    await runMigrations();
  } catch (error) {
    logger.error('Erreur de connexion PostgreSQL:', error);
    throw error;
  }
}

// Auto-migrations au démarrage
async function runMigrations() {
  const client = await pool.connect();
  try {
    // Migration: Add source tracking columns to files table
    await client.query(`
      ALTER TABLE files ADD COLUMN IF NOT EXISTS source_project_file_id INTEGER;
      ALTER TABLE files ADD COLUMN IF NOT EXISTS source_pdf_page INTEGER;
    `);
    logger.info('✓ Migrations appliquées');
  } catch (error) {
    // Ignore errors if columns already exist or other non-critical issues
    logger.warn('Migration warning (peut être ignoré):', error.message);
  } finally {
    client.release();
  }
}

module.exports = { pool, connectDB };