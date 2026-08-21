import { json, error, type RequestHandler } from '@sveltejs/kit';
import { randomToken, sha256Hex } from '$lib/server/crypto';
import { rateLimit } from '$lib/server/ratelimit';
import { sendVerifyEmail } from '$lib/server/email';
import { db, env, requireUser } from '$lib/server/api';

export const POST: RequestHandler = async (event) => {
  const DB = db(event);
  const user = requireUser(event);
  if (user.email_verified) error(400, 'Your email is already verified.');

  await rateLimit({ DB }, `resend-verify:${user.id}`, 3, 60 * 60 * 1000);

  const token = randomToken();
  await DB.prepare(
    "INSERT INTO auth_tokens (token_hash, user_id, kind, expires_at) VALUES (?1, ?2, 'verify', ?3)"
  )
    .bind(await sha256Hex(token), user.id, Date.now() + 24 * 60 * 60 * 1000)
    .run();
  const origin = new URL(event.request.url).origin;
  await sendVerifyEmail(env(event), user.email, `${origin}/?verify=${token}`);
  return json({ ok: true });
};
