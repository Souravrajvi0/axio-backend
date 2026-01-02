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
      t.merchant_name,
      t.amount,
      t.type,
      t.category_id,
      c.icon as categoryIcon,
      t.transaction_date,
      COALESCE(t.transaction_time, '00:00:00') as transaction_time,
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
      t.merchant_name,
      t.amount,
      t.type,
      t.category_id,
      c.icon as categoryIcon,
      t.transaction_date,
      COALESCE(t.transaction_time, '00:00:00') as transaction_time,
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
  console.log('GET /api/transactions - Fetching transactions');
  console.log('Query params:', req.query);
  try {
    if (!pool) {
      console.error('GET /api/transactions - Database not configured');
      return res.status(503).json({ 
        message: 'Database not configured. Please set DATABASE_URL environment variable.' 
      });
    }
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
    console.log('Applied filters:', filters);

    const { query, params } = await buildTransactionQuery(filters);
    console.log('Executing query:', query);
    console.log('Query params:', params);
    const result = await pool.query(query, params);
    console.log(`GET /api/transactions - Found ${result.rows.length} transactions`);

    res.json(result.rows);
  } catch (error) {
    console.error('GET /api/transactions - Database error:', error);
    res.status(500).json({ 
      message: 'Failed to fetch transactions',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
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
  console.log('POST /api/transactions - Creating transaction');
  console.log('Request body:', req.body);
  const client = await pool.connect();
  console.log('POST /api/transactions - Database client connected');
  try {
    await client.query('BEGIN');
    console.log('POST /api/transactions - Transaction begun');

    const { merchant_name, amount, type, category, category_id, tags, notes, paymentMethod, transaction_date, transaction_time } = req.body;
    const categoryValue = category || category_id;

    // Input validation
    if (!merchant_name || !amount || !type || !categoryValue || !transaction_date) {
      console.log('POST /api/transactions - Validation failed:', { merchant_name, amount, type, category: categoryValue, transaction_date });
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        message: 'Missing required fields',
        errors: {
          merchant_name: !merchant_name ? ['Merchant is required'] : undefined,
          amount: !amount ? ['Amount is required'] : undefined,
          type: !type ? ['Type is required'] : undefined,
          category: !categoryValue ? ['Category is required'] : undefined,
          transaction_date: !transaction_date ? ['Date is required'] : undefined,
        }
      });
    }

    if (type !== 'expense' && type !== 'income') {
      console.log('POST /api/transactions - Invalid type:', type);
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        message: 'Invalid type. Must be "expense" or "income"' 
      });
    }

    if (isNaN(amount) || parseFloat(amount) < 0) {
      console.log('POST /api/transactions - Invalid amount:', amount);
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        message: 'Amount must be a positive number' 
      });
    }

    // Resolve category to category_id
    let resolvedCategoryId;
    console.log('POST /api/transactions - Resolving category:', categoryValue);
    if (categoryValue.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      // It's a UUID
      resolvedCategoryId = categoryValue;
      console.log('POST /api/transactions - Category is UUID:', resolvedCategoryId);
    } else {
      // Look up by name
      const categoryResult = await client.query('SELECT id FROM categories WHERE LOWER(name) = LOWER($1)', [categoryValue]);
      if (categoryResult.rows.length === 0) {
        console.log('POST /api/transactions - Category not found by name:', categoryValue);
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Invalid category' });
      }
      resolvedCategoryId = categoryResult.rows[0].id;
      console.log('POST /api/transactions - Category resolved to UUID:', resolvedCategoryId);
    }

    // Parse date
    const transaction_date_str = transaction_date;
    const transaction_time_str = transaction_time || '00:00:00';
    console.log('POST /api/transactions - Parsed dates:', { transaction_date_str, transaction_time_str });

    // Get account ID
    let account_id = null;
    if (paymentMethod) {
      console.log('POST /api/transactions - Looking up account for paymentMethod:', paymentMethod);
      const accountResult = await client.query('SELECT id FROM accounts WHERE name = $1', [paymentMethod]);
      if (accountResult.rows.length > 0) {
        account_id = accountResult.rows[0].id;
        console.log('POST /api/transactions - Found existing account:', account_id);
      } else {
        console.log('POST /api/transactions - Creating new account for:', paymentMethod);
        // Create account if not exists
        const newAccount = await client.query(
          'INSERT INTO accounts (name, type) VALUES ($1, $2) RETURNING id',
          [paymentMethod, 'other']
        );
        account_id = newAccount.rows[0].id;
        console.log('POST /api/transactions - Created new account:', account_id);
      }
    }

    // Insert transaction
    console.log('POST /api/transactions - Inserting transaction with params:', [merchant_name, amount, type, resolvedCategoryId, account_id, transaction_date_str, transaction_time_str, notes]);
    const transactionResult = await client.query(`
      INSERT INTO transactions (
        merchant_name, amount, type, category_id, account_id,
        transaction_date, transaction_time, notes, source
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'manual')
      RETURNING *
    `, [merchant_name, amount, type, resolvedCategoryId, account_id, transaction_date_str, transaction_time_str, notes]);

    const transaction = transactionResult.rows[0];
    console.log('POST /api/transactions - Transaction inserted:', transaction.id);

    // Handle tags
    if (Array.isArray(tags) && tags.length > 0) {
      console.log('POST /api/transactions - Processing tags:', tags);
      for (const tagName of tags) {
        if (typeof tagName === 'string' && tagName.trim()) {
          console.log('POST /api/transactions - Upserting tag:', tagName.trim());
          // Upsert tag
          const tagResult = await client.query(`
            INSERT INTO tags (name) VALUES ($1)
            ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
            RETURNING id
          `, [tagName.trim()]);

          const tagId = tagResult.rows[0].id;
          console.log('POST /api/transactions - Tag ID:', tagId);

          // Link tag to transaction
          await client.query(
            'INSERT INTO transaction_tags (transaction_id, tag_id) VALUES ($1, $2)',
            [transaction.id, tagId]
          );
          console.log('POST /api/transactions - Linked tag to transaction');
        }
      }
    } else {
      console.log('POST /api/transactions - No tags to process');
    }

    await client.query('COMMIT');
    console.log('POST /api/transactions - Transaction committed');

    // Return in frontend format
    const formattedTransaction = await getFormattedTransaction(transaction.id);
    console.log('POST /api/transactions - Returning formatted transaction');

    res.status(201).json(formattedTransaction);
  } catch (error) {
    console.error('POST /api/transactions - Error creating transaction:', error);
    await client.query('ROLLBACK');
    console.log('POST /api/transactions - Transaction rolled back');
    if (error.code === '23503') { // Foreign key violation
      console.error('POST /api/transactions - Foreign key violation:', error.detail);
      res.status(400).json({ message: 'Invalid category or account reference' });
    } else if (error.code === '23505') { // Unique violation
      console.error('POST /api/transactions - Unique violation:', error.detail);
      res.status(400).json({ message: 'Transaction already exists' });
    } else {
      console.error('POST /api/transactions - Unexpected error:', error);
      res.status(500).json({ message: 'Failed to create transaction' });
    }
  } finally {
    client.release();
    console.log('POST /api/transactions - Database client released');
  }
});

