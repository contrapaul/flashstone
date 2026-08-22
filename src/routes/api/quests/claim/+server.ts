import { json, type RequestHandler } from '@sveltejs/kit';
import { db, readJson, requireUser } from '$lib/server/api';
import { claimQuest } from '$lib/server/quests';
import { claimIntroQuest } from '$lib/server/intro';
import { isIntroQuest } from '$lib/quests/intro';

/**
 * One endpoint for both tracks. They pay differently — a daily quest pays gold,
 * an intro quest can pay packs or a card back — but the player is pressing the
 * same button, and splitting the route would only move the branch into the UI.
 */
export const POST: RequestHandler = async (event) => {
  const DB = db(event);
  const user = requireUser(event);
  const body = await readJson(event);
  const questId = String(body.questId ?? '');

  if (isIntroQuest(questId)) return json(await claimIntroQuest(DB, user.id, questId));
  return json(await claimQuest(DB, user.id, questId));
};
