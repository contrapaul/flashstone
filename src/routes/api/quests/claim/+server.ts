import { json, type RequestHandler } from '@sveltejs/kit';
import { db, readJson, requireUser } from '$lib/server/api';
import { claimQuest } from '$lib/server/quests';

export const POST: RequestHandler = async (event) => {
  const user = requireUser(event);
  const body = await readJson(event);
  return json(await claimQuest(db(event), user.id, String(body.questId ?? '')));
};
