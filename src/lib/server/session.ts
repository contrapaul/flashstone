import { randomToken, sha256Hex } from './crypto';

/**
 * Sessions — ported from the `time` repo (functions/api/_lib/session.ts).
 *
 * The only changes are the cookie name and the `env` reaching us through
 * SvelteKit's `platform.env` rather than a Pages Functions context. The token
 * is random, only its SHA-256 is stored, and the cookie is HttpOnly + Secure +
 * SameSite=Lax.
 */

export const SESSION_COOKIE = 'fs_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface SessionUser {
  id: string;
  username: string;
  email: string;
  email_verified: number;
}

export async function createSession(env: any, userId: string): Promise<string> {
  const token = randomToken();
  const now = Date.now();
  await env.DB.prepare(
    'INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?1, ?2, ?3, ?4)'
  )
    .bind(await sha256Hex(token), userId, now, now + SESSION_TTL_MS)
    .run();
  return token;
}

export function sessionCookie(token: string): string {
  return `${SESSION_COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_MS / 1000}`;
}

export function clearedSessionCookie(): string {
  return `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

export async function getUserFromToken(
  env: any,
  token: string | null | undefined
): Promise<SessionUser | null> {
  if (!token) return null;
  const row = await env.DB.prepare(
    `SELECT u.id, u.username, u.email, u.email_verified, s.expires_at
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ?1`
  )
    .bind(await sha256Hex(token))
    .first();
  if (!row) return null;
  if ((row.expires_at as number) < Date.now()) return null;
  return {
    id: row.id as string,
    username: row.username as string,
    email: row.email as string,
    email_verified: row.email_verified as number
  };
}

export async function deleteSession(env: any, token: string | null | undefined): Promise<void> {
  if (!token) return;
  await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?1')
    .bind(await sha256Hex(token))
    .run();
}

// Piggybacked cleanup: purge this user's expired sessions and stale tokens.
export async function purgeExpired(env: any, userId: string): Promise<void> {
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ?1 AND expires_at < ?2').bind(userId, now),
    env.DB.prepare('DELETE FROM auth_tokens WHERE user_id = ?1 AND expires_at < ?2').bind(userId, now)
  ]);
}
