import type { Handle } from '@sveltejs/kit';
import { SESSION_COOKIE, getUserFromToken } from '$lib/server/session';

/**
 * Resolves the session cookie into `event.locals.user` on every request.
 *
 * Replaces the `functions/api/_middleware.ts` that the `time` repo uses —
 * Flashstone cannot use a `functions/` directory, because adapter-cloudflare
 * emits a `_worker.js` and Pages ignores `functions/` whenever one exists.
 *
 * A missing, tampered or expired cookie resolves to null rather than throwing:
 * being signed out is an ordinary state, not an error, and practice against the
 * AI has to keep working without an account.
 */
export const handle: Handle = async ({ event, resolve }) => {
  event.locals.user = null;

  const token = event.cookies.get(SESSION_COOKIE);
  if (token && event.platform?.env?.DB) {
    try {
      event.locals.user = await getUserFromToken(event.platform.env, token);
    } catch (e) {
      console.error('Session lookup failed:', e);
    }
  }

  return resolve(event);
};
