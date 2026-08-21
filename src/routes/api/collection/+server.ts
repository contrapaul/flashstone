import { json, type RequestHandler } from '@sveltejs/kit';
import { db, requireUser } from '$lib/server/api';
import { loadOwned } from '$lib/server/collection';

/** The signed-in player's collection. Read-only — packs are the only way in. */
export const GET: RequestHandler = async (event) => {
  const user = requireUser(event);
  return json({ owned: await loadOwned(db(event), user.id) });
};
