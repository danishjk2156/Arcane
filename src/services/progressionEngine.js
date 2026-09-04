/**
 * Progression Engine — The FSM Core
 *
 * Architecture fixes implemented here:
 *   1. TWO-PHASE TRANSACTION SPLIT: judgeService.run() is called OUTSIDE DB
 *      transactions. Locks are held for <10ms, not seconds.
 *   2. 'JUDGING' INTERMEDIATE STATE: prevents double-submission from multiple
 *      tabs. Transition: pending → judging → correct|wrong.
 *   3. IDEMPOTENCY: client_request_id checked before processing. Duplicate
 *      requests return cached results.
 *   4. GROWING HINT SETS: hint_count = stage_number (capped at available decoys).
 *   5. POOL EXHAUSTION FALLBACK: allows repeats when the problem pool is exhausted.
 *
 * State machine transitions:
 *   ┌─────────┐   submit    ┌──────────┐  judge   ┌─────────┐
 *   │ pending ├────────────►│ judging  ├─────────►│ correct │ → advance
 *   └─────────┘             └────┬─────┘          └─────────┘
 *                                │ verdict
 *                                ▼
 *                           ┌─────────┐
 *                           │  wrong  │
 *                           └────┬────┘
 *                      ┌────────┴────────┐
 *                      ▼                 ▼
 *              decoy selected      correct hint selected
 *              → eliminate hint    → retry same problem
 *              → new problem       (reset to pending)
 *              (new served_problem)
 */

const db = require('../db');
const judgeService = require('./judgeService');
const config = require('../config');
const {
  BadRequestError,
  NotFoundError,
  ConflictError,
} = require('../errors');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUUID(str) {
  return typeof str === 'string' && UUID_REGEX.test(str);
}

// ═══════════════════════════════════════════════════════════
// HINT SELECTION — records intent before submission
// ═══════════════════════════════════════════════════════════

/**
 * Records which hint card the participant selects.
 * This is intent-only — no side effects until submission verdict.
 *
 * @param {string} participantId - UUID
 * @param {number} servedProblemId
 * @param {number} hintOptionId
 */
async function selectHint(participantId, servedProblemId, hintOptionId) {
  return db.transaction(async (trx) => {
    const served = await trx('served_problems')
      .where({ id: servedProblemId, participant_id: participantId })
      .forUpdate()
      .first();

    if (!served || served.outcome !== 'pending') {
      throw new ConflictError('No active attempt for this problem');
    }

    // Validate the hint option belongs to this problem's hint event and isn't eliminated
    if (served.hint_event_id) {
      const option = await trx('hint_options')
        .where({
          id: hintOptionId,
          hint_event_id: served.hint_event_id,
          eliminated: false,
        })
        .first();

      if (!option) {
        throw new BadRequestError('Invalid or eliminated hint option');
      }
    }

    await trx('served_problems')
      .where({ id: servedProblemId })
      .update({ selected_hint_option_id: hintOptionId });

    return { success: true };
  });
}

// ═══════════════════════════════════════════════════════════
// SUBMISSION — Three-phase flow
// ═══════════════════════════════════════════════════════════

/**
 * Phase 1: Validate and lock (< 5ms transaction)
 *
 * FIX: Transitions pending → judging inside a short transaction,
 * then releases the lock immediately. Judge0 runs in Phase 2
 * with NO lock held.
 *
 * @param {string} participantId
 * @param {number} servedProblemId
 * @param {string} clientRequestId - UUID for idempotency
 * @returns {Object} { cached, served?, result? }
 */
