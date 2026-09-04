const { Client } = require('pg');

async function init() {
  // Connect to default 'postgres' database first to create 'arcane_db'
  const client = new Client({
    connectionString: 'postgresql://postgres:danish%402005@localhost:5432/postgres',
  });

  try {
    await client.connect();
    console.log('[Init] Connected to local PostgreSQL.');

    // Check if database exists
    const res = await client.query("SELECT 1 FROM pg_database WHERE datname = 'arcane_db'");
    if (res.rowCount === 0) {
      console.log("[Init] Database 'arcane_db' does not exist. Creating...");
      await client.query('CREATE DATABASE arcane_db');
      console.log("[Init] Database 'arcane_db' created successfully!");
    } else {
      console.log("[Init] Database 'arcane_db' already exists.");
    }
  } catch (err) {
    console.error('[Init] Error creating database:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

init();
