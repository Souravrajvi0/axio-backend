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

// GET /api/accounts
router.get('/accounts', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM accounts ORDER BY name');
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Failed to fetch accounts' });
  }
});

// POST /api/accounts
router.post('/accounts', async (req, res) => {
  try {
    const { name, type } = req.body;

    if (!name || !type) {
      return res.status(400).json({ message: 'Name and type are required' });
    }

    const result = await pool.query(
      'INSERT INTO accounts (name, type) VALUES ($1, $2) RETURNING *',
      [name, type]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error(error);
    if (error.code === '23505') { // Unique violation
      res.status(400).json({ message: 'Account name already exists' });
    } else {
      res.status(500).json({ message: 'Failed to create account' });
    }
  }
});

// PUT /api/accounts/:id
router.put('/accounts/:id', async (req, res) => {
  try {
    const { name, type } = req.body;
    const result = await pool.query(
      'UPDATE accounts SET name = $1, type = $2 WHERE id = $3 RETURNING *',
      [name, type, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Account not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Failed to update account' });
  }
});

// DELETE /api/accounts/:id
router.delete('/accounts/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM accounts WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Account not found' });
    }
    res.status(204).send();
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Failed to delete account' });
  }
});

module.exports = router;