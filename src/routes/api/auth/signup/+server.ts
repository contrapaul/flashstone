import { json, error, type RequestHandler } from '@sveltejs/kit';
import { hashPassword, randomToken, sha256Hex } from '$lib/server/crypto';
import { createSession, sessionCookie } from '$lib/server/session';
import { rateLimit } from '$lib/server/ratelimit';
import { sendVerifyEmail } from '$lib/server/email';
import { background, clientIp, db, env, readJson } from '$lib/server/api';
import { grantStarterCollection } from '$lib/server/collection';

// Ported from time/functions/api/auth/signup.ts. The wrapper is SvelteKit's;
// the validation, the token flow and the rate-limit windows are unchanged.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[a-zA-Z0-9_-]{3,24}$/;

export const POST: RequestHandler = async (event) => {
  const DB = db(event);
  await rateLimit(DB && { DB }, `signup:${clientIp(event)}`, 5, 60 * 60 * 1000);

  const body = await readJson(event);
  const email = String(body.email || '').trim().toLowerCase();
  const username = String(body.username || '').trim();
  const password = String(body.password || '');

  if (!EMAIL_RE.test(email) || email.length > 254) {
    error(400, 'Please enter a valid email address.');
  }
  if (!USERNAME_RE.test(username)) {
    error(400, 'Username must be 3-24 characters: letters, numbers, - or _ only.');
  }
  if (password.length < 8 || password.length > 200) {
    error(400, 'Password must be at least 8 characters.');
  }

  const existing = await DB.prepare(
    'SELECT email, username FROM users WHERE email = ?1 OR username = ?2'
  )
    .bind(email, username)
    .first();
  if (existing) {
    const which = String(existing.email).toLowerCase() === email ? 'email' : 'username';
    error(409, `That ${which} is already taken.`);
  }

  const userId = crypto.randomUUID();
  const now = Date.now();
  await DB.batch([
    DB.prepare(
      'INSERT INTO users (id, email, username, password_hash, email_verified, created_at) VALUES (?1, ?2, ?3, ?4, 0, ?5)'
    ).bind(userId, email, username, await hashPassword(password), now),
    DB.prepare('INSERT INTO profiles (user_id, created_at) VALUES (?1, ?2)').bind(userId, now)
  ]);

  // Everyone starts with the same 15 cards, two copies each.
  await grantStarterCollection(DB, userId);

  // Email verification token (24h). Sending is best-effort in the background.
  const verifyToken = randomToken();
  await DB.prepare(
    "INSERT INTO auth_tokens (token_hash, user_id, kind, expires_at) VALUES (?1, ?2, 'verify', ?3)"
  )
    .bind(await sha256Hex(verifyToken), userId, now + 24 * 60 * 60 * 1000)
    .run();
  const origin = new URL(event.request.url).origin;
  background(event, sendVerifyEmail(env(event), email, `${origin}/?verify=${verifyToken}`));

  const session = await createSession({ DB }, userId);
  return json(
    { user: { id: userId, username, email, emailVerified: false } },
    { headers: { 'Set-Cookie': sessionCookie(session) } }
  );
};
