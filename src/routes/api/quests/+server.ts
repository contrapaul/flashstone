import { json, type RequestHandler } from '@sveltejs/kit';
import { db, requireUser } from '$lib/server/api';
import { todaysQuests } from '$lib/server/quests';
import { introQuests } from '$lib/server/intro';

export const GET: RequestHandler = async (event) => {
  const DB = db(event);
  const user = requireUser(event);
  return json({
    quests: await todaysQuests(DB, user.id),
    // Empty once the new-player track is finished, which is how the panel knows
    // to stop showing it.
    intro: await introQuests(DB, user.id)
  });
};
