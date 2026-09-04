const path = require('path');
const config = require('../config');

module.exports = {
  client: 'pg',
  connection: config.db.connectionString,
  pool: {
    min: 2,
    max: 20,
    // Prevent leaked connections from holding locks indefinitely
    idleTimeoutMillis: 30000,
    reapIntervalMillis: 1000,
  },
  migrations: {
    directory: path.join(__dirname, 'migrations'),
  },
  seeds: {
    directory: path.join(__dirname, 'seeds'),
  },
};
