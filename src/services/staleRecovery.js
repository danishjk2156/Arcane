/**
 * Stale Judging Recovery Cron
 *
 * Architecture Fix: If Judge0 crashes mid-execution or the API process dies
 * after transitioning to 'judging', the served_problem gets stuck forever.
 *
 * This cron runs every 30 seconds and resets any served_problems that have
 * been in 'judging' state longer than STALE_JUDGING_TIMEOUT_S (default 60s)
 * back to 'pending', so the participant can retry.
 *
 * Uses the partial index idx_served_stale_judging for efficient lookups.
 */

const cron = require('node-cron');
const db = require('../db');
const config = require('../config');

function startStaleJudgingRecovery() {
  const timeoutSeconds = config.staleJudging.timeoutSeconds;

  // Run every 30 seconds
  cron.schedule('*/30 * * * * *', async () => {
    try {
      const cutoff = new Date(Date.now() - timeoutSeconds * 1000);

      const staleRows = await db('served_problems')
        .where('outcome', 'judging')
        .where('judging_started_at', '<', cutoff)
        .update({
          outcome: 'pending',
          judging_started_at: null,
        })
        .returning(['id', 'participant_id']);

      if (staleRows.length > 0) {
        console.warn(
          `[StaleRecovery] Reset ${staleRows.length} stale judging entries:`,
          staleRows.map((r) => `served_problem=${r.id} participant=${r.participant_id}`)
        );
      }
    } catch (err) {
      if (err.message && err.message.includes('does not exist')) {
        // Table served_problems doesn't exist yet before migrations run
        return;
      }
      console.error('[StaleRecovery] Error:', err.message);
    }
  });

  console.log(
    `[StaleRecovery] Cron started — recovering entries stuck >` +
    `${timeoutSeconds}s in 'judging' state`
  );
}

module.exports = { startStaleJudgingRecovery };
