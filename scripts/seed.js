require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function seedDatabase() {
  try {
    console.log('🌱 Starting database seed...');
    
    // Read and execute schema
    const schemaPath = path.join(__dirname, '../db/schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    
    console.log('📝 Executing schema...');
    await pool.query(schema);
    
    console.log('✅ Database seeded successfully!');
    console.log('\n📊 Seeded data:');
    console.log('  - Categories: 19 categories');
    console.log('  - Accounts: 3 accounts');
    console.log('  - Tags: 6 tags');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding database:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seedDatabase();

