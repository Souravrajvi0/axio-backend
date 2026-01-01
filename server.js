require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// Database connection
let pool;
try {
  if (process.env.DATABASE_URL) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      // Add connection timeout for serverless
      connectionTimeoutMillis: 5000,
      query_timeout: 10000,
    });
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
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
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