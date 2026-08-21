import { json, error, type RequestHandler } from '@sveltejs/kit';
import { rateLimit } from '$lib/server/ratelimit';
import { db, readJson, requireUser } from '$lib/server/api';
import { GOLD, award } from '$lib/server/gold';

/**
 * A win against the AI.
 *
 * That match runs entirely on the client, so the client is the only witness —
 * there is nothing to verify against. Two things keep it honest enough: the
 * award is idempotent per match id, and it is rate-limited, so the worst case
 * is a determined player grinding at the speed of real matches rather than
 * looping a request. Online wins are awarded by the match itself in Phase 5 and
 * do not come through here.
 */
export const POST: RequestHandler = async (event) => {
  const DB = db(event);
  const user = requireUser(event);
  const body = await readJson(event);
  const matchId = String(body.matchId ?? '');

  if (!/^[a-zA-Z0-9-]{6,64}$/.test(matchId)) error(400, 'Missing or malformed match id.');

  // Well above any real rate of play, low enough to make looping pointless.
  await rateLimit({ DB }, `win:${user.id}`, 20, 60 * 60 * 1000);

  return json(await award(DB, user.id, 'win', matchId, GOLD.winVsAi));
};
