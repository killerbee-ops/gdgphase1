// Automated Supabase PostgreSQL Migration Script
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Load environment variables manually
require('dotenv').config();

const dbPassword = process.env.SUPABASE_DB_PASSWORD;
const projectRef = 'slamgtcsellhkyhbuyxz'; // extracted from Supabase URL/keys

if (!dbPassword) {
  console.error("\n❌ Error: SUPABASE_DB_PASSWORD is missing in your .env file!");
  console.error("Please add the following line to your .env file:");
  console.error("SUPABASE_DB_PASSWORD=your_supabase_database_password\n");
  process.exit(1);
}

const connectionString = `postgres://postgres.${projectRef}:${encodeURIComponent(dbPassword)}@aws-0-ap-south-1.pooler.supabase.com:5432/postgres`;

console.log("Checking for 'pg' library dependency...");
try {
  require.resolve('pg');
} catch (e) {
  console.log("'pg' library not found. Installing now (please wait)...");
  execSync('npm install pg', { stdio: 'inherit' });
}

const { Client } = require('pg');

async function runMigration() {
  console.log("Connecting to Supabase PostgreSQL database...");
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false } // Required for Supabase ssl connections
  });

  try {
    await client.connect();
    console.log("Successfully connected. Reading schema.sql...");
    
    const schemaPath = path.resolve(__dirname, '../schema.sql');
    const sql = fs.readFileSync(schemaPath, 'utf8');

    console.log("Executing database schema queries (creating tables and indexes)...");
    await client.query(sql);

    console.log("\n🎉 Database migration complete! All tables and indexes successfully created on Supabase.");
  } catch (err) {
    console.error("\n❌ Migration failed:", err);
    if (err.message && err.message.includes('password authentication failed')) {
      console.error("👉 Double check your SUPABASE_DB_PASSWORD is correct.");
    }
  } finally {
    await client.end();
  }
}

runMigration();