async function beginSubmission(participantId, servedProblemId, clientRequestId) {
  // FIX: Idempotency check — no transaction needed (only if valid UUID)
  const sanitizedRequestId = isValidUUID(clientRequestId) ? clientRequestId : null;
  if (sanitizedRequestId) {
    const existing = await db('submissions')
      .where({ client_request_id: sanitizedRequestId })
      .first();

    if (existing) {
      return { cached: true, result: existing };
    }
  }

  return db.transaction(async (trx) => {
    const served = await trx('served_problems')
      .where({ id: servedProblemId, participant_id: participantId })
      .forUpdate()
      .first();

    if (!served) {
      throw new NotFoundError('No such problem attempt');
    }
    // FIX: Reject if already being judged (prevents double-submit from multiple tabs)
    if (served.outcome === 'judging') {
      throw new ConflictError('Submission is already being judged');
    }
    if (served.outcome !== 'pending') {
      throw new ConflictError('Problem already resolved');
    }

    // FIX: Transition to 'judging' — releases lock after this short tx commits
    await trx('served_problems')
      .where({ id: servedProblemId })
      .update({
        outcome: 'judging',
        judging_started_at: new Date(),
      });

    // Fetch the problem for judge service
    const problem = await trx('problems')
      .where({ id: served.problem_id })
      .first();

    return { cached: false, served, problem };
  });
}

/**
 * Phase 2: Execute judgment (NO transaction — unbounded latency is OK here)
 *
 * FIX: This runs outside any DB lock. Even if Judge0 takes 10 seconds,
 * no served_problems rows are locked during this time.
 *
 * @param {string} code
 * @param {string} language
 * @param {Object} problem - Problem row from DB
 * @returns {Object} Judge verdict
 */
async function executeJudgment(code, language, problem) {
  return judgeService.runBatch(code, language, problem);
}

/**
 * Phase 3: Apply verdict (< 10ms transaction)
 *
 * Re-acquires the lock, verifies state is still 'judging' (guards against
 * concurrent state changes), writes submission, and performs FSM transition.
 *
 * @param {string} participantId
 * @param {number} servedProblemId
 * @param {Object} verdict - From Phase 2
 * @param {string} code
 * @param {string} language
 * @param {string} clientRequestId
 * @returns {Object} FSM transition result
 */
async function applyVerdict(participantId, servedProblemId, verdict, code, language, clientRequestId) {
  return db.transaction(async (trx) => {
    // Re-acquire lock and verify state
    const served = await trx('served_problems')
      .where({
        id: servedProblemId,
        participant_id: participantId,
        outcome: 'judging',
      })
      .forUpdate()
      .first();

    if (!served) {
      throw new ConflictError('State changed during judging — possibly recovered by cron');
    }

    // Write submission (with idempotency key if valid UUID)
    const sanitizedRequestId = isValidUUID(clientRequestId) ? clientRequestId : null;
    await trx('submissions').insert({
      served_problem_id: servedProblemId,
      client_request_id: sanitizedRequestId,
      code,
      language,
      verdict: verdict.status,
      runtime_ms: verdict.runtimeMs,
    });

    // ─── Branch: CORRECT ──────────────────────────────────
    if (verdict.status === 'accepted') {
      await trx('served_problems')
        .where({ id: servedProblemId })
        .update({ outcome: 'correct' });

      // Mark hint event as resolved
      if (served.hint_event_id) {
        await trx('hint_events')
          .where({ id: served.hint_event_id })
          .update({ resolved: true });
      }

      // Advance to next type
      const currentType = await getTypeOfProblem(trx, served.problem_id);
      const next = await advanceToNextType(trx, participantId, currentType.id);

      return { result: 'correct', ...next };
    }

    // ─── Branch: WRONG ────────────────────────────────────
    await trx('served_problems')
      .where({ id: servedProblemId })
      .update({ outcome: 'wrong' });

    // Check which hint was selected
    const selectedOption = served.selected_hint_option_id
      ? await trx('hint_options')
          .where({ id: served.selected_hint_option_id })
          .first()
      : null;

    // ─── Branch: WRONG + DECOY SELECTED → eliminate + loop ─
    if (selectedOption && !selectedOption.is_correct) {
      // Eliminate the decoy
      await trx('hint_options')
        .where({ id: selectedOption.id })
        .update({ eliminated: true });

      // Pick a NEW problem of the same type (never the same problem again)
      const currentType = await getTypeOfProblem(trx, served.problem_id);
      const nextProblem = await pickProblemOfType(
        trx,
        participantId,
        currentType.id,
        { excludeIds: [served.problem_id] }
      );

      // Create new served_problem, reusing the same hint_event
      // (with the decoy now eliminated)
      const [newServed] = await trx('served_problems')
        .insert({
          participant_id: participantId,
          problem_id: nextProblem.id,
          hint_event_id: served.hint_event_id,
          outcome: 'pending',
        })
        .returning('*');

      await trx('participants')
        .where({ id: participantId })
        .update({ current_problem_id: nextProblem.id });

      // Fetch remaining (non-eliminated) hint options for the response
      const remainingHints = await trx('hint_options')
        .where({ hint_event_id: served.hint_event_id, eliminated: false })
        .select('*');

      return {
        result: 'wrong_looped',
        problem: nextProblem,
        served: newServed,
        hints: remainingHints,
        eliminatedHintId: selectedOption.id,
      };
    }

    // ─── Branch: WRONG + CORRECT HINT (or no hint) → plain retry ─
    // Reset to pending so they can submit again for the same problem
    await trx('served_problems')
      .where({ id: servedProblemId })
      .update({ outcome: 'pending', judging_started_at: null });

    return {
      result: 'wrong_retry',
      servedProblemId,
      verdict: verdict.status,
      failedTestCase: verdict.failedTestCase,
      totalTestCases: verdict.totalTestCases,
      stderr: verdict.stderr,
      compileOutput: verdict.compileOutput,
    };
  });
}

