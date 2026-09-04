/**
 * DTO Layer — Architecture Fix: is_correct Leaking to Client
 *
 * This module is the ONLY way hint options should be serialized for API responses.
 * It strips `is_correct` from all hint option objects so that clients can never
 * inspect network responses to determine which hint is genuine.
 *
 * Usage:
 *   const { hintOptionToClient, servedProblemToClient } = require('../dto');
 *   res.json({ hints: hintOptions.map(hintOptionToClient) });
 */

/**
 * Strips is_correct from a hint option row. Only exposes: id, text, eliminated.
 * @param {Object} option - Raw hint_options row from DB
 * @returns {Object} Client-safe hint option
 */
function hintOptionToClient(option) {
  if (!option) return null;
  return {
    id: option.id,
    hintEventId: option.hint_event_id,
    text: option.text,
    eliminated: option.eliminated,
    // is_correct is intentionally omitted — NEVER send to client
  };
}

/**
 * Formats a served_problem row for client consumption.
 * @param {Object} served - Raw served_problems row
 * @param {Object} problem - Raw problems row
 * @param {Array}  hintOptions - Raw hint_options rows (will be sanitized)
 * @returns {Object} Client-safe session state
 */
function servedProblemToClient(served, problem, hintOptions = []) {
  return {
    servedProblemId: served.id,
    problem: {
      id: problem.id,
      title: problem.title,
      description: problem.description,
      difficulty: problem.difficulty,
      starterCode: problem.starter_code,
      timeLimitMs: problem.time_limit_ms,
      memoryLimitMb: problem.memory_limit_mb,
      // test_cases: only show non-hidden cases
      testCases: (problem.test_cases || [])
        .filter((tc) => !tc.hidden)
        .map((tc) => ({ input: tc.input, expectedOutput: tc.expected_output })),
    },
    hints: hintOptions
      .filter((o) => !o.eliminated) // don't show eliminated hints
      .map(hintOptionToClient),
    selectedHintId: served.selected_hint_option_id,
    outcome: served.outcome,
  };
}

/**
 * Formats a participant for client consumption.
 * @param {Object} participant - Raw participants row
 * @returns {Object} Client-safe participant
 */
function participantToClient(participant) {
  if (!participant) return null;
  return {
    id: participant.id,
    displayName: participant.display_name,
    email: participant.email,
    status: participant.status,
    role: participant.role,
    createdAt: participant.created_at,
  };
}

/**
 * Formats leaderboard entry.
 * @param {Object} entry - Raw leaderboard query row
 * @returns {Object} Client-safe leaderboard entry
 */
function leaderboardEntryToClient(entry) {
  return {
    participantId: entry.id || entry.participant_id,
    displayName: entry.display_name,
    levelsCompleted: parseInt(entry.levels_completed, 10),
    currentLevel: entry.current_level,
    totalTime: entry.total_time,
  };
}

module.exports = {
  hintOptionToClient,
  servedProblemToClient,
  participantToClient,
  leaderboardEntryToClient,
};
