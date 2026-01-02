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

// Helper function to get tag IDs from tag names
async function getTagIds(tagNames) {
  if (!tagNames || tagNames.length === 0) return [];
  const result = await pool.query(
    'SELECT id FROM tags WHERE name = ANY($1)',
    [tagNames]
  );
  return result.rows.map(row => row.id);
}

// Helper function to build transaction query
async function buildTransactionQuery(filters) {
  let query = `
    SELECT
      t.id,
      t.merchant_name as merchant,
      t.amount,
      t.type,
      t.category_id as category,
      c.icon as categoryIcon,
      (t.transaction_date || 'T' || COALESCE(t.transaction_time::text, '00:00:00'))::timestamptz as date,
      COALESCE(
        jsonb_agg(tag.name) FILTER (WHERE tag.name IS NOT NULL),
        '[]'::jsonb
      ) as tags,
      t.notes,
      a.name as paymentMethod
    FROM transactions t
    LEFT JOIN categories c ON t.category_id = c.id
    LEFT JOIN accounts a ON t.account_id = a.id
    LEFT JOIN transaction_tags tt ON t.id = tt.transaction_id
    LEFT JOIN tags tag ON tt.tag_id = tag.id
  `;

  const conditions = [];
  const params = [];
  let paramIndex = 1;

  if (filters.startDate) {
    conditions.push(`t.transaction_date >= $${paramIndex}`);
    params.push(filters.startDate);
    paramIndex++;
  }

  if (filters.endDate) {
    conditions.push(`t.transaction_date <= $${paramIndex}`);
    params.push(filters.endDate);
    paramIndex++;
  }

  if (filters.categories && filters.categories.length > 0) {
    conditions.push(`t.category_id = ANY($${paramIndex})`);
    params.push(filters.categories);
    paramIndex++;
  }

  if (filters.merchants && filters.merchants.length > 0) {
    conditions.push(`t.merchant_name = ANY($${paramIndex})`);
    params.push(filters.merchants);
    paramIndex++;
  }

  if (filters.type) {
    conditions.push(`t.type = $${paramIndex}`);
    params.push(filters.type);
    paramIndex++;
  }

  // Tag filtering
  if (filters.tags && filters.tags.length > 0) {
    // First get tag IDs
    const tagIds = await getTagIds(filters.tags);
    if (tagIds.length > 0) {
      conditions.push(`t.id IN (
        SELECT tt.transaction_id FROM transaction_tags tt WHERE tt.tag_id = ANY($${paramIndex})
      )`);
      params.push(tagIds);
      paramIndex++;
    }
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  query += `
    GROUP BY t.id, c.id, a.id
    ORDER BY t.transaction_date DESC, t.transaction_time DESC NULLS LAST
  `;

  if (filters.limit) {
    query += ` LIMIT $${paramIndex}`;
    params.push(filters.limit);
    paramIndex++;
  }

  if (filters.offset) {
    query += ` OFFSET $${paramIndex}`;
    params.push(filters.offset);
    paramIndex++;
  }

  return { query, params };
}

// Helper to get formatted transaction
async function getFormattedTransaction(transactionId) {
  const query = `
    SELECT
      t.id,
      t.merchant_name as merchant,
      t.amount,
      t.type,
      t.category_id as category,
      c.icon as categoryIcon,
      (t.transaction_date || 'T' || COALESCE(t.transaction_time::text, '00:00:00'))::timestamptz as date,
      COALESCE(
        jsonb_agg(tag.name) FILTER (WHERE tag.name IS NOT NULL),
        '[]'::jsonb
      ) as tags,
      t.notes,
      a.name as paymentMethod
    FROM transactions t
    LEFT JOIN categories c ON t.category_id = c.id
    LEFT JOIN accounts a ON t.account_id = a.id
    LEFT JOIN transaction_tags tt ON t.id = tt.transaction_id
    LEFT JOIN tags tag ON tt.tag_id = tag.id
    WHERE t.id = $1
    GROUP BY t.id, c.id, a.id
  `;
  const result = await pool.query(query, [transactionId]);
  return result.rows[0];
}

// GET /api/transactions
router.get('/transactions', async (req, res) => {
  try {
    const filters = {
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      categories: req.query.categories ? req.query.categories.split(',') : null,
      merchants: req.query.merchants ? req.query.merchants.split(',') : null,
      tags: req.query.tags ? req.query.tags.split(',') : null,
      type: req.query.type,
      limit: req.query.limit ? parseInt(req.query.limit) : null,
      offset: req.query.offset ? parseInt(req.query.offset) : null,
    };

    const { query, params } = await buildTransactionQuery(filters);
    const result = await pool.query(query, params);

    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Failed to fetch transactions' });
  }
});

// GET /api/transactions/:id
router.get('/transactions/:id', async (req, res) => {
  try {
    const transaction = await getFormattedTransaction(req.params.id);

    if (!transaction) {
      return res.status(404).json({ message: 'Transaction not found' });
    }

    res.json(transaction);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Failed to fetch transaction' });
  }
});

// POST /api/transactions
router.post('/transactions', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { merchant, amount, type, category, tags, notes, paymentMethod, date } = req.body;

    // Input validation
    if (!merchant || !amount || !type || !category || !date) {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        message: 'Missing required fields',
        errors: {
          merchant: !merchant ? ['Merchant is required'] : undefined,
          amount: !amount ? ['Amount is required'] : undefined,
          type: !type ? ['Type is required'] : undefined,
          category: !category ? ['Category is required'] : undefined,
          date: !date ? ['Date is required'] : undefined,
        }
      });
    }

    if (type !== 'expense' && type !== 'income') {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        message: 'Invalid type. Must be "expense" or "income"' 
      });
    }

    if (isNaN(amount) || parseFloat(amount) < 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        message: 'Amount must be a positive number' 
      });
    }

    // Parse date
    const transactionDate = new Date(date);
    if (isNaN(transactionDate.getTime())) {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        message: 'Invalid date format' 
      });
    }
    const transaction_date = transactionDate.toISOString().split('T')[0];
    const transaction_time = transactionDate.toTimeString().split(' ')[0];

    // Get account ID
    let account_id = null;
    if (paymentMethod) {
      const accountResult = await client.query('SELECT id FROM accounts WHERE name = $1', [paymentMethod]);
      if (accountResult.rows.length > 0) {
        account_id = accountResult.rows[0].id;
      } else {
        // Create account if not exists
        const newAccount = await client.query(
          'INSERT INTO accounts (name, type) VALUES ($1, $2) RETURNING id',
          [paymentMethod, 'other']
        );
        account_id = newAccount.rows[0].id;
      }
    }

    // Insert transaction
    const transactionResult = await client.query(`
      INSERT INTO transactions (
        merchant_name, amount, type, category_id, account_id,
        transaction_date, transaction_time, notes, source
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'manual')
      RETURNING *
    `, [merchant, amount, type, category, account_id, transaction_date, transaction_time, notes]);

    const transaction = transactionResult.rows[0];

    // Handle tags
    if (tags && tags.length > 0) {
      for (const tagName of tags) {
        // Upsert tag
        const tagResult = await client.query(`
          INSERT INTO tags (name) VALUES ($1)
          ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
          RETURNING id
        `, [tagName]);

        const tagId = tagResult.rows[0].id;

        // Link tag to transaction
        await client.query(
          'INSERT INTO transaction_tags (transaction_id, tag_id) VALUES ($1, $2)',
          [transaction.id, tagId]
        );
      }
    }

    await client.query('COMMIT');

    // Return in frontend format
    const formattedTransaction = await getFormattedTransaction(transaction.id);

    res.status(201).json(formattedTransaction);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating transaction:', error);
    if (error.code === '23503') { // Foreign key violation
      res.status(400).json({ message: 'Invalid category or account reference' });
    } else if (error.code === '23505') { // Unique violation
      res.status(400).json({ message: 'Transaction already exists' });
    } else {
      res.status(500).json({ message: 'Failed to create transaction' });
    }
  } finally {
    client.release();
  }
});

