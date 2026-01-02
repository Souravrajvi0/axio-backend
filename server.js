require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { Pool } = require('pg');

console.log('Starting server...');

const app = express();
const PORT = process.env.PORT || 3000;

console.log(`Server port: ${PORT}`);

// Database connection - shared pool for all routes
let pool;
try {
  if (process.env.DATABASE_URL) {
    let connectionString = process.env.DATABASE_URL;
    
    // For Supabase with serverless (Vercel), use Connection Pooler (port 6543)
    // Direct connection (port 5432) can timeout with serverless functions
    // Connection pooler is recommended: aws-0-REGION.pooler.supabase.com:6543
    
    pool = new Pool({
      connectionString: connectionString,
      // SSL configuration - Supabase supports both SSL and non-SSL
      // Since SSL enforcement is off, we can try without SSL first
      ssl: connectionString.includes('sslmode=require') ? {
        rejectUnauthorized: false
      } : false,
      // Connection settings optimized for serverless (Vercel)
      connectionTimeoutMillis: 10000,
      query_timeout: 30000,
      idleTimeoutMillis: 30000,
      max: 1, // Single connection for serverless functions
      allowExitOnIdle: true, // Allow process to exit when idle
    });
    // Make pool globally available for route files
    global.dbPool = pool;
    console.log('Database pool created successfully');
  } else {
    console.warn('DATABASE_URL not set - database operations will fail');
  }
} catch (error) {
  console.error('Failed to create database pool:', error);
}

// Middleware
console.log('Setting up middleware...');
app.use(helmet());
app.use(morgan('combined'));
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
}));
app.use(express.json());

// Root route - API information
app.get('/', (req, res) => {
  console.log('GET / - API info requested');
  res.json({
    name: 'SpendGuard Backend API',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      health: '/health',
      transactions: '/api/transactions',
      categories: '/api/categories',
      accounts: '/api/accounts',
      tags: '/api/tags',
    },
    documentation: 'See README.md for API details',
  });
});

// Routes
console.log('Loading routes...');
app.use('/api', require('./routes/transactions'));
app.use('/api', require('./routes/categories'));
app.use('/api', require('./routes/accounts'));
app.use('/api', require('./routes/tags'));
app.use('/api', require('./routes/seed'));

// Health check
app.get('/health', async (req, res) => {
  console.log('GET /health - Health check requested');
  try {
    const hasEnvVar = !!process.env.DATABASE_URL;
    const hasPool = !!pool;
    
    if (!hasEnvVar) {
      console.warn('Health check: DATABASE_URL not set');
      return res.status(503).json({ 
        status: 'ERROR', 
        database: 'not configured',
        message: 'DATABASE_URL environment variable is not set',
        timestamp: new Date().toISOString() 
      });
    }
    
    if (!hasPool) {
      console.warn('Health check: Pool not initialized');
      return res.status(503).json({ 
        status: 'ERROR', 
        database: 'pool not initialized',
        message: 'DATABASE_URL is set but pool creation failed',
        timestamp: new Date().toISOString() 
      });
    }
    
    // Test database connection
    console.log('Health check: Testing database connection...');
    await pool.query('SELECT 1');
    console.log('Health check: Database connection successful');
    res.json({ 
      status: 'OK', 
      database: 'connected',
      timestamp: new Date().toISOString() 
    });
  } catch (error) {
    console.error('Health check error:', error);
    const errorInfo = {
      status: 'ERROR', 
      database: 'connection failed',
      message: error.message,
      code: error.code,
      timestamp: new Date().toISOString()
    };
    
    // Add more details for debugging
    if (error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED') {
      errorInfo.hint = 'Check if database host and port are correct. For Supabase, try using connection pooler (port 6543) instead of direct connection (port 5432)';
    } else if (error.code === '28P01') {
      errorInfo.hint = 'Authentication failed. Check your database password. Make sure special characters are URL-encoded (@ = %40)';
    } else if (error.code === '3D000') {
      errorInfo.hint = 'Database does not exist. Check database name in connection string';
    }
    
    res.status(503).json(errorInfo);
  }
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Global error handler:', err.stack);
  res.status(500).json({ message: 'Something went wrong!' });
});

// Export for Vercel serverless
console.log('Exporting app for Vercel serverless');
module.exports = app;

// Start server locally
if (require.main === module) {
  console.log(`Starting server on port ${PORT}...`);
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}