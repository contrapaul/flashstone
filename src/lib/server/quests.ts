import {
  QUESTS_PER_DAY,
  clampIncrement,
  isComplete,
  questById,
  questsForDay,
  type QuestDef,
  type QuestMetric
} from '$lib/quests/quests';
import { utcDay } from './api';
import { award } from './gold';

/**
 * Quest progress, server-side.
 *
 * The client is the only witness to a card being played, so it reports
 * increments and the server clamps them. Rewards are paid through `award`, so a
 * claim is idempotent for exactly the same reason a daily bonus is.
 */

export interface QuestRow {
  id: string;
  label: string;
  detail: string;
  target: number;
  reward: number;
  progress: number;
  claimed: boolean;
  complete: boolean;
}

async function progressFor(DB: any, userId: string, day: number): Promise<Map<string, QuestRow>> {
  const { results } = await DB.prepare(
    'SELECT quest_id, progress, claimed FROM quests WHERE user_id = ?1 AND day = ?2'
  )
    .bind(userId, day)
    .all();

  const byId = new Map<string, QuestRow>();
  for (const row of results ?? []) {
    byId.set(row.quest_id as string, {
      id: row.quest_id as string,
      label: '',
      detail: '',
      target: 0,
      reward: 0,
      progress: row.progress as number,
      claimed: !!row.claimed,
      complete: false
    });
  }
  return byId;
}

function present(def: QuestDef, stored: QuestRow | undefined): QuestRow {
  const progress = stored?.progress ?? 0;
  return {
    id: def.id,
    label: def.label,
    detail: def.detail,
    target: def.target,
    reward: def.reward,
    progress: Math.min(progress, def.target),
    claimed: stored?.claimed ?? false,
    complete: isComplete(def, progress)
  };
}

/** Today's three quests with the player's progress against each. */
export async function todaysQuests(DB: any, userId: string): Promise<QuestRow[]> {
  const day = utcDay();
  const stored = await progressFor(DB, userId, day);
  return questsForDay(day).map((def) => present(def, stored.get(def.id)));
}

/**
 * Advances every active quest that watches `metric`.
 *
 * The increment is clamped per metric before it is trusted — a request claiming
 * 10,000 cards played advances by the cap, not by 10,000. Only quests active
 * today are touched, so reporting against an inactive one is a no-op rather
 * than banked progress waiting for that quest to come round.
 */
export async function reportProgress(
  DB: any,
  userId: string,
  metric: QuestMetric,
  amount: number
): Promise<QuestRow[]> {
  const step = clampIncrement(metric, amount);
  const day = utcDay();
  const active = questsForDay(day).filter((q) => q.metric === metric);

  if (step > 0 && active.length > 0) {
    await DB.batch(
      active.map((def) =>
        DB.prepare(
          `INSERT INTO quests (user_id, day, quest_id, progress) VALUES (?1, ?2, ?3, ?4)
           ON CONFLICT(user_id, day, quest_id) DO UPDATE SET progress = progress + ?4`
        ).bind(userId, day, def.id, step)
      )
    );
  }

  return todaysQuests(DB, userId);
}

export interface ClaimResult {
  ok: boolean;
  reason?: string;
  awarded: number;
  gold: number;
  quests: QuestRow[];
}

/**
 * Pays out a completed quest, once.
 *
 * Two guards, not one: the `claimed` flag makes the UI honest, and the
 * `gold_awards` key on (user, 'quest', questId:day) makes double payment
 * impossible even if two requests race past the flag.
 */
export async function claimQuest(DB: any, userId: string, questId: string): Promise<ClaimResult> {
  const day = utcDay();
  const def = questById(questId);
  const active = questsForDay(day).some((q) => q.id === questId);

  const fail = async (reason: string): Promise<ClaimResult> => ({
    ok: false,
    reason,
    awarded: 0,
    gold: await currentGold(DB, userId),
    quests: await todaysQuests(DB, userId)
  });

  if (!def) return fail('No such quest.');
  if (!active) return fail('That quest is not active today.');

  const row = await DB.prepare(
    'SELECT progress, claimed FROM quests WHERE user_id = ?1 AND day = ?2 AND quest_id = ?3'
  )
    .bind(userId, day, questId)
    .first();

  const progress = (row?.progress as number) ?? 0;
  if (!isComplete(def, progress)) return fail('That quest is not finished yet.');
  if (row?.claimed) return fail('Already claimed.');

  const result = await award(DB, userId, 'quest', `${questId}:${day}`, def.reward);
  await DB.prepare(
    'UPDATE quests SET claimed = 1 WHERE user_id = ?1 AND day = ?2 AND quest_id = ?3'
  )
    .bind(userId, day, questId)
    .run();

  return {
    ok: result.awarded > 0,
    reason: result.alreadyClaimed ? 'Already claimed.' : undefined,
    awarded: result.awarded,
    gold: result.gold,
    quests: await todaysQuests(DB, userId)
  };
}

async function currentGold(DB: any, userId: string): Promise<number> {
  const row = await DB.prepare('SELECT gold FROM profiles WHERE user_id = ?1').bind(userId).first();
  return (row?.gold as number) ?? 0;
}

export { QUESTS_PER_DAY };
