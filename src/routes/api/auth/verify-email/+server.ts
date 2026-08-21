import { json, error, type RequestHandler } from '@sveltejs/kit';
import { sha256Hex } from '$lib/server/crypto';
import { db, readJson } from '$lib/server/api';

export const POST: RequestHandler = async (event) => {
  const DB = db(event);
  const body = await readJson(event);
  const token = String(body.token || '');
  if (!token) error(400, 'Missing token.');

  const tokenHash = await sha256Hex(token);
  const row = await DB.prepare(
    "SELECT user_id, expires_at, used_at FROM auth_tokens WHERE token_hash = ?1 AND kind = 'verify'"
  )
    .bind(tokenHash)
    .first();
  if (!row || row.used_at || (row.expires_at as number) < Date.now()) {
    error(400, 'This verification link is invalid or has expired.');
  }

  await DB.batch([
    DB.prepare('UPDATE auth_tokens SET used_at = ?1 WHERE token_hash = ?2').bind(Date.now(), tokenHash),
    DB.prepare('UPDATE users SET email_verified = 1 WHERE id = ?1').bind(row.user_id)
  ]);
  return json({ ok: true });
};
