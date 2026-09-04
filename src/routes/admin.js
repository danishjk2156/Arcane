/**
 * Admin Routes — Problem CRUD, participant management, live dashboard
 * All routes require admin role.
 */

const express = require('express');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const db = require('../db');
const { BadRequestError, NotFoundError } = require('../errors');

const router = express.Router();

// All admin routes require auth + admin role
router.use(requireAuth, requireAdmin);

// ═══════════════════════════════════════════════════════════
// PROBLEM TYPES
// ═══════════════════════════════════════════════════════════

router.get('/problem-types', async (req, res, next) => {
  try {
    const types = await db('problem_types').orderBy('sequence_order', 'asc');
    res.json({ types });
  } catch (err) { next(err); }
});

router.post('/problem-types', async (req, res, next) => {
  try {
    const { name, sequenceOrder, hintsPerStage } = req.body;
    if (!name || sequenceOrder == null) {
      throw new BadRequestError('name and sequenceOrder are required');
    }

    const [type] = await db('problem_types')
      .insert({
        name,
        sequence_order: sequenceOrder,
        hints_per_stage: hintsPerStage || null,
      })
      .returning('*');

    res.status(201).json({ type });
  } catch (err) { next(err); }
});

router.put('/problem-types/:id', async (req, res, next) => {
  try {
    const { name, sequenceOrder, hintsPerStage } = req.body;
    const updates = {};
    if (name != null) updates.name = name;
    if (sequenceOrder != null) updates.sequence_order = sequenceOrder;
    if (hintsPerStage !== undefined) updates.hints_per_stage = hintsPerStage;

    const [type] = await db('problem_types')
      .where({ id: req.params.id })
      .update(updates)
      .returning('*');

    if (!type) throw new NotFoundError('Problem type not found');
    res.json({ type });
  } catch (err) { next(err); }
});

