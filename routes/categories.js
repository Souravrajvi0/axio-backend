const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// GET /api/categories
router.get('/categories', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM categories ORDER BY type, name');
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Failed to fetch categories' });
  }
});

// POST /api/categories
router.post('/categories', async (req, res) => {
  try {
    const { name, type, icon, color } = req.body;

    if (!name || !type) {
      return res.status(400).json({ message: 'Name and type are required' });
    }

    const result = await pool.query(
      'INSERT INTO categories (name, type, icon, color) VALUES ($1, $2, $3, $4) RETURNING *',
      [name, type, icon, color]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error(error);
    if (error.code === '23505') { // Unique violation
      res.status(400).json({ message: 'Category name already exists' });
    } else {
      res.status(500).json({ message: 'Failed to create category' });
    }
  }
});

// PUT /api/categories/:id
router.put('/categories/:id', async (req, res) => {
  try {
    const { name, type, icon, color } = req.body;
    const result = await pool.query(
      'UPDATE categories SET name = $1, type = $2, icon = $3, color = $4 WHERE id = $5 RETURNING *',
      [name, type, icon, color, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Category not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Failed to update category' });
  }
});

// DELETE /api/categories/:id
router.delete('/categories/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM categories WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Category not found' });
    }
    res.status(204).send();
  } catch (error) {
    console.error(error);
    if (error.code === '23503') { // Foreign key violation
      res.status(400).json({ message: 'Cannot delete category with existing transactions' });
    } else {
      res.status(500).json({ message: 'Failed to delete category' });
    }
  }
});

module.exports = router;