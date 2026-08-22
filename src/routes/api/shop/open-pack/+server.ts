import { json, error, type RequestHandler } from '@sveltejs/kit';
import { db, requireUser } from '$lib/server/api';
import { rateLimit } from '$lib/server/ratelimit';
import { openOwnedPack } from '$lib/server/shop';

/**
 * Opens a pack from the inventory — one awarded by the intro track rather than
 * bought. Separate from `buy-pack` because what it spends is different; the
 * seed is generated here for the same reason it is there.
 */
export const POST: RequestHandler = async (event) => {
  const DB = db(event);
  const user = requireUser(event);

  await rateLimit({ DB }, `open-pack:${user.id}`, 120, 60 * 60 * 1000);

  const seed = crypto.getRandomValues(new Uint32Array(1))[0];
  const result = await openOwnedPack(DB, user.id, seed);
  if (!result.ok) error(400, result.reason ?? 'Could not open a pack.');

  return json({
    gold: result.gold,
    pack: result.pack?.map((p) => ({ cardId: p.card.id, gold: p.gold, isNew: p.isNew }))
  });
};
