import { describe, expect, it } from 'vitest';
import { INTRO_QUESTS, FIRST_MATCH } from '$lib/quests/intro';
import { claimIntroQuest, introQuests, reportIntroProgress } from './intro';

/**
 * An in-memory stand-in for the three tables `intro.ts` touches, modelling the
 * properties under test: the (user, quest) primary key, the guarded claim that
 * changes a row only when `claimed = 0`, and the balances the grant moves.
 */
function fakeDb() {
  const intro = new Map<string, { progress: number; claimed: boolean }>();
  const awards = new Map<string, number>();
  const profile = { gold: 0, packs: 0 };

  const apply = async (sql: string, args: any[]) => {
    if (sql.includes('INSERT INTO intro_quests')) {
      const [, questId, step] = args;
      const row = intro.get(questId) ?? { progress: 0, claimed: false };
      intro.set(questId, { ...row, progress: row.progress + step });
      return { meta: { changes: 1 } };
    }
    if (sql.includes('UPDATE intro_quests SET claimed = 1')) {
      const questId = args[1];
      const row = intro.get(questId);
      if (!row || row.claimed) return { meta: { changes: 0 } };
      intro.set(questId, { ...row, claimed: true });
      return { meta: { changes: 1 } };
    }
    if (sql.includes('UPDATE profiles SET gold = gold + ?1, packs = packs + ?2')) {
      profile.gold += args[0];
      profile.packs += args[1];
      return { meta: { changes: 1 } };
    }
    if (sql.includes('INSERT OR IGNORE INTO gold_awards')) {
      const key = `${args[0]}|${sql.includes("'back'") ? 'back' : 'intro'}|${args[1]}`;
      if (!awards.has(key)) awards.set(key, sql.includes("'back'") ? 0 : args[2]);
      return { meta: { changes: 1 } };
    }
    return { meta: { changes: 0 } };
  };

  const statement = (sql: string, args: any[] = []): any => ({
    sql,
    args,
    bind: (...next: any[]) => statement(sql, next),
    async first() {
      if (sql.includes('SELECT progress, claimed FROM intro_quests')) {
        const row = intro.get(args[1]);
        return row ? { progress: row.progress, claimed: row.claimed ? 1 : 0 } : null;
      }
      if (sql.includes('SELECT gold FROM profiles')) return { gold: profile.gold };
      return null;
    },
    async all() {
      if (sql.includes('SELECT quest_id, progress, claimed FROM intro_quests')) {
        return {
          results: [...intro].map(([quest_id, row]) => ({
            quest_id,
            progress: row.progress,
            claimed: row.claimed ? 1 : 0
          }))
        };
      }
      return { results: [] };
    },
    run: async () => apply(sql, args)
  });

  return {
    prepare: (sql: string) => statement(sql),
    async batch(statements: any[]) {
      const out = [];
      for (const s of statements) out.push(await apply(s.sql, s.args));
      return out;
    },
    _profile: () => ({ ...profile }),
    _backs: () => [...awards.keys()].filter((k) => k.includes('|back|')).map((k) => k.split('|')[2]),
    _force: (questId: string, progress: number) => intro.set(questId, { progress, claimed: false })
  };
}

const won = (db: any, times: number) =>
  Promise.all(Array.from({ length: times }, () => reportIntroProgress(db, 'u1', 'wins', 1)));

describe('the intro track', () => {
  it('shows only the first quest until a match has been played', async () => {
    const db = fakeDb();
    expect((await introQuests(db, 'u1')).map((q) => q.id)).toEqual([FIRST_MATCH]);

    await reportIntroProgress(db, 'u1', 'matches', 1);
    expect(await introQuests(db, 'u1')).toHaveLength(INTRO_QUESTS.length);
  });

  // A first match that is won should finish both quests, not just the visible one.
  it('advances hidden quests too', async () => {
    const db = fakeDb();
    await reportIntroProgress(db, 'u1', 'matches', 1);
    await won(db, 1);

    const rows = await introQuests(db, 'u1');
    expect(rows.find((q) => q.id === FIRST_MATCH)?.complete).toBe(true);
    expect(rows.find((q) => q.id === 'first-win')?.complete).toBe(true);
  });

  it('clamps a reported increment like the daily track does', async () => {
    const db = fakeDb();
    await reportIntroProgress(db, 'u1', 'wins', 999);
    await reportIntroProgress(db, 'u1', 'matches', 1);

    const rows = await introQuests(db, 'u1');
    expect(rows.find((q) => q.id === 'three-wins')?.progress).toBe(1);
  });
});

describe('claiming', () => {
  it('pays gold and packs together', async () => {
    const db = fakeDb();
    await reportIntroProgress(db, 'u1', 'matches', 1);

    const result = await claimIntroQuest(db, 'u1', FIRST_MATCH);
    expect(result.ok).toBe(true);
    expect(db._profile()).toEqual({ gold: 100, packs: 1 });
  });

  it('refuses a quest that is not finished', async () => {
    const db = fakeDb();
    const result = await claimIntroQuest(db, 'u1', FIRST_MATCH);
    expect(result.ok).toBe(false);
    expect(db._profile()).toEqual({ gold: 0, packs: 0 });
  });

  // The guard that matters: packs cannot be paid twice.
  it('pays once, however many times it is claimed', async () => {
    const db = fakeDb();
    await reportIntroProgress(db, 'u1', 'matches', 1);

    await claimIntroQuest(db, 'u1', FIRST_MATCH);
    const second = await claimIntroQuest(db, 'u1', FIRST_MATCH);

    expect(second.ok).toBe(false);
    expect(second.reason).toBe('Already claimed.');
    expect(db._profile()).toEqual({ gold: 100, packs: 1 });
  });

  it('unlocks the card back with the three-win reward', async () => {
    const db = fakeDb();
    db._force('three-wins', 3);

    const result = await claimIntroQuest(db, 'u1', 'three-wins');
    expect(result.ok).toBe(true);
    expect(result.awardedPacks).toBe(5);
    expect(db._backs()).toEqual(['ascendant']);
  });

  it('hands over 7 packs and 200 gold in total', async () => {
    const db = fakeDb();
    for (const quest of INTRO_QUESTS) db._force(quest.id, quest.target);
    for (const quest of INTRO_QUESTS) await claimIntroQuest(db, 'u1', quest.id);

    // The measured basis of the day-one curve in DECISIONS.md §13.
    expect(db._profile()).toEqual({ gold: 200, packs: 7 });
  });

  it('empties the track once every quest is claimed', async () => {
    const db = fakeDb();
    for (const quest of INTRO_QUESTS) db._force(quest.id, quest.target);
    for (const quest of INTRO_QUESTS) await claimIntroQuest(db, 'u1', quest.id);

    expect(await introQuests(db, 'u1')).toEqual([]);
  });
});
