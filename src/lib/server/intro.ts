import {
  INTRO_QUESTS,
  introQuestById,
  visibleIntroQuests,
  type IntroQuestDef
} from '$lib/quests/intro';
import { clampIncrement, type QuestMetric } from '$lib/quests/quests';

/**
 * The intro quest track, server-side (DECISIONS.md §13).
 *
 * Reads like `server/quests.ts` and differs in exactly two ways: there is no
 * day, and a reward can be packs or a card back rather than gold. The second is
 * why the payment guard is the `claimed` flag rather than a `gold_awards` row —
 * a row keyed on an amount cannot make "give five packs" idempotent.
 */

export interface IntroRow {
  id: string;
  label: string;
  detail: string;
  target: number;
  gold: number;
  packs: number;
  back?: string;
  progress: number;
  claimed: boolean;
  complete: boolean;
}

interface Stored {
  progress: number;
  claimed: boolean;
}

async function storedFor(DB: any, userId: string): Promise<Map<string, Stored>> {
  const { results } = await DB.prepare(
    'SELECT quest_id, progress, claimed FROM intro_quests WHERE user_id = ?1'
  )
    .bind(userId)
    .all();

  const byId = new Map<string, Stored>();
  for (const row of results ?? []) {
    byId.set(row.quest_id as string, {
      progress: row.progress as number,
      claimed: !!row.claimed
    });
  }
  return byId;
}

function present(def: IntroQuestDef, stored: Stored | undefined): IntroRow {
  const progress = stored?.progress ?? 0;
  return {
    id: def.id,
    label: def.label,
    detail: def.detail,
    target: def.target,
    gold: def.gold,
    packs: def.packs,
    back: def.back,
    progress: Math.min(progress, def.target),
    claimed: stored?.claimed ?? false,
    complete: progress >= def.target
  };
}

/**
 * The intro quests this player should see, or an empty list once every one has
 * been claimed — the track is a runway, and it should disappear behind them.
 */
export async function introQuests(DB: any, userId: string): Promise<IntroRow[]> {
  const stored = await storedFor(DB, userId);
  if (INTRO_QUESTS.every((q) => stored.get(q.id)?.claimed)) return [];
  return visibleIntroQuests((id) => stored.get(id)?.progress ?? 0).map((def) =>
    present(def, stored.get(def.id))
  );
}

/**
 * Advances every intro quest that watches `metric`, including ones the player
 * cannot see yet — a first win should complete "win a game" as well as "play
 * your first match", not be spent on whichever happens to be on screen.
 */
export async function reportIntroProgress(
  DB: any,
  userId: string,
  metric: QuestMetric,
  amount: number
): Promise<void> {
  const step = clampIncrement(metric, amount);
  const watching = INTRO_QUESTS.filter((q) => q.metric === metric);
  if (step <= 0 || watching.length === 0) return;

  await DB.batch(
    watching.map((def) =>
      DB.prepare(
        `INSERT INTO intro_quests (user_id, quest_id, progress) VALUES (?1, ?2, ?3)
         ON CONFLICT(user_id, quest_id) DO UPDATE SET progress = progress + ?3`
      ).bind(userId, def.id, step)
    )
  );
}

export interface IntroClaimResult {
  ok: boolean;
  reason?: string;
  gold: number;
  awardedGold: number;
  awardedPacks: number;
  awardedBack?: string;
  intro: IntroRow[];
}

async function balance(DB: any, userId: string): Promise<number> {
  const row = await DB.prepare('SELECT gold FROM profiles WHERE user_id = ?1').bind(userId).first();
  return (row?.gold as number) ?? 0;
}

/**
 * Pays out an intro quest, once ever.
 *
 * The claim itself is the guarded write — `SET claimed = 1 WHERE claimed = 0`,
 * which changes a row for exactly one of two racing requests. Only then is
 * anything granted, so the worst a race can do is fail to pay, which the player
 * can retry, rather than pay twice, which they cannot undo.
 */
export async function claimIntroQuest(
  DB: any,
  userId: string,
  questId: string
): Promise<IntroClaimResult> {
  const def = introQuestById(questId);

  const fail = async (reason: string): Promise<IntroClaimResult> => ({
    ok: false,
    reason,
    gold: await balance(DB, userId),
    awardedGold: 0,
    awardedPacks: 0,
    intro: await introQuests(DB, userId)
  });

  if (!def) return fail('No such quest.');

  const row = await DB.prepare(
    'SELECT progress, claimed FROM intro_quests WHERE user_id = ?1 AND quest_id = ?2'
  )
    .bind(userId, questId)
    .first();

  if (((row?.progress as number) ?? 0) < def.target) return fail('That quest is not finished yet.');
  if (row?.claimed) return fail('Already claimed.');

  const claimed = await DB.prepare(
    'UPDATE intro_quests SET claimed = 1 WHERE user_id = ?1 AND quest_id = ?2 AND claimed = 0'
  )
    .bind(userId, questId)
    .run();
  if ((claimed?.meta?.changes ?? 1) === 0) return fail('Already claimed.');

  const statements = [
    DB.prepare('UPDATE profiles SET gold = gold + ?1, packs = packs + ?2 WHERE user_id = ?3').bind(
      def.gold,
      def.packs,
      userId
    ),
    // Recorded alongside every other award, so "what has this account earned"
    // stays one query. `OR IGNORE` because the claimed flag above is the
    // authority — this row is the audit trail, not the guard.
    DB.prepare(
      `INSERT OR IGNORE INTO gold_awards (user_id, source, ref, amount, created_at)
       VALUES (?1, 'intro', ?2, ?3, ?4)`
    ).bind(userId, questId, def.gold, Date.now())
  ];

  if (def.back) {
    // Card back ownership is a `gold_awards` row with source 'back'; an unlocked
    // one costs nothing, so the amount is 0 rather than a negative price.
    statements.push(
      DB.prepare(
        `INSERT OR IGNORE INTO gold_awards (user_id, source, ref, amount, created_at)
         VALUES (?1, 'back', ?2, 0, ?3)`
      ).bind(userId, def.back, Date.now())
    );
  }

  await DB.batch(statements);

  return {
    ok: true,
    gold: await balance(DB, userId),
    awardedGold: def.gold,
    awardedPacks: def.packs,
    awardedBack: def.back,
    intro: await introQuests(DB, userId)
  };
}
