const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

module.exports = {
  port: parseInt(process.env.PORT, 10) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',

  db: {
    connectionString:
      process.env.DATABASE_URL ||
      'postgresql://postgres:danish%402005@localhost:5432/arcane_db',
  },

  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },

  // Piston public API — no config needed (https://emkc.org/api/v2/piston)
  // If you self-host Piston later, add PISTON_URL here

  jwt: {
    secret: process.env.JWT_SECRET || 'change-this-to-a-real-secret',
    expiry: process.env.JWT_EXPIRY || '24h',
  },

  rateLimit: {
    submitWindowMs: parseInt(process.env.SUBMIT_RATE_LIMIT_WINDOW_MS, 10) || 3000,
    submitMax: parseInt(process.env.SUBMIT_RATE_LIMIT_MAX, 10) || 1,
  },

  staleJudging: {
    timeoutSeconds: parseInt(process.env.STALE_JUDGING_TIMEOUT_S, 10) || 60,
  },

  poolExhaustion: {
    allowRepeat: process.env.ALLOW_REPEAT_PROBLEM_IN_TYPE === 'true',
  },
};
