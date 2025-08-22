// modules/login/google/controller.js
import express from 'express';
import { OAuth2Client } from 'google-auth-library';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';

const router = express.Router();

// Single source of truth for DB path (project-root relative)
async function getDB() {
  return open({
    filename: path.resolve('modules/persistence_sqlite/messages.db'),
    driver: sqlite3.Database,
  });
}

// OAuth client (reads from .env; ensure dotenv.config() ran in server/src/index.js)
/*
const oauth2Client = new OAuth2Client({
  clientId: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  redirectUri: process.env.GOOGLE_REDIRECT_URI,
});
*/
// Figure out environment (prod vs dev)
const isProd = process.env.NODE_ENV === 'production';

// Load the right credentials
const GOOGLE_CLIENT_ID = isProd ? process.env.GOOGLE_CLIENT_ID_PROD : process.env.GOOGLE_CLIENT_ID_DEV;
const GOOGLE_CLIENT_SECRET = isProd ? process.env.GOOGLE_CLIENT_SECRET_PROD : process.env.GOOGLE_CLIENT_SECRET_DEV;
const GOOGLE_REDIRECT_URI = isProd ? process.env.GOOGLE_REDIRECT_URI_PROD : process.env.GOOGLE_REDIRECT_URI_DEV;

// Debug log (safe snippet only)
console.log(`[Google Auth] Running in ${isProd ? 'PROD' : 'DEV'} mode`);
console.log(`[Google Auth] Redirect URI: ${GOOGLE_REDIRECT_URI}`);

const oauth2Client = new OAuth2Client({
  clientId: GOOGLE_CLIENT_ID,
  clientSecret: GOOGLE_CLIENT_SECRET,
  redirectUri: GOOGLE_REDIRECT_URI,
});

// Kick off the flow
router.get('/start', (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['openid', 'email', 'profile'],
    prompt: 'consent',
  });
  res.redirect(url);
});

// Google redirects here
router.get('/callback', async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) return res.status(400).send('Missing code');

    // Exchange code → tokens
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Verify ID token
    const ticket = await oauth2Client.verifyIdToken({
      idToken: tokens.id_token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();

    const googleSub = payload.sub;
    const email = payload.email;
    const name = payload.name || email.split('@')[0];

    const db = await getDB();

    // Find by google_sub or email (avoid dup accounts)
    const row = await db.get(
      'SELECT * FROM users WHERE google_sub = ? OR email = ?',
      [googleSub, email]
    );

    if (row) {
      if (!row.google_sub) {
        await db.run(
          'UPDATE users SET google_sub = ?, provider = ? WHERE user_id = ?',
          [googleSub, 'google', row.user_id]
        );
      }
      return res.redirect(`/login/success?user_id=${row.user_id}&username=${encodeURIComponent(row.username)}`);
    } else {
      const generatedUsername = `g_${name.replace(/\s+/g, '').toLowerCase()}_${Math.floor(Math.random()*10000)}`;
      const createdAt = Date.now();

      const result = await db.run(
        `INSERT INTO users (username, email, google_sub, provider, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        [generatedUsername, email, googleSub, 'google', createdAt]
      );

      return res.redirect(`/login/success?user_id=${result.lastID}&username=${encodeURIComponent(generatedUsername)}`);
    }
  } catch (err) {
    console.error('Google login error:', err);
    res.status(500).send('Login failed');
  }
});

export default router;
