import { describe, expect, it } from 'vitest';
import { GOLD, award, claimDailyLogin } from './gold';
import { utcDay } from './api';

/**
 * A tiny in-memory stand-in for the two tables `gold.ts` touches. It models the
 * one property under test — the (user, source, ref) primary key — so the
 * idempotence claim is checked rather than assumed.
 */
function fakeDb() {
  const awards = new Map<string, number>();
  const profiles = new Map<string, number>([['u1', 0]]);

  const run = async (sql: string, args: any[]) => {
    if (sql.includes('INSERT INTO gold_awards')) {
      const [userId, source, ref, amount] = args;
      const key = `${userId}|${source}|${ref}`;
      if (awards.has(key)) throw new Error('UNIQUE constraint failed');
      awards.set(key, amount);
    } else if (sql.includes('UPDATE profiles SET gold = gold +')) {
      const [amount, userId] = args;
      profiles.set(userId, (profiles.get(userId) ?? 0) + amount);
    }
  };

  const statement = (sql: string) => ({
    sql,
    args: [] as any[],
    bind(...args: any[]) {
      return { ...statement(sql), args, sql };
    },
    async first() {
      const { sql: s, args } = this as any;
      if (s.includes('SELECT amount FROM gold_awards')) {
        const key = `${args[0]}|${args[1]}|${args[2]}`;
        return awards.has(key) ? { amount: awards.get(key) } : null;
      }
      if (s.includes('SELECT gold FROM profiles')) return { gold: profiles.get(args[0]) ?? 0 };
      return null;
    },
    async run() {
      await run((this as any).sql, (this as any).args);
      return {};
    }
  });

  return {
    prepare: (sql: string) => statement(sql),
    async batch(statements: any[]) {
      for (const s of statements) await run(s.sql, s.args);
    },
    _gold: () => profiles.get('u1') ?? 0,
    _awardCount: () => awards.size
  };
}

describe('gold awards', () => {
  it('pays once and raises the balance', async () => {
    const db = fakeDb();
    const result = await award(db, 'u1', 'win', 'match-1', GOLD.winVsAi);
    expect(result.awarded).toBe(GOLD.winVsAi);
    expect(db._gold()).toBe(GOLD.winVsAi);
  });

  // Replaying a reward request must not pay twice.
  it('is idempotent for the same source and ref', async () => {
    const db = fakeDb();
    await award(db, 'u1', 'win', 'match-1', GOLD.winVsAi);
    const second = await award(db, 'u1', 'win', 'match-1', GOLD.winVsAi);

    expect(second.awarded).toBe(0);
    expect(second.alreadyClaimed).toBe(true);
    expect(db._gold()).toBe(GOLD.winVsAi);
    expect(db._awardCount()).toBe(1);
  });

  it('pays again for a different match', async () => {
    const db = fakeDb();
    await award(db, 'u1', 'win', 'match-1', GOLD.winVsAi);
    await award(db, 'u1', 'win', 'match-2', GOLD.winVsAi);
    expect(db._gold()).toBe(GOLD.winVsAi * 2);
  });

  it('pays nothing for a non-positive amount', async () => {
    const db = fakeDb();
    expect((await award(db, 'u1', 'win', 'm', 0)).awarded).toBe(0);
    expect((await award(db, 'u1', 'win', 'm', -5)).awarded).toBe(0);
    expect(db._awardCount()).toBe(0);
  });

  it('pays the daily bonus once per UTC day', async () => {
    const db = fakeDb();
    const first = await claimDailyLogin(db, 'u1');
    const second = await claimDailyLogin(db, 'u1');

    expect(first.awarded).toBe(GOLD.dailyLogin);
    expect(second.awarded).toBe(0);
    expect(db._gold()).toBe(GOLD.dailyLogin);
  });

  it('keys the daily bonus on the day number, not elapsed hours', async () => {
    const db = fakeDb();
    await claimDailyLogin(db, 'u1');
    // The next day is a different ref, so it pays again.
    const tomorrow = await award(db, 'u1', 'daily', String(utcDay() + 1), GOLD.dailyLogin);
    expect(tomorrow.awarded).toBe(GOLD.dailyLogin);
  });
});
