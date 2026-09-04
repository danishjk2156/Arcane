const knex = require('knex');
const knexConfig = require('./knexfile');

const db = knex(knexConfig);

// Verify connectivity on startup
db.raw('SELECT 1')
  .then(() => console.log('[DB] PostgreSQL connected'))
  .catch((err) => {
    console.error('[DB] PostgreSQL connection failed:', err.message);
    process.exit(1);
  });

module.exports = db;
