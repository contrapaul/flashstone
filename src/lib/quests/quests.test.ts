import { describe, expect, it } from 'vitest';
import {
  MAX_INCREMENT,
  QUESTS,
  QUESTS_PER_DAY,
  clampIncrement,
  displayProgress,
  isComplete,
  questById,
  questsForDay
} from './quests';

describe('quest definitions', () => {
  it('has the five quests from DECISIONS.md §4', () => {
    expect(QUESTS.map((q) => q.id).sort()).toEqual(
      ['build', 'cast10', 'play30', 'review5', 'win2'].sort()
    );
  });

  it('matches the agreed targets and rewards', () => {
    const byId = Object.fromEntries(QUESTS.map((q) => [q.id, q]));
    expect([byId.win2.target, byId.win2.reward]).toEqual([2, 75]);
    expect([byId.play30.target, byId.play30.reward]).toEqual([30, 50]);
    expect([byId.cast10.target, byId.cast10.reward]).toEqual([10, 50]);
    expect([byId.build.target, byId.build.reward]).toEqual([1, 40]);
    expect([byId.review5.target, byId.review5.reward]).toEqual([300, 40]);
  });

  it('resolves each quest by id', () => {
    for (const quest of QUESTS) expect(questById(quest.id)).toBe(quest);
    expect(questById('nonsense')).toBeUndefined();
  });
});

describe('the daily selection', () => {
  it('offers three distinct quests', () => {
    for (let day = 0; day < 400; day++) {
      const chosen = questsForDay(day);
      expect(chosen, `day ${day}`).toHaveLength(QUESTS_PER_DAY);
      expect(new Set(chosen.map((q) => q.id)).size, `day ${day}`).toBe(QUESTS_PER_DAY);
    }
  });

  it('is stable for a day, so a refresh does not reroll', () => {
    expect(questsForDay(20250).map((q) => q.id)).toEqual(questsForDay(20250).map((q) => q.id));
  });

  it('changes between days', () => {
    const today = questsForDay(20250).map((q) => q.id).join();
    const week = [20251, 20252, 20253, 20254].map((d) => questsForDay(d).map((q) => q.id).join());
    expect(week.some((set) => set !== today)).toBe(true);
  });

  it('reaches every quest over time, not just the first three', () => {
    const seen = new Set<string>();
    for (let day = 0; day < 200; day++) for (const q of questsForDay(day)) seen.add(q.id);
    expect(seen.size).toBe(QUESTS.length);
  });
});

describe('clamping client-reported progress', () => {
  // The server cannot see a card being played, so it must not believe a number.
  it('clamps an absurd increment to the per-metric maximum', () => {
    expect(clampIncrement('cardsPlayed', 10_000)).toBe(MAX_INCREMENT.cardsPlayed);
    expect(clampIncrement('wins', 99)).toBe(1);
    expect(clampIncrement('reviewSeconds', 86_400)).toBe(MAX_INCREMENT.reviewSeconds);
  });

  it('passes an ordinary increment through', () => {
    expect(clampIncrement('cardsPlayed', 1)).toBe(1);
    expect(clampIncrement('reviewSeconds', 30)).toBe(30);
  });

  it('rejects zero, negatives and nonsense', () => {
    expect(clampIncrement('wins', 0)).toBe(0);
    expect(clampIncrement('wins', -5)).toBe(0);
    expect(clampIncrement('wins', NaN)).toBe(0);
    // Infinity is not a count. It is rejected outright rather than clamped to
    // the maximum, so a garbage payload advances nothing at all.
    expect(clampIncrement('wins', Infinity)).toBe(0);
  });

  it('floors fractional increments', () => {
    expect(clampIncrement('cardsPlayed', 2.9)).toBe(2);
  });
});

describe('completion', () => {
  const play30 = QUESTS.find((q) => q.id === 'play30')!;

  it('completes at exactly the target', () => {
    expect(isComplete(play30, 29)).toBe(false);
    expect(isComplete(play30, 30)).toBe(true);
    expect(isComplete(play30, 31)).toBe(true);
  });

  it('never displays past the target', () => {
    expect(displayProgress(play30, 45)).toBe(30);
    expect(displayProgress(play30, 12)).toBe(12);
  });
});
