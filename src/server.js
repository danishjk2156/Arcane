/**
 * Server Entry Point
 *
 * Wires up Express, Socket.io for live leaderboard, and the stale judging recovery cron.
 */

const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server: SocketIO } = require('socket.io');

const config = require('./config');
const { startStaleJudgingRecovery } = require('./services/staleRecovery');

// Routes
const authRoutes = require('./routes/auth');
const sessionRoutes = require('./routes/session');
const leaderboardRoutes = require('./routes/leaderboard');
const adminRoutes = require('./routes/admin');

// Judge service — for language list endpoint
const judgeService = require('./services/judgeService');

const app = express();
const server = http.createServer(app);

// ─── Socket.io for live leaderboard ──────────────────────
const io = new SocketIO(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

// Make io available to services that emit leaderboard updates
app.set('io', io);

io.on('connection', (socket) => {
  console.log(`[WS] Client connected: ${socket.id}`);
  socket.on('disconnect', () => {
    console.log(`[WS] Client disconnected: ${socket.id}`);
  });
});

// ─── Middleware ───────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Request logging (dev)
if (config.nodeEnv === 'development') {
  app.use((req, res, next) => {
    console.log(`[${req.method}] ${req.path}`);
    next();
  });
}

// ─── Routes ──────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/session', sessionRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/admin', adminRoutes);

// Languages endpoint (public)
app.get('/api/languages', (req, res) => {
  res.json({ languages: judgeService.getSupportedLanguages() });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Error Handler ───────────────────────────────────────
// Centralized error handling — all errors flow here via next(err)
app.use((err, req, res, _next) => {
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal server error';

  if (statusCode >= 500) {
    console.error(`[ERROR] ${req.method} ${req.path}:`, err);
  }

  res.status(statusCode).json({
    error: message,
    ...(config.nodeEnv === 'development' && { stack: err.stack }),
  });
});

// ─── Start ───────────────────────────────────────────────
server.listen(config.port, () => {
  console.log(`\n🏛️  Arcane server running on port ${config.port}`);
  console.log(`   Environment: ${config.nodeEnv}`);
  console.log(`   Judge:       Piston public API (emkc.org)`);

  // Start stale judging recovery cron
  startStaleJudgingRecovery();
});

module.exports = { app, server, io };
