import { json, error, type RequestHandler } from '@sveltejs/kit';
import { db, readJson, requireUser } from '$lib/server/api';
import { rateLimit } from '$lib/server/ratelimit';
import { reportProgress } from '$lib/server/quests';
import { introQuests, reportIntroProgress } from '$lib/server/intro';
import { MAX_INCREMENT, type QuestMetric } from '$lib/quests/quests';

const METRICS = Object.keys(MAX_INCREMENT) as QuestMetric[];

/**
 * The client reports what it saw — a card played, a spell cast, review seconds.
 * The server clamps every increment before believing it (see quests.ts), and
 * rate-limits the endpoint so a crafted client cannot make up in volume what it
 * cannot make up in size.
 */
export const POST: RequestHandler = async (event) => {
  const DB = db(event);
  const user = requireUser(event);
  const body = await readJson(event);

  const metric = String(body.metric ?? '') as QuestMetric;
  if (!METRICS.includes(metric)) error(400, 'Unknown metric.');

  await rateLimit({ DB }, `quest-progress:${user.id}`, 400, 60 * 60 * 1000);

  const amount = Number(body.amount ?? 0);
  // Both tracks watch the same metrics, and the same clamp applies to each.
  await reportIntroProgress(DB, user.id, metric, amount);
  const quests = await reportProgress(DB, user.id, metric, amount);

  return json({ quests, intro: await introQuests(DB, user.id) });
};
