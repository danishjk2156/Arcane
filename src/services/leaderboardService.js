/**
 * Leaderboard Service — Level-based ranking
 *
 * Ranking: (highest_level_reached DESC, total_time ASC)
 * WebSocket emits happen on level-up events only.
 */

const db = require('../db');

/**
 * Fetches the current leaderboard ranked by levels completed then time.
 *
 * @param {number} limit - Max entries to return
 * @returns {Array} Leaderboard entries
 */
async function getLeaderboard(limit = 50) {
  const entries = await db.raw(`
    SELECT
      p.id,
      p.display_name,
      COALESCE(stats.levels_completed, 0) AS levels_completed,
      stats.current_level,
      stats.total_time
    FROM participants p
    LEFT JOIN LATERAL (
      SELECT
        COUNT(DISTINCT pt.id) AS levels_completed,
        (
          SELECT pt2.name
          FROM served_problems sp2
          JOIN problems pr2 ON pr2.id = sp2.problem_id
          JOIN problem_types pt2 ON pt2.id = pr2.type_id
          WHERE sp2.participant_id = p.id
            AND sp2.outcome = 'correct'
          ORDER BY pt2.sequence_order DESC
          LIMIT 1
        ) AS current_level,
        (
          MAX(sub.submitted_at) FILTER (WHERE sub.verdict = 'accepted')
          - p.created_at
        ) AS total_time
      FROM served_problems sp
      JOIN problems pr ON pr.id = sp.problem_id
      JOIN problem_types pt ON pt.id = pr.type_id
      LEFT JOIN submissions sub ON sub.served_problem_id = sp.id
      WHERE sp.participant_id = p.id
        AND sp.outcome = 'correct'
    ) stats ON true
    WHERE p.status != 'disqualified'
      AND p.role = 'participant'
    ORDER BY
      levels_completed DESC,
      stats.total_time ASC NULLS LAST
    LIMIT ?
  `, [limit]);

  return entries.rows;
}

/**
 * Gets a single participant's rank and stats.
 *
 * @param {string} participantId
 * @returns {Object}
 */
async function getParticipantRank(participantId) {
  const leaderboard = await getLeaderboard(1000);
  const rank = leaderboard.findIndex((e) => e.id === participantId);

  if (rank === -1) {
    return { rank: null, stats: null };
  }

  return {
    rank: rank + 1,
    stats: leaderboard[rank],
  };
}

module.exports = {
  getLeaderboard,
  getParticipantRank,
};