// PUT /api/transactions/:id
router.put('/transactions/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { merchant, amount, type, category, tags, notes, paymentMethod, date } = req.body;

    // Input validation for provided fields
    if (type && type !== 'expense' && type !== 'income') {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        message: 'Invalid type. Must be "expense" or "income"' 
      });
    }

    if (amount !== undefined && (isNaN(amount) || parseFloat(amount) < 0)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        message: 'Amount must be a positive number' 
      });
    }

    // Parse date if provided
    let transaction_date, transaction_time;
    if (date) {
      const transactionDate = new Date(date);
      if (isNaN(transactionDate.getTime())) {
        await client.query('ROLLBACK');
        return res.status(400).json({ 
          message: 'Invalid date format' 
        });
      }
      transaction_date = transactionDate.toISOString().split('T')[0];
      transaction_time = transactionDate.toTimeString().split(' ')[0];
    }

    // Build dynamic update query
    const updateFields = [];
    const updateValues = [];
    let paramIndex = 1;

    if (merchant !== undefined) {
      updateFields.push(`merchant_name = $${paramIndex}`);
      updateValues.push(merchant);
      paramIndex++;
    }
    if (amount !== undefined) {
      updateFields.push(`amount = $${paramIndex}`);
      updateValues.push(amount);
      paramIndex++;
    }
    if (type !== undefined) {
      updateFields.push(`type = $${paramIndex}`);
      updateValues.push(type);
      paramIndex++;
    }
    if (category !== undefined) {
      updateFields.push(`category_id = $${paramIndex}`);
      updateValues.push(category);
      paramIndex++;
    }
    if (paymentMethod !== undefined) {
      // Get account ID if paymentMethod is provided
      let account_id = null;
      if (paymentMethod) {
        const accountResult = await client.query('SELECT id FROM accounts WHERE name = $1', [paymentMethod]);
        if (accountResult.rows.length > 0) {
          account_id = accountResult.rows[0].id;
        } else {
          // Create account if not exists
          const newAccount = await client.query(
            'INSERT INTO accounts (name, type) VALUES ($1, $2) RETURNING id',
            [paymentMethod, 'other']
          );
          account_id = newAccount.rows[0].id;
        }
      }
      updateFields.push(`account_id = $${paramIndex}`);
      updateValues.push(account_id);
      paramIndex++;
    }
    if (date !== undefined) {
      updateFields.push(`transaction_date = $${paramIndex}`);
      updateValues.push(transaction_date);
      paramIndex++;
      updateFields.push(`transaction_time = $${paramIndex}`);
      updateValues.push(transaction_time);
      paramIndex++;
    }
    if (notes !== undefined) {
      updateFields.push(`notes = $${paramIndex}`);
      updateValues.push(notes);
      paramIndex++;
    }

    if (updateFields.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'No fields to update' });
    }

    updateFields.push(`updated_at = NOW()`);
    updateValues.push(req.params.id);

    // Update transaction
    const transactionResult = await client.query(`
      UPDATE transactions SET
        ${updateFields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `, updateValues);

    if (transactionResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Transaction not found' });
    }

    const transaction = transactionResult.rows[0];

    // Delete existing tags
    await client.query('DELETE FROM transaction_tags WHERE transaction_id = $1', [transaction.id]);

    // Handle new tags
    if (tags && tags.length > 0) {
      for (const tagName of tags) {
        // Upsert tag
        const tagResult = await client.query(`
          INSERT INTO tags (name) VALUES ($1)
          ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
          RETURNING id
        `, [tagName]);

        const tagId = tagResult.rows[0].id;

        // Link tag to transaction
        await client.query(
          'INSERT INTO transaction_tags (transaction_id, tag_id) VALUES ($1, $2)',
          [transaction.id, tagId]
        );
      }
    }

    await client.query('COMMIT');

    // Return in frontend format
    const formattedTransaction = await getFormattedTransaction(transaction.id);

    res.json(formattedTransaction);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error updating transaction:', error);
    if (error.code === '23503') { // Foreign key violation
      res.status(400).json({ message: 'Invalid category or account reference' });
    } else {
      res.status(500).json({ message: 'Failed to update transaction' });
    }
  } finally {
    client.release();
  }
});

