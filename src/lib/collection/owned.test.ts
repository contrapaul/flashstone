import { describe, expect, it } from 'vitest';
import { ALL_CARDS } from '../data/cards';
import { starterCollection } from '../data/starter';
import {
  MAX_OWNED,
  addCopies,
  goldCount,
  incompleteCardIds,
  isComplete,
  isGold,
  ownedCards,
  ownedCount,
  totalCopies,
  upgradeToGold,
  type Owned
} from './owned';

const A = ALL_CARDS[0].id;
const B = ALL_CARDS[1].id;

function complete(): Owned {
  const owned: Owned = {};
  for (const card of ALL_CARDS) owned[card.id] = { copies: 2, gold: 0 };
  return owned;
}

describe('addCopies', () => {
  it('grants a first copy', () => {
    expect(ownedCount(addCopies({}, A), A)).toBe(1);
  });

  it('clamps at two', () => {
    let owned = addCopies({}, A, 5);
    expect(ownedCount(owned, A)).toBe(MAX_OWNED);
    owned = addCopies(owned, A, 3);
    expect(ownedCount(owned, A)).toBe(MAX_OWNED);
  });

  it('does not mutate its input', () => {
    const before: Owned = {};
    addCopies(before, A);
    expect(before[A]).toBeUndefined();
  });

  it('ignores a non-positive count', () => {
    expect(addCopies({}, A, 0)).toEqual({});
  });

  it('leaves gold alone', () => {
    const owned = addCopies(upgradeToGold({}, A), A);
    expect(goldCount(owned, A)).toBe(1);
    expect(ownedCount(owned, A)).toBe(2);
  });
});

describe('gold variants', () => {
  // DECISIONS.md §10 — a gold copy overrides a standard one rather than adding
  // to the total, so a gold roll on a maxed-out card is an upgrade, not a waste.
  it('upgrades a copy instead of being wasted when both copies are owned', () => {
    const owned = upgradeToGold(addCopies({}, A, 2), A);
    expect(ownedCount(owned, A)).toBe(2);
    expect(goldCount(owned, A)).toBe(1);
  });

  it('overrides both copies when two golds land', () => {
    const owned = upgradeToGold(addCopies({}, A, 2), A, 2);
    expect(ownedCount(owned, A)).toBe(2);
    expect(goldCount(owned, A)).toBe(2);
  });

  it('grants the card when a gold arrives for one not owned', () => {
    const owned = upgradeToGold({}, A);
    expect(ownedCount(owned, A)).toBe(1);
    expect(goldCount(owned, A)).toBe(1);
  });

  it('never lets gold exceed copies', () => {
    const owned = upgradeToGold(addCopies({}, A, 1), A, 5);
    expect(goldCount(owned, A)).toBeLessThanOrEqual(ownedCount(owned, A));
    expect(goldCount(owned, A)).toBe(1);
  });

  it('reports whether a card is shown as gold', () => {
    expect(isGold(addCopies({}, A), A)).toBe(false);
    expect(isGold(upgradeToGold({}, A), A)).toBe(true);
  });
});

describe('reading a collection', () => {
  it('lists owned cards and skips ids that left the registry', () => {
    const owned: Owned = { [A]: { copies: 1, gold: 0 }, 'gone-card': { copies: 2, gold: 0 } };
    expect(ownedCards(owned).map((c) => c.id)).toEqual([A]);
  });

  it('counts total copies', () => {
    expect(totalCopies({ [A]: { copies: 2, gold: 1 }, [B]: { copies: 1, gold: 0 } })).toBe(3);
  });

  it('returns zero for anything unowned', () => {
    expect(ownedCount({}, A)).toBe(0);
    expect(goldCount({}, A)).toBe(0);
  });
});

describe('completion', () => {
  it('is false for the starter collection', () => {
    expect(isComplete(starterCollection())).toBe(false);
  });

  it('is true only when every card is held at two copies', () => {
    const owned = complete();
    expect(isComplete(owned)).toBe(true);

    const short = { ...owned, [A]: { copies: 1 as const, gold: 0 as const } };
    expect(isComplete(short)).toBe(false);
  });

  it('lists what a pack could still deal', () => {
    expect(incompleteCardIds(complete())).toEqual([]);
    expect(incompleteCardIds({})).toHaveLength(ALL_CARDS.length);
    expect(incompleteCardIds(starterCollection())).toHaveLength(ALL_CARDS.length - 15);
  });

  // DECISIONS.md §9 — new cards must move the finish line, never strand a
  // player past it, so completion is derived and never cached.
  it('is derived from the live registry, not a stored number', () => {
    const owned = complete();
    expect(isComplete(owned)).toBe(true);
    const withNewCard: Owned = { ...owned };
    delete withNewCard[ALL_CARDS[ALL_CARDS.length - 1].id];
    expect(isComplete(withNewCard)).toBe(false);
  });
});