/**
 * Full submission orchestrator — wires the three phases together.
 * This is what the route handler calls.
 *
 * @param {string} participantId
 * @param {number} servedProblemId
 * @param {string} code
 * @param {string} language
 * @param {string} clientRequestId
 * @returns {Object} FSM result
 */
async function submitAttempt(participantId, servedProblemId, code, language, clientRequestId) {
  // Phase 1: Validate + lock + transition to 'judging' (short tx)
  const phase1 = await beginSubmission(participantId, servedProblemId, clientRequestId);

  if (phase1.cached) {
    return { result: 'cached', submission: phase1.result };
  }

  // Phase 2: Execute judgment (NO transaction, NO lock held)
  let verdict;
  try {
    verdict = await executeJudgment(code, language, phase1.problem);
  } catch (err) {
    // Judge failed — reset from 'judging' back to 'pending' so they can retry
    await db('served_problems')
      .where({ id: servedProblemId, outcome: 'judging' })
      .update({ outcome: 'pending', judging_started_at: null });

    throw err;
  }

  // Phase 3: Apply verdict + FSM transition (short tx)
  return applyVerdict(participantId, servedProblemId, verdict, code, language, clientRequestId);
}

// ═══════════════════════════════════════════════════════════
// ADVANCEMENT — Growing hint sets
// ═══════════════════════════════════════════════════════════

/**
 * Computes how many hint options to generate for a stage.
 *
 * Formula:
 *   - Problem 1 (Stage 1): 0 hints (cold solve)
 *   - Problem 2 (Stage 2): 1 hint (1 correct hint, 0 decoys)
 *   - Problem 3 (Stage 3): 2 hints (1 correct hint, 1 decoy)
 *   - Every problem solved: +1 hint (Stage N = N - 1 hints)
 *   - In every problem: exactly 1 hint is genuinely correct.
 *
 * @param {Object} problemType - Row from problem_types
 * @returns {number} Total hint options (1 correct + N-1 decoys)
 */
function getHintCount(problemType) {
  const stageNumber = problemType.sequence_order;
  if (stageNumber <= 1) return 0;

  // DB override takes priority; otherwise hint_count = stage_number - 1
  return problemType.hints_per_stage ?? (stageNumber - 1);
}

/**
 * Advances participant to the next problem type and generates
 * a fresh hint set with growing size.
 *
 * @param {Object} trx - Knex transaction
 * @param {string} participantId
 * @param {number} currentTypeId
 * @returns {Object} { problem, served, hintEventId, stageNumber, typeName } or { result: 'finished' }
 */
