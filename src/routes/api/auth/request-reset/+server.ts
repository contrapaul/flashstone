import { json, type RequestHandler } from '@sveltejs/kit';
import { randomToken, sha256Hex } from '$lib/server/crypto';
import { rateLimit } from '$lib/server/ratelimit';
import { sendResetEmail } from '$lib/server/email';
import { background, clientIp, db, env, readJson } from '$lib/server/api';

// Always returns 200 so account existence cannot be probed.
export const POST: RequestHandler = async (event) => {
  const DB = db(event);
  const body = await readJson(event);
  const email = String(body.email || '').trim().toLowerCase();

  await rateLimit({ DB }, `reset:${clientIp(event)}`, 5, 60 * 60 * 1000);
  await rateLimit({ DB }, `reset:${email}`, 3, 60 * 60 * 1000);

  const user = await DB.prepare('SELECT id FROM users WHERE email = ?1').bind(email).first();
  if (user) {
    const token = randomToken();
    await DB.prepare(
      "INSERT INTO auth_tokens (token_hash, user_id, kind, expires_at) VALUES (?1, ?2, 'reset', ?3)"
    )
      .bind(await sha256Hex(token), user.id, Date.now() + 60 * 60 * 1000)
      .run();
    const origin = new URL(event.request.url).origin;
    background(event, sendResetEmail(env(event), email, `${origin}/?reset=${token}`));
  }
  return json({ ok: true });
};
