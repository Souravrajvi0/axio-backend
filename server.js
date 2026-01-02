require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// Database connection - shared pool for all routes
let pool;
try {
  if (process.env.DATABASE_URL) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      // Add connection timeout for serverless
      connectionTimeoutMillis: 5000,
      query_timeout: 10000,
    });
    // Make pool globally available for route files
    global.dbPool = pool;
  } else {
    console.warn('DATABASE_URL not set - database operations will fail');
  }
} catch (error) {
  console.error('Failed to create database pool:', error);
}

// Middleware
app.use(helmet());
app.use(morgan('combined'));
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
}));
app.use(express.json());

// Routes
app.use('/api', require('./routes/transactions'));
app.use('/api', require('./routes/categories'));
app.use('/api', require('./routes/accounts'));
app.use('/api', require('./routes/tags'));

// Health check
app.get('/health', async (req, res) => {
  try {
    if (pool) {
      // Test database connection
      await pool.query('SELECT 1');
      res.json({ 
        status: 'OK', 
        database: 'connected',
        timestamp: new Date().toISOString() 
      });
    } else {
      res.status(503).json({ 
        status: 'ERROR', 
        database: 'not configured',
        timestamp: new Date().toISOString() 
      });
    }
  } catch (error) {
    res.status(503).json({ 
      status: 'ERROR', 
      database: 'connection failed',
      timestamp: new Date().toISOString() 
    });
  }
});

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Something went wrong!' });
});

// Export for Vercel serverless
module.exports = app;

// Start server locally
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}