async function advanceToNextType(trx, participantId, currentTypeId) {
  const nextType = await getNextType(trx, currentTypeId);

  if (!nextType) {
    // All types completed — participant finished
    await trx('participants')
      .where({ id: participantId })
      .update({ status: 'finished', current_problem_id: null });

    return { result: 'finished' };
  }

  const nextProblem = await pickProblemOfType(trx, participantId, nextType.id);

  // Create hint event
  const [hintEvent] = await trx('hint_events')
    .insert({
      participant_id: participantId,
      type_id: nextType.id,
    })
    .returning('*');

  // FIX: Growing hints — N = stage_number (capped at available decoys)
  const N = getHintCount(nextType);

  // Always insert the correct hint
  await trx('hint_options').insert({
    hint_event_id: hintEvent.id,
    text: nextProblem.hint_text,
    is_correct: true,
  });

  // Insert decoys (if N > 1)
  if (N > 1) {
    const decoyCount = N - 1;

    // Cap at available decoys so we don't fail if the pool is small
    const availableDecoys = await trx('decoy_hints')
      .where({ type_id: nextType.id })
      .orderByRaw('random()')
      .limit(decoyCount)
      .select('*');

    for (const decoy of availableDecoys) {
      await trx('hint_options').insert({
        hint_event_id: hintEvent.id,
        text: decoy.text,
        is_correct: false,
      });
    }
  }

  // Create served_problem
  const [served] = await trx('served_problems')
    .insert({
      participant_id: participantId,
      problem_id: nextProblem.id,
      hint_event_id: hintEvent.id,
      outcome: 'pending',
    })
    .returning('*');

  // Update current problem
  await trx('participants')
    .where({ id: participantId })
    .update({ current_problem_id: nextProblem.id });

  // Fetch all hint options for the response
  const hintOptions = await trx('hint_options')
    .where({ hint_event_id: hintEvent.id })
    .select('*');

  return {
    problem: nextProblem,
    served,
    hintEventId: hintEvent.id,
    stageNumber: nextType.sequence_order,
    typeName: nextType.name,
    hints: hintOptions,
  };
}

// ═══════════════════════════════════════════════════════════
// SESSION START — bootstraps the first problem (no hints)
// ═══════════════════════════════════════════════════════════

/**
 * Initializes a participant's session — serves the first problem cold (no hints).
 *
 * @param {string} participantId
 * @returns {Object} { problem, served }
 */
async function startSession(participantId) {
  return db.transaction(async (trx) => {
    const participant = await trx('participants')
      .where({ id: participantId })
      .forUpdate()
      .first();

    if (!participant) throw new NotFoundError('Participant not found');
    if (participant.status !== 'active') {
      throw new ConflictError(`Participant status is '${participant.status}'`);
    }

    // Check if they already have an active problem
    const existingServed = await trx('served_problems')
      .where({ participant_id: participantId, outcome: 'pending' })
      .orWhere({ participant_id: participantId, outcome: 'judging' })
      .first();

    if (existingServed) {
      const problem = await trx('problems')
        .where({ id: existingServed.problem_id })
        .first();

      let hintOptions = [];
      if (existingServed.hint_event_id) {
        hintOptions = await trx('hint_options')
          .where({ hint_event_id: existingServed.hint_event_id })
          .select('*');
      }

      return { problem, served: existingServed, hints: hintOptions, resumed: true };
    }

    // First problem — type with sequence_order = 1
    const firstType = await trx('problem_types')
      .orderBy('sequence_order', 'asc')
      .first();

    if (!firstType) throw new NotFoundError('No problem types configured');

    const problem = await pickProblemOfType(trx, participantId, firstType.id);

    // No hint event for problem 1 — cold solve
    const [served] = await trx('served_problems')
      .insert({
        participant_id: participantId,
        problem_id: problem.id,
        hint_event_id: null,
        outcome: 'pending',
      })
      .returning('*');

    await trx('participants')
      .where({ id: participantId })
      .update({ current_problem_id: problem.id });

    return { problem, served, hints: [], resumed: false };
  });
}

// ═══════════════════════════════════════════════════════════
// GET CURRENT SESSION — fetch current state for the client
// ═══════════════════════════════════════════════════════════

/**
 * Gets the participant's current session state.
 *
 * @param {string} participantId
 * @returns {Object|null}
 */
