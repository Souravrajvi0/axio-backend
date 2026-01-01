const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// GET /api/tags
router.get('/tags', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM tags ORDER BY name');
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Failed to fetch tags' });
  }
});

// POST /api/tags
router.post('/tags', async (req, res) => {
  try {
    const { name } = req.body;

    if (!name) {
      return res.status(400).json({ message: 'Name is required' });
    }

    const result = await pool.query(`
      INSERT INTO tags (name) VALUES ($1)
      ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
      RETURNING *
    `, [name]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Failed to create tag' });
  }
});

// PUT /api/tags/:id
router.put('/tags/:id', async (req, res) => {
  try {
    const { name } = req.body;
    const result = await pool.query(
      'UPDATE tags SET name = $1 WHERE id = $2 RETURNING *',
      [name, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Tag not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Failed to update tag' });
  }
});

// DELETE /api/tags/:id
router.delete('/tags/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM tags WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Tag not found' });
    }
    res.status(204).send();
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Failed to delete tag' });
  }
});

module.exports = router;