router.delete('/problem-types/:id', async (req, res, next) => {
  try {
    const deleted = await db('problem_types').where({ id: req.params.id }).del();
    if (!deleted) throw new NotFoundError('Problem type not found');
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════
// PROBLEMS
// ═══════════════════════════════════════════════════════════

router.get('/problems', async (req, res, next) => {
  try {
    const { typeId } = req.query;
    let query = db('problems')
      .join('problem_types', 'problems.type_id', 'problem_types.id')
      .select('problems.*', 'problem_types.name as type_name')
      .orderBy(['problem_types.sequence_order', 'problems.id']);

    if (typeId) query = query.where('problems.type_id', typeId);

    const problems = await query;
    res.json({ problems });
  } catch (err) { next(err); }
});

router.post('/problems', async (req, res, next) => {
  try {
    const {
      typeId, title, description, difficulty,
      starterCode, testCases, hintText,
      timeLimitMs, memoryLimitMb,
    } = req.body;

    if (!typeId || !title || !description || !testCases || !hintText) {
      throw new BadRequestError('typeId, title, description, testCases, and hintText are required');
    }

    const [problem] = await db('problems')
      .insert({
        type_id: typeId,
        title,
        description,
        difficulty: difficulty || 1,
        starter_code: starterCode ? JSON.stringify(starterCode) : null,
        test_cases: JSON.stringify(testCases),
        hint_text: hintText,
        time_limit_ms: timeLimitMs || 2000,
        memory_limit_mb: memoryLimitMb || 128,
      })
      .returning('*');

    res.status(201).json({ problem });
  } catch (err) { next(err); }
});

router.put('/problems/:id', async (req, res, next) => {
  try {
    const {
      typeId, title, description, difficulty,
      starterCode, testCases, hintText,
      timeLimitMs, memoryLimitMb, isActive,
    } = req.body;

    const updates = {};
    if (typeId != null) updates.type_id = typeId;
    if (title != null) updates.title = title;
    if (description != null) updates.description = description;
    if (difficulty != null) updates.difficulty = difficulty;
    if (starterCode !== undefined) updates.starter_code = JSON.stringify(starterCode);
    if (testCases !== undefined) updates.test_cases = JSON.stringify(testCases);
    if (hintText != null) updates.hint_text = hintText;
    if (timeLimitMs != null) updates.time_limit_ms = timeLimitMs;
    if (memoryLimitMb != null) updates.memory_limit_mb = memoryLimitMb;
    if (isActive != null) updates.is_active = isActive;

    const [problem] = await db('problems')
      .where({ id: req.params.id })
      .update(updates)
      .returning('*');

    if (!problem) throw new NotFoundError('Problem not found');
    res.json({ problem });
  } catch (err) { next(err); }
});

router.delete('/problems/:id', async (req, res, next) => {
  try {
    // Soft delete — deactivate instead of removing
    const [problem] = await db('problems')
      .where({ id: req.params.id })
      .update({ is_active: false })
      .returning('*');

    if (!problem) throw new NotFoundError('Problem not found');
    res.json({ problem });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════
// DECOY HINTS
// ═══════════════════════════════════════════════════════════

router.get('/decoy-hints', async (req, res, next) => {
  try {
    const { typeId } = req.query;
    let query = db('decoy_hints')
      .join('problem_types', 'decoy_hints.type_id', 'problem_types.id')
      .select('decoy_hints.*', 'problem_types.name as type_name')
      .orderBy('decoy_hints.type_id');

    if (typeId) query = query.where('decoy_hints.type_id', typeId);

    const hints = await query;
    res.json({ hints });
  } catch (err) { next(err); }
});

router.post('/decoy-hints', async (req, res, next) => {
  try {
    const { typeId, text } = req.body;
    if (!typeId || !text) throw new BadRequestError('typeId and text are required');

    const [hint] = await db('decoy_hints')
      .insert({ type_id: typeId, text })
      .returning('*');

    res.status(201).json({ hint });
  } catch (err) { next(err); }
});

// Bulk import
router.post('/decoy-hints/bulk', async (req, res, next) => {
  try {
    const { hints } = req.body; // [{ typeId, text }]
    if (!Array.isArray(hints) || !hints.length) {
      throw new BadRequestError('hints array is required');
    }

    const rows = hints.map((h) => ({ type_id: h.typeId, text: h.text }));
    const inserted = await db('decoy_hints').insert(rows).returning('*');

    res.status(201).json({ inserted: inserted.length, hints: inserted });
  } catch (err) { next(err); }
});

router.delete('/decoy-hints/:id', async (req, res, next) => {
  try {
    const deleted = await db('decoy_hints').where({ id: req.params.id }).del();
    if (!deleted) throw new NotFoundError('Decoy hint not found');
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════
// PARTICIPANTS
// ═══════════════════════════════════════════════════════════

router.get('/participants', async (req, res, next) => {
  try {
    const participants = await db('participants')
      .where('role', 'participant')
      .orderBy('created_at', 'desc')
      .select('id', 'display_name', 'email', 'status', 'current_problem_id', 'created_at');

    // Enrich with progress info
    const enriched = await Promise.all(
      participants.map(async (p) => {
        const stats = await db('served_problems')
          .where({ participant_id: p.id, outcome: 'correct' })
          .count('id as solved');

        const totalSubmissions = await db('served_problems')
          .join('submissions', 'submissions.served_problem_id', 'served_problems.id')
          .where({ 'served_problems.participant_id': p.id })
          .count('submissions.id as total');

        return {
          ...p,
          problemsSolved: parseInt(stats[0].solved, 10),
          totalSubmissions: parseInt(totalSubmissions[0].total, 10),
        };
      })
    );

    res.json({ participants: enriched });
  } catch (err) { next(err); }
});

router.put('/participants/:id/status', async (req, res, next) => {
  try {
    const { status } = req.body; // active | disqualified
    if (!['active', 'disqualified'].includes(status)) {
      throw new BadRequestError('Status must be "active" or "disqualified"');
    }

    const [participant] = await db('participants')
      .where({ id: req.params.id })
      .update({ status })
      .returning('*');

    if (!participant) throw new NotFoundError('Participant not found');
    res.json({ participant });
  } catch (err) { next(err); }
});

// Reset participant progress (for testing or by admin request)
router.post('/participants/:id/reset', async (req, res, next) => {
  try {
    const pid = req.params.id;

    await db.transaction(async (trx) => {
      // Delete submissions
      await trx('submissions')
        .whereIn('served_problem_id',
          trx('served_problems').where({ participant_id: pid }).select('id')
        )
        .del();

      // Delete served problems
      await trx('served_problems').where({ participant_id: pid }).del();

      // Delete hint options through hint events
      const hintEventIds = await trx('hint_events')
        .where({ participant_id: pid })
        .pluck('id');

      if (hintEventIds.length) {
        await trx('hint_options').whereIn('hint_event_id', hintEventIds).del();
      }

      // Delete hint events
      await trx('hint_events').where({ participant_id: pid }).del();

      // Reset participant
      await trx('participants')
        .where({ id: pid })
        .update({ current_problem_id: null, status: 'active' });
    });

    res.json({ success: true, message: 'Participant progress reset' });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════
// EVENT DASHBOARD — Live stats
// ═══════════════════════════════════════════════════════════

router.get('/dashboard', async (req, res, next) => {
  try {
    // Active participants
    const activeCount = await db('participants')
      .where({ status: 'active', role: 'participant' })
      .count('id as count');

    const finishedCount = await db('participants')
      .where({ status: 'finished', role: 'participant' })
      .count('id as count');

    // Level distribution
    const levelDist = await db.raw(`
      SELECT pt.name as level_name, pt.sequence_order,
             COUNT(DISTINCT sp.participant_id) as participant_count
      FROM problem_types pt
      LEFT JOIN problems p ON p.type_id = pt.id
      LEFT JOIN served_problems sp ON sp.problem_id = p.id
        AND sp.outcome IN ('pending', 'judging')
      GROUP BY pt.id, pt.name, pt.sequence_order
      ORDER BY pt.sequence_order
    `);

    // Recent submissions (last 5 minutes)
    const recentSubmissions = await db('submissions')
      .where('submitted_at', '>', new Date(Date.now() - 5 * 60 * 1000))
      .count('id as count');

    // Currently judging
    const judgingCount = await db('served_problems')
      .where({ outcome: 'judging' })
      .count('id as count');

    // Stuck participants (pending for > 30 min)
    const stuckParticipants = await db('served_problems')
      .join('participants', 'participants.id', 'served_problems.participant_id')
      .where('served_problems.outcome', 'pending')
      .where('served_problems.served_at', '<', new Date(Date.now() - 30 * 60 * 1000))
      .select(
        'participants.id',
        'participants.display_name',
        'served_problems.served_at'
      );

    res.json({
      active: parseInt(activeCount[0].count, 10),
      finished: parseInt(finishedCount[0].count, 10),
      currentlyJudging: parseInt(judgingCount[0].count, 10),
      submissionsLast5Min: parseInt(recentSubmissions[0].count, 10),
      levelDistribution: levelDist.rows,
      stuckParticipants,
    });
  } catch (err) { next(err); }
});

module.exports = router;