async function getCurrentSession(participantId) {
  const served = await db('served_problems')
    .where({ participant_id: participantId })
    .whereIn('outcome', ['pending', 'judging'])
    .orderBy('served_at', 'desc')
    .first();

  if (!served) {
    // Check if finished
    const participant = await db('participants')
      .where({ id: participantId })
      .first();

    if (participant?.status === 'finished') {
      return { finished: true };
    }
    return null;
  }

  const problem = await db('problems')
    .where({ id: served.problem_id })
    .first();

  let hintOptions = [];
  if (served.hint_event_id) {
    hintOptions = await db('hint_options')
      .where({ hint_event_id: served.hint_event_id })
      .select('*');
  }

  // Get the stage info
  const problemType = await db('problem_types')
    .where({ id: problem.type_id })
    .first();

  return {
    problem,
    served,
    hints: hintOptions,
    stage: {
      number: problemType.sequence_order,
      name: problemType.name,
    },
  };
}

// ═══════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════

/**
 * Gets the problem type for a given problem ID.
 */
async function getTypeOfProblem(trx, problemId) {
  const problem = await trx('problems').where({ id: problemId }).first();
  if (!problem) throw new NotFoundError('Problem not found');
  return trx('problem_types').where({ id: problem.type_id }).first();
}

/**
 * Gets the next problem type in sequence.
 * @returns {Object|null} Next type, or null if no more types
 */
async function getNextType(trx, currentTypeId) {
  const current = await trx('problem_types').where({ id: currentTypeId }).first();
  if (!current) return null;

  return trx('problem_types')
    .where('sequence_order', '>', current.sequence_order)
    .orderBy('sequence_order', 'asc')
    .first();
}

/**
 * Picks a random unseen problem of the given type.
 * FIX: Pool exhaustion fallback — allows repeats when pool is exhausted.
 *
 * @param {Object} trx - Knex transaction
 * @param {string} participantId
 * @param {number} typeId
 * @param {Object} opts - { excludeIds: number[] }
 * @returns {Object} Problem row
 */
async function pickProblemOfType(trx, participantId, typeId, { excludeIds = [] } = {}) {
  // Get all problems already served to this participant
  const seenIds = await trx('served_problems')
    .where({ participant_id: participantId })
    .pluck('problem_id');

  // First pass: unseen problems
  let candidates = await trx('problems')
    .where({ type_id: typeId, is_active: true })
    .whereNotIn('id', [...new Set([...seenIds, ...excludeIds])])
    .select('*');

  // FIX: Pool exhaustion fallback — allow repeats if no unseen problems left
  if (!candidates.length && config.poolExhaustion.allowRepeat) {
    candidates = await trx('problems')
      .where({ type_id: typeId, is_active: true })
      .whereNotIn('id', excludeIds)
      .select('*');
  }

  if (!candidates.length) {
    throw new NotFoundError(
      `No problems available for type ${typeId}. Pool exhausted and repeats are disabled.`
    );
  }

  // Random selection
  return candidates[Math.floor(Math.random() * candidates.length)];
}

/**
 * Gets participant's submission history.
 */
async function getHistory(participantId) {
  const served = await db('served_problems')
    .where({ participant_id: participantId })
    .orderBy('served_at', 'asc')
    .select('*');

  const history = [];
  for (const s of served) {
    const problem = await db('problems').where({ id: s.problem_id }).first();
    const submissions = await db('submissions')
      .where({ served_problem_id: s.id })
      .orderBy('submitted_at', 'asc')
      .select('id', 'language', 'verdict', 'runtime_ms', 'submitted_at');

    const type = await db('problem_types').where({ id: problem.type_id }).first();

    history.push({
      servedProblemId: s.id,
      problemTitle: problem.title,
      typeName: type.name,
      stage: type.sequence_order,
      outcome: s.outcome,
      servedAt: s.served_at,
      submissions,
    });
  }

  return history;
}

module.exports = {
  selectHint,
  submitAttempt,
  beginSubmission,
  executeJudgment,
  applyVerdict,
  startSession,
  getCurrentSession,
  getHistory,
  advanceToNextType,
  pickProblemOfType,
  getHintCount,
};
