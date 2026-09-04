/**
 * Auth middleware — JWT verification + participant resolution.
 * Admin routes use requireAdmin which checks participant.role.
 */

const jwt = require('jsonwebtoken');
const config = require('../config');
const db = require('../db');
const { UnauthorizedError, ForbiddenError } = require('../errors');

/**
 * Verifies JWT and attaches participant to req.participant.
 */
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new UnauthorizedError('Missing or invalid Authorization header'));
  }

  const token = authHeader.split(' ')[1];

  try {
    const payload = jwt.verify(token, config.jwt.secret);
    req.participantId = payload.sub;
    next();
  } catch (err) {
    next(new UnauthorizedError('Invalid or expired token'));
  }
}

/**
 * Requires admin role. Must be used AFTER requireAuth.
 */
async function requireAdmin(req, res, next) {
  try {
    const participant = await db('participants')
      .where({ id: req.participantId })
      .first();

    if (!participant || participant.role !== 'admin') {
      return next(new ForbiddenError('Admin access required'));
    }

    req.participant = participant;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Generates a JWT for a participant.
 */
function generateToken(participantId) {
  return jwt.sign(
    { sub: participantId },
    config.jwt.secret,
    { expiresIn: config.jwt.expiry }
  );
}

module.exports = { requireAuth, requireAdmin, generateToken };
