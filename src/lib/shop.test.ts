import { describe, expect, it } from 'vitest';
import { CARD_BACKS, allCardBackIds, purchasableBackIds } from './shop';

describe('the card back catalogue', () => {
  it('keeps the unlock-only back out of the shop', () => {
    expect(allCardBackIds()).toContain('ascendant');
    expect(purchasableBackIds()).not.toContain('ascendant');
  });

  it('has a unique id for every back', () => {
    expect(new Set(CARD_BACKS.map((b) => b.id)).size).toBe(CARD_BACKS.length);
  });
});
