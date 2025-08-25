// modules/login/google/controller.js
import express from 'express';
import { OAuth2Client } from 'google-auth-library';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';

const router = express.Router();
router.use(cookieParser());

// DB helper
async function getDB() {
  return open({
    filename: path.resolve('modules/persistence_sqlite/messages.db'),
    driver: sqlite3.Database,
  });
}

// Environment selection
const isProd = process.env.NODE_ENV === 'production';
const GOOGLE_CLIENT_ID     = isProd ? process.env.GOOGLE_CLIENT_ID_PROD     : process.env.GOOGLE_CLIENT_ID_DEV;
const GOOGLE_CLIENT_SECRET = isProd ? process.env.GOOGLE_CLIENT_SECRET_PROD : process.env.GOOGLE_CLIENT_SECRET_DEV;
const GOOGLE_REDIRECT_URI  = isProd ? process.env.GOOGLE_REDIRECT_URI_PROD  : process.env.GOOGLE_REDIRECT_URI_DEV;

// Debug logs
console.log(`[Google Auth] Running in ${isProd ? 'PROD' : 'DEV'} mode`);
console.log(`[Google Auth] Redirect URI: ${GOOGLE_REDIRECT_URI}`);

const oauth2Client = new OAuth2Client({
  clientId: GOOGLE_CLIENT_ID,
  clientSecret: GOOGLE_CLIENT_SECRET,
  redirectUri: GOOGLE_REDIRECT_URI,
});

// ── STATE cookie settings ───────────────────────────────────────────────
const STATE_COOKIE = 'oauth_state';
const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// Step 1: Start login — redirect user to Google
router.get('/start', (req, res) => {
  const state = randomUUID();

  // httpOnly cookie so JS can’t read it; Lax is ideal for OAuth redirects
  res.cookie(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    maxAge: STATE_TTL_MS,
    path: '/api/login/google', // match the router mount path
  });

  const url = oauth2Client.generateAuthUrl({
    access_type: 'online',                   // no refresh token needed
    prompt: 'select_account',                // nicer UX
    scope: ['openid', 'email', 'profile'],
    state,                                   // include state in request
  });

  res.redirect(url);
});

// Step 2: Callback — Google redirects here
router.get('/callback', async (req, res) => {
  try {
    const { code, state } = req.query;

    // Verify state first
    const cookieState = req.cookies?.[STATE_COOKIE];
    if (!code || !state || !cookieState || cookieState !== state) {
      return res.status(400).send('Invalid state');
    }
    // Clear state cookie now that it’s been used
    res.clearCookie(STATE_COOKIE, { path: '/api/login/google' });

    // Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Verify ID token & extract profile
    const ticket = await oauth2Client.verifyIdToken({
      idToken: tokens.id_token,
      audience: GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();

    const googleSub = payload.sub;
    const email = payload.email;
    const name = payload.name || (email ? email.split('@')[0] : 'user');

    const db = await getDB();

    // Find existing user by google_sub or email
    const existing = await db.get(
      'SELECT * FROM users WHERE google_sub = ? OR email = ?',
      googleSub, email
    );

    if (existing) {
      if (!existing.google_sub) {
        await db.run(
          'UPDATE users SET google_sub = ?, provider = ? WHERE user_id = ?',
          googleSub, 'google', existing.user_id
        );
      }
      return res.redirect(`/login/success?user_id=${existing.user_id}&username=${encodeURIComponent(existing.username)}`);
    }

    // Otherwise create new user
    const generatedUsername = `g_${String(name).replace(/\s+/g, '').toLowerCase()}_${Math.floor(Math.random() * 10000)}`;
    const createdAt = Date.now();

    const result = await db.run(
      `INSERT INTO users (username, email, google_sub, provider, created_at)
       VALUES (?, ?, ?, 'google', ?)`,
      generatedUsername, email, googleSub, createdAt
    );

    return res.redirect(`/login/success?user_id=${result.lastID}&username=${encodeURIComponent(generatedUsername)}`);
  } catch (err) {
    console.error('Google login error:', err);
    return res.status(500).send('Login failed');
  }
});

export default router;
