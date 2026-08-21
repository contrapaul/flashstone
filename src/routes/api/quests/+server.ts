import { json, type RequestHandler } from '@sveltejs/kit';
import { db, requireUser } from '$lib/server/api';
import { todaysQuests } from '$lib/server/quests';

export const GET: RequestHandler = async (event) => {
  const user = requireUser(event);
  return json({ quests: await todaysQuests(db(event), user.id) });
};
