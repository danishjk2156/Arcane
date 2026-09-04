/**
 * Auth Routes — Registration + Login
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { generateToken } = require('../middleware/auth');
const { BadRequestError, UnauthorizedError } = require('../errors');

const router = express.Router();

/**
 * POST /api/auth/register
 * Body: { displayName, email, password }
 */
router.post('/register', async (req, res, next) => {
  try {
    const { displayName, email, password } = req.body;

    if (!displayName || !email || !password) {
      throw new BadRequestError('displayName, email, and password are required');
    }

    const existing = await db('participants').where({ email }).first();
    if (existing) {
      throw new BadRequestError('Email already registered');
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const [participant] = await db('participants')
      .insert({
        display_name: displayName,
        email,
        password_hash: passwordHash,
      })
      .returning('*');

    const token = generateToken(participant.id);

    res.status(201).json({
      token,
      participant: {
        id: participant.id,
        displayName: participant.display_name,
        email: participant.email,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/login
 * Body: { email, password }
 */
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      throw new BadRequestError('email and password are required');
    }

    const participant = await db('participants').where({ email }).first();
    if (!participant) {
      throw new UnauthorizedError('Invalid credentials');
    }

    const valid = await bcrypt.compare(password, participant.password_hash);
    if (!valid) {
      throw new UnauthorizedError('Invalid credentials');
    }

    const token = generateToken(participant.id);

    res.json({
      token,
      participant: {
        id: participant.id,
        displayName: participant.display_name,
        email: participant.email,
        role: participant.role,
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
