/**
 * Session Routes — Core participant-facing API
 *
 * All responses go through the DTO layer so `is_correct` is never exposed.
 * Rate limiting is applied to /submit to prevent brute-force.
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const { requireAuth } = require('../middleware/auth');
const progressionEngine = require('../services/progressionEngine');
const { servedProblemToClient, hintOptionToClient } = require('../dto');
const { BadRequestError } = require('../errors');
const config = require('../config');

const router = express.Router();

// Rate limit on submit — 1 per 3s per participant (prevents brute-force)
const submitLimiter = rateLimit({
  windowMs: config.rateLimit.submitWindowMs,
  max: config.rateLimit.submitMax,
  keyGenerator: (req) => req.participantId,
  message: { error: 'Too many submissions — please wait before retrying' },
  standardHeaders: true,
  legacyHeaders: false,
});

// All session routes require auth
router.use(requireAuth);

/**
 * GET /api/session/current
 * Returns the participant's current problem + visible hint options (stripped of is_correct).
 */
router.get('/current', async (req, res, next) => {
  try {
    let session = await progressionEngine.getCurrentSession(req.participantId);

    // If no session exists, start one (first visit)
    if (!session) {
      const startResult = await progressionEngine.startSession(req.participantId);
      session = startResult;
    }

    if (session.finished) {
      return res.json({ finished: true });
    }

    // DTO layer — strips is_correct from hint options
    res.json(servedProblemToClient(session.served, session.problem, session.hints));
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/session/select-hint
 * Body: { servedProblemId, hintOptionId }
 * Records which hint the participant selects (radio-style, one at a time).
 */
router.post('/select-hint', async (req, res, next) => {
  try {
    const { servedProblemId, hintOptionId } = req.body;

    if (!servedProblemId || !hintOptionId) {
      throw new BadRequestError('servedProblemId and hintOptionId are required');
    }

    const result = await progressionEngine.selectHint(
      req.participantId,
      servedProblemId,
      hintOptionId
    );

    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/session/submit
 * Body: { servedProblemId, code, language, clientRequestId? }
 *
 * Rate-limited. Returns verdict + FSM transition:
 *   - correct → next problem + new hints
 *   - wrong_retry → same problem
 *   - wrong_looped → new problem (decoy eliminated) + remaining hints
 *   - cached → idempotent replay
 *   - finished → all types completed
 */
router.post('/submit', submitLimiter, async (req, res, next) => {
  try {
    const { servedProblemId, code, language, clientRequestId } = req.body;

    if (!servedProblemId || !code || !language) {
      throw new BadRequestError('servedProblemId, code, and language are required');
    }

    const result = await progressionEngine.submitAttempt(
      req.participantId,
      servedProblemId,
      code,
      language,
      clientRequestId
    );

    // Format response through DTO layer
    const response = { result: result.result };

    if (result.result === 'correct' || result.result === 'wrong_looped') {
      if (result.result === 'finished' || result.problem) {
        if (result.problem) {
          response.session = servedProblemToClient(
            result.served,
            result.problem,
            result.hints || []
          );
        }
        if (result.stageNumber) response.stageNumber = result.stageNumber;
        if (result.typeName) response.typeName = result.typeName;
      }

      if (result.result === 'correct' && result.result === 'finished') {
        response.finished = true;
      }
    }

    if (result.result === 'wrong_retry') {
      response.servedProblemId = result.servedProblemId;
      response.verdict = result.verdict;
      response.failedTestCase = result.failedTestCase;
      response.totalTestCases = result.totalTestCases;
      // Only show stderr/compile output — never expose test case details
      if (result.stderr) response.stderr = result.stderr;
      if (result.compileOutput) response.compileOutput = result.compileOutput;
    }

    if (result.result === 'wrong_looped') {
      response.eliminatedHintId = result.eliminatedHintId;
    }

    res.json(response);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/session/history
 * Returns the participant's full attempt log.
 */
router.get('/history', async (req, res, next) => {
  try {
    const history = await progressionEngine.getHistory(req.participantId);
    res.json({ history });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
