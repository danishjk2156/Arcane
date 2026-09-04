/**
 * Leaderboard Route — Level-based ranking
 */

const express = require('express');
const leaderboardService = require('../services/leaderboardService');
const { leaderboardEntryToClient } = require('../dto');

const router = express.Router();

/**
 * GET /api/leaderboard
 * Public endpoint — no auth required.
 * Returns participants ranked by (levels_completed DESC, total_time ASC).
 */
router.get('/', async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const entries = await leaderboardService.getLeaderboard(limit);

    res.json({
      leaderboard: entries.map(leaderboardEntryToClient),
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
