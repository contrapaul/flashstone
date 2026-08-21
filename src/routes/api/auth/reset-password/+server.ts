import { json, error, type RequestHandler } from '@sveltejs/kit';
import { hashPassword, sha256Hex } from '$lib/server/crypto';
import { db, readJson } from '$lib/server/api';

export const POST: RequestHandler = async (event) => {
  const DB = db(event);
  const body = await readJson(event);
  const token = String(body.token || '');
  const newPassword = String(body.newPassword || '');
  if (!token) error(400, 'Missing token.');
  if (newPassword.length < 8 || newPassword.length > 200) {
    error(400, 'Password must be at least 8 characters.');
  }

  const tokenHash = await sha256Hex(token);
  const row = await DB.prepare(
    "SELECT user_id, expires_at, used_at FROM auth_tokens WHERE token_hash = ?1 AND kind = 'reset'"
  )
    .bind(tokenHash)
    .first();
  if (!row || row.used_at || (row.expires_at as number) < Date.now()) {
    error(400, 'This reset link is invalid or has expired. Request a new one.');
  }

  // Update the password, burn the token, and sign out every existing session.
  await DB.batch([
    DB.prepare('UPDATE users SET password_hash = ?1 WHERE id = ?2').bind(
      await hashPassword(newPassword),
      row.user_id
    ),
    DB.prepare('UPDATE auth_tokens SET used_at = ?1 WHERE token_hash = ?2').bind(Date.now(), tokenHash),
    DB.prepare('DELETE FROM sessions WHERE user_id = ?1').bind(row.user_id)
  ]);
  return json({ ok: true });
};
