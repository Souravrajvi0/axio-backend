const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Get pool from server.js or create new one
let pool;
if (global.dbPool) {
  pool = global.dbPool;
} else {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });
}

// POST /api/seed - Seed database with initial data
router.post('/seed', async (req, res) => {
  try {
    if (!pool) {
      return res.status(503).json({ 
        message: 'Database not configured. Please set DATABASE_URL environment variable.' 
      });
    }

    console.log('🌱 Starting database seed...');
    
    // Read and execute schema
    const schemaPath = path.join(__dirname, '../db/schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    
    console.log('📝 Executing schema...');
    await pool.query(schema);
    
    console.log('✅ Database seeded successfully!');
    
    res.json({ 
      success: true,
      message: 'Database seeded successfully',
      data: {
        categories: 19,
        accounts: 3,
        tags: 6
      }
    });
  } catch (error) {
    console.error('❌ Error seeding database:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to seed database',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;

