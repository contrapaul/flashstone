import { describe, expect, it } from 'vitest';
import { buildAiDeck } from './aiDeck';
import { DECK_SIZE, copyLimitFor } from '../decks/deck';

describe('the opponent deck', () => {
  it('is a full deck', () => {
    expect(buildAiDeck(1)).toHaveLength(DECK_SIZE);
  });

  it('never exceeds a card limit', () => {
    const counts = new Map<string, number>();
    for (const card of buildAiDeck(7)) counts.set(card.id, (counts.get(card.id) ?? 0) + 1);
    for (const [id, n] of counts) {
      const card = buildAiDeck(7).find((c) => c.id === id)!;
      expect(n, id).toBeLessThanOrEqual(copyLimitFor(card.rarity));
    }
  });

  // The AI is the only place most players will meet these mechanics.
  it('always carries a weapon and an aimed spell', () => {
    for (const seed of [1, 2, 3, 99]) {
      const deck = buildAiDeck(seed);
      expect(deck.some((c) => c.type === 'Weapon'), `seed ${seed}`).toBe(true);
      expect(
        deck.some((c) => c.effects.some((e) => e.target === 'Chosen')),
        `seed ${seed}`
      ).toBe(true);
    }
  });

  it('keeps a playable low curve', () => {
    const deck = buildAiDeck(3);
    expect(deck.filter((c) => c.cost <= 3).length).toBeGreaterThanOrEqual(10);
  });

  it('is deterministic for a seed', () => {
    expect(buildAiDeck(5).map((c) => c.id)).toEqual(buildAiDeck(5).map((c) => c.id));
  });
});
