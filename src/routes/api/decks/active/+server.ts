import { json, error, type RequestHandler } from '@sveltejs/kit';
import { db, readJson, requireUser } from '$lib/server/api';
import { activeDeckId, setActiveDeck } from '$lib/server/collection';

/**
 * Which deck the player takes into a match.
 *
 * Both the practice route and the online match room read this, so it is the one
 * place that decides — including the hero power, which is why it is owner-
 * scoped rather than trusted from whoever asks.
 */
export const POST: RequestHandler = async (event) => {
  const DB = db(event);
  const user = requireUser(event);
  const body = await readJson(event);
  const id = String(body.id ?? '');
  if (!id) error(400, 'Missing deck id.');

  if (!(await setActiveDeck(DB, user.id, id))) error(404, 'No such deck.');
  return json({ ok: true, activeId: await activeDeckId(DB, user.id) });
};