// PUT /api/transactions/:id
router.put('/transactions/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { merchant_name, amount, type, category, category_id, tags, notes, paymentMethod, transaction_date, transaction_time } = req.body;
    const categoryValue = category || category_id;

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
    let transaction_date_str, transaction_time_str;
    if (transaction_date) {
      transaction_date_str = transaction_date;
      transaction_time_str = transaction_time || '00:00:00';
    }

    // Build dynamic update query
    const updateFields = [];
    const updateValues = [];
    let paramIndex = 1;

    if (merchant_name !== undefined) {
      updateFields.push(`merchant_name = $${paramIndex}`);
      updateValues.push(merchant_name);
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
    if (categoryValue !== undefined) {
      // Resolve category to category_id
      let resolved_category_id;
      if (categoryValue.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
        // It's a UUID
        resolved_category_id = categoryValue;
      } else {
        // Look up by name
        const categoryResult = await client.query('SELECT id FROM categories WHERE LOWER(name) = LOWER($1)', [categoryValue]);
        if (categoryResult.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({ message: 'Invalid category' });
        }
        resolved_category_id = categoryResult.rows[0].id;
      }
      updateFields.push(`category_id = $${paramIndex}`);
      updateValues.push(resolved_category_id);
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
    if (transaction_date !== undefined) {
      updateFields.push(`transaction_date = $${paramIndex}`);
      updateValues.push(transaction_date_str);
      paramIndex++;
      updateFields.push(`transaction_time = $${paramIndex}`);
      updateValues.push(transaction_time_str);
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
    if (Array.isArray(tags) && tags.length > 0) {
      for (const tagName of tags) {
        if (typeof tagName === 'string' && tagName.trim()) {
          // Upsert tag
          const tagResult = await client.query(`
            INSERT INTO tags (name) VALUES ($1)
            ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
            RETURNING id
          `, [tagName.trim()]);

          const tagId = tagResult.rows[0].id;

          // Link tag to transaction
          await client.query(
            'INSERT INTO transaction_tags (transaction_id, tag_id) VALUES ($1, $2)',
            [transaction.id, tagId]
          );
        }
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