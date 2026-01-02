const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

// Get pool from server.js or create new one
let pool;
if (global.dbPool) {
  pool = global.dbPool;
} else {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });
}

// GET /api/categories
router.get('/categories', async (req, res) => {
  console.log('GET /api/categories - Fetching categories');
  try {
    if (!pool) {
      console.error('GET /api/categories - Database not configured');
      return res.status(503).json({ 
        message: 'Database not configured. Please set DATABASE_URL environment variable.' 
      });
    }
    const result = await pool.query('SELECT * FROM categories ORDER BY type, name');
    console.log(`GET /api/categories - Found ${result.rows.length} categories`);
    res.json(result.rows);
  } catch (error) {
    console.error('GET /api/categories - Database error:', error);
    res.status(500).json({ 
      message: 'Failed to fetch categories',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// POST /api/categories
router.post('/categories', async (req, res) => {
  console.log('POST /api/categories - Creating category');
  console.log('Request body:', req.body);
  try {
    const { name, type, icon, color } = req.body;

    if (!name || !type) {
      console.log('POST /api/categories - Validation failed: missing name or type');
      return res.status(400).json({ message: 'Name and type are required' });
    }

    const result = await pool.query(
      'INSERT INTO categories (name, type, icon, color) VALUES ($1, $2, $3, $4) RETURNING *',
      [name, type, icon, color]
    );
    console.log('POST /api/categories - Category created:', result.rows[0]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('POST /api/categories - Error:', error);
    if (error.code === '23505') { // Unique violation
      res.status(400).json({ message: 'Category name already exists' });
    } else {
      res.status(500).json({ message: 'Failed to create category' });
    }
  }
});

// PUT /api/categories/:id
router.put('/categories/:id', async (req, res) => {
  console.log('PUT /api/categories/:id - Updating category', req.params.id);
  console.log('Request body:', req.body);
  try {
    const { name, type, icon, color } = req.body;
    const result = await pool.query(
      'UPDATE categories SET name = $1, type = $2, icon = $3, color = $4 WHERE id = $5 RETURNING *',
      [name, type, icon, color, req.params.id]
    );

    if (result.rows.length === 0) {
      console.log('PUT /api/categories/:id - Category not found');
      return res.status(404).json({ message: 'Category not found' });
    }

    console.log('PUT /api/categories/:id - Category updated');
    res.json(result.rows[0]);
  } catch (error) {
    console.error('PUT /api/categories/:id - Error:', error);
    res.status(500).json({ message: 'Failed to update category' });
  }
});

// DELETE /api/categories/:id
router.delete('/categories/:id', async (req, res) => {
  console.log('DELETE /api/categories/:id - Deleting category', req.params.id);
  try {
    const result = await pool.query('DELETE FROM categories WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) {
      console.log('DELETE /api/categories/:id - Category not found');
      return res.status(404).json({ message: 'Category not found' });
    }
    console.log('DELETE /api/categories/:id - Category deleted');
    res.status(204).send();
  } catch (error) {
    console.error('DELETE /api/categories/:id - Error:', error);
    if (error.code === '23503') { // Foreign key violation
      res.status(400).json({ message: 'Cannot delete category with existing transactions' });
    } else {
      res.status(500).json({ message: 'Failed to delete category' });
    }
  }
});

module.exports = router;