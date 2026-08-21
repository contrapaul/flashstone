import { json, error, type RequestHandler } from '@sveltejs/kit';
import { verifyPassword } from '$lib/server/crypto';
import { createSession, purgeExpired, sessionCookie } from '$lib/server/session';
import { rateLimit } from '$lib/server/ratelimit';
import { background, clientIp, db, readJson } from '$lib/server/api';
import { grantStarterCollection } from '$lib/server/collection';

export const POST: RequestHandler = async (event) => {
  const DB = db(event);
  const body = await readJson(event);
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');

  const window = 15 * 60 * 1000;
  await rateLimit({ DB }, `login:${clientIp(event)}`, 10, window);
  await rateLimit({ DB }, `login:${email}`, 10, window);

  const user = await DB.prepare(
    'SELECT id, username, email, email_verified, password_hash FROM users WHERE email = ?1'
  )
    .bind(email)
    .first();
  // One message for both cases, so a wrong password cannot confirm an account.
  if (!user || !(await verifyPassword(password, String(user.password_hash)))) {
    error(401, 'Incorrect email or password.');
  }

  // Idempotent — a user who somehow has no cards gets the starter set.
  await grantStarterCollection(DB, String(user.id));

  background(event, purgeExpired({ DB }, String(user.id)));
  const session = await createSession({ DB }, String(user.id));
  return json(
    {
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        emailVerified: !!user.email_verified
      }
    },
    { headers: { 'Set-Cookie': sessionCookie(session) } }
  );
};
