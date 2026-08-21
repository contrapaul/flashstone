import { utcDay } from './api';

/**
 * Gold, written only by the server.
 *
 * Every award is recorded in `gold_awards` under a key that identifies the
 * thing being paid for — the day for a login bonus, the match id for a win, the
 * quest and day for a quest. Awarding is therefore idempotent by construction:
 * a replayed request hits the primary key and pays nothing, rather than relying
 * on the client not to retry.
 */

export const GOLD = {
  dailyLogin: 50,
  winVsAi: 25,
  winOnline: 40
} as const;

export interface AwardResult {
  awarded: number;
  gold: number;
  alreadyClaimed: boolean;
}

async function currentGold(DB: any, userId: string): Promise<number> {
  const row = await DB.prepare('SELECT gold FROM profiles WHERE user_id = ?1').bind(userId).first();
  return (row?.gold as number) ?? 0;
}

/**
 * Pays `amount` for (source, ref), once ever.
 *
 * The insert and the balance update go in one `batch`, which D1 runs as a
 * transaction — so a crash cannot record an award without paying it, or pay
 * without recording it.
 */
export async function award(
  DB: any,
  userId: string,
  source: string,
  ref: string,
  amount: number
): Promise<AwardResult> {
  if (amount <= 0) return { awarded: 0, gold: await currentGold(DB, userId), alreadyClaimed: false };

  const claimed = await DB.prepare(
    'SELECT amount FROM gold_awards WHERE user_id = ?1 AND source = ?2 AND ref = ?3'
  )
    .bind(userId, source, ref)
    .first();
  if (claimed) {
    return { awarded: 0, gold: await currentGold(DB, userId), alreadyClaimed: true };
  }

  await DB.batch([
    DB.prepare(
      'INSERT INTO gold_awards (user_id, source, ref, amount, created_at) VALUES (?1, ?2, ?3, ?4, ?5)'
    ).bind(userId, source, ref, amount, Date.now()),
    DB.prepare('UPDATE profiles SET gold = gold + ?1 WHERE user_id = ?2').bind(amount, userId)
  ]);

  return { awarded: amount, gold: await currentGold(DB, userId), alreadyClaimed: false };
}

/**
 * The once-a-day login bonus.
 *
 * Keyed on the **UTC day number**, not on hours since the last claim — the
 * elapsed-time version drifts an hour later every day until a player who plays
 * each morning starts missing it.
 */
export async function claimDailyLogin(DB: any, userId: string): Promise<AwardResult> {
  const day = utcDay();
  const result = await award(DB, userId, 'daily', String(day), GOLD.dailyLogin);
  if (result.awarded > 0) {
    await DB.prepare('UPDATE profiles SET last_login = ?1 WHERE user_id = ?2')
      .bind(day, userId)
      .run();
  }
  return result;
}
