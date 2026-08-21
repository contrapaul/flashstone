import { json, error, type RequestHandler } from '@sveltejs/kit';
import { db, requireUser } from '$lib/server/api';
import { rateLimit } from '$lib/server/ratelimit';
import { buyPack } from '$lib/server/shop';

/**
 * Buys and opens a pack. The seed is generated **here** — a client-supplied one
 * would let a player roll for a good pack and only then commit the gold.
 */
export const POST: RequestHandler = async (event) => {
  const DB = db(event);
  const user = requireUser(event);

  await rateLimit({ DB }, `buy-pack:${user.id}`, 120, 60 * 60 * 1000);

  const seed = crypto.getRandomValues(new Uint32Array(1))[0];
  const result = await buyPack(DB, user.id, seed);
  if (!result.ok) error(400, result.reason ?? 'Could not buy a pack.');

  return json({
    gold: result.gold,
    pack: result.pack?.map((p) => ({ cardId: p.card.id, gold: p.gold, isNew: p.isNew }))
  });
};
