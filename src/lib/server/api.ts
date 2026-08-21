import { error, type RequestEvent } from '@sveltejs/kit';
import type { SessionUser } from './session';

/**
 * Shared bits for the /api routes. Much smaller than the `time` repo's
 * `_lib/http.ts` because SvelteKit already provides `json()` and `error()`.
 */

/** The D1 binding, or a 503 if the platform is missing (e.g. plain `vite build`). */
export function db(event: RequestEvent): any {
  const binding = event.platform?.env?.DB;
  if (!binding) {
    error(503, 'The database is not available. Accounts are offline right now.');
  }
  return binding;
}

/** The whole platform env, for endpoints that also need the email secrets. */
export function env(event: RequestEvent): any {
  const value = event.platform?.env;
  if (!value) error(503, 'The server is not available right now.');
  return value;
}

export function requireUser(event: RequestEvent): SessionUser {
  if (!event.locals.user) error(401, 'Sign in required.');
  return event.locals.user;
}

export async function readJson(event: RequestEvent): Promise<any> {
  try {
    return await event.request.json();
  } catch {
    error(400, 'Invalid JSON body.');
  }
}

export function clientIp(event: RequestEvent): string {
  return event.request.headers.get('CF-Connecting-IP') ?? 'local';
}

/** Runs work after the response without blocking it, when the platform allows. */
export function background(event: RequestEvent, work: Promise<unknown>): void {
  const ctx = event.platform?.context;
  if (ctx?.waitUntil) ctx.waitUntil(work);
  else void work.catch((e) => console.error('Background task failed:', e));
}

/** UTC day number — the unit daily bonuses and quests are keyed on. */
export function utcDay(at = Date.now()): number {
  return Math.floor(at / 86_400_000);
}
