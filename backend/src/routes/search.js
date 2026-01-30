const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const logger = require('../utils/logger');

router.use(authenticateToken);

// GET /search?q=query - Recherche globale
router.get('/', async (req, res) => {
  const { q } = req.query;

  if (!q || q.trim().length < 2) {
    return res.status(400).json({ error: { message: 'Requête trop courte (min 2 caractères)' } });
  }

  const searchTerm = `%${q.trim().toLowerCase()}%`;

  try {
    // Recherche dans les projets
    const projectsResult = await pool.query(`
      SELECT id, title, isbn, description, status, 'project' as type
      FROM projects
      WHERE LOWER(title) LIKE $1 OR LOWER(isbn) LIKE $1 OR LOWER(description) LIKE $1
      ORDER BY updated_at DESC
      LIMIT 10
    `, [searchTerm]);

    // Recherche dans les fichiers projet
    const projectFilesResult = await pool.query(`
      SELECT pf.id, pf.original_filename as title, pf.description, pf.category,
             pf.project_id, p.title as project_title, 'project_file' as type
      FROM project_files pf
      JOIN projects p ON pf.project_id = p.id
      WHERE LOWER(pf.original_filename) LIKE $1 OR LOWER(pf.description) LIKE $1
      ORDER BY pf.uploaded_at DESC
      LIMIT 10
    `, [searchTerm]);

    // Recherche dans les fichiers de pages
    const pageFilesResult = await pool.query(`
      SELECT f.id, f.original_filename as title, pg.page_number,
             p.id as project_id, p.title as project_title, 'page_file' as type
      FROM files f
      JOIN pages pg ON f.page_id = pg.id
      JOIN projects p ON pg.project_id = p.id
      WHERE LOWER(f.original_filename) LIKE $1
      ORDER BY f.uploaded_at DESC
      LIMIT 10
    `, [searchTerm]);

    // Recherche dans les maisons d'édition
    const publishersResult = await pool.query(`
      SELECT id, name as title, description, 'publisher' as type
      FROM publishers
      WHERE LOWER(name) LIKE $1 OR LOWER(description) LIKE $1
      ORDER BY name
      LIMIT 5
    `, [searchTerm]);

    res.json({
      query: q,
      results: {
        projects: projectsResult.rows,
        project_files: projectFilesResult.rows,
        page_files: pageFilesResult.rows,
        publishers: publishersResult.rows,
      },
      total: projectsResult.rows.length + projectFilesResult.rows.length +
             pageFilesResult.rows.length + publishersResult.rows.length
    });
  } catch (error) {
    logger.error('Erreur recherche globale:', error);
    res.status(500).json({ error: { message: 'Erreur serveur' } });
  }
});

module.exports = router;