// DELETE /api/transactions/:id
router.delete('/transactions/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM transactions WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Transaction not found' });
    }
    res.status(204).send();
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Failed to delete transaction' });
  }
});

// GET /api/transactions/stats
router.get('/transactions/stats', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    // Total spent/income
    const totalsQuery = `
      SELECT type, SUM(amount) as total
      FROM transactions
      WHERE ($1::date IS NULL OR transaction_date >= $1)
        AND ($2::date IS NULL OR transaction_date <= $2)
      GROUP BY type
    `;
    const totalsResult = await pool.query(totalsQuery, [startDate, endDate]);

    const stats = {
      totalSpent: 0,
      totalIncome: 0,
      categoryBreakdown: {},
      merchantBreakdown: {},
    };

    totalsResult.rows.forEach(row => {
      if (row.type === 'expense') stats.totalSpent = parseFloat(row.total);
      if (row.type === 'income') stats.totalIncome = parseFloat(row.total);
    });

    // Category breakdown
    const categoryQuery = `
      SELECT category_id, SUM(amount) as total
      FROM transactions
      WHERE type = 'expense'
        AND ($1::date IS NULL OR transaction_date >= $1)
        AND ($2::date IS NULL OR transaction_date <= $2)
      GROUP BY category_id
    `;
    const categoryResult = await pool.query(categoryQuery, [startDate, endDate]);
    categoryResult.rows.forEach(row => {
      stats.categoryBreakdown[row.category_id] = parseFloat(row.total);
    });

    // Merchant breakdown
    const merchantQuery = `
      SELECT merchant_name, COUNT(*) as count, SUM(amount) as total
      FROM transactions
      WHERE type = 'expense'
        AND ($1::date IS NULL OR transaction_date >= $1)
        AND ($2::date IS NULL OR transaction_date <= $2)
      GROUP BY merchant_name
      ORDER BY total DESC
    `;
    const merchantResult = await pool.query(merchantQuery, [startDate, endDate]);
    merchantResult.rows.forEach(row => {
      stats.merchantBreakdown[row.merchant_name] = {
        count: parseInt(row.count),
        total: parseFloat(row.total),
      };
    });

    res.json(stats);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Failed to fetch stats' });
  }
});

module.exports = router;