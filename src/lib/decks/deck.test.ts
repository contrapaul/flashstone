import { describe, expect, it } from 'vitest';
import { ALL_CARDS, cardById } from '../data/cards';
import { STARTER_CARD_IDS, starterCollection, starterDeck } from '../data/starter';
import { addCopies, ownedCount, type Owned } from '../collection/owned';
import {
  DECK_SIZE,
  LEGENDARY_COPIES,
  MAX_COPIES,
  addCard,
  allowedCopies,
  autoBuild,
  canAdd,
  copyLimitFor,
  countOf,
  deckEntries,
  deckProblems,
  distinctCount,
  emptyDeck,
  isLegal,
  maxDeckSize,
  pruneDeck,
  removeCard,
  resolveDeck
} from './deck';

const LEGENDARY = ALL_CARDS.find((c) => c.rarity === 'Legendary')!;
const COMMON = ALL_CARDS.find((c) => c.rarity === 'Common')!;

/** Owns two copies of the first `n` cards in the set. */
function ownsFirst(n: number): Owned {
  const owned: Owned = {};
  for (const card of ALL_CARDS.slice(0, n)) owned[card.id] = { copies: 2, gold: 0 };
  return owned;
}

describe('copy limits', () => {
  it('allows two of anything below Legendary', () => {
    for (const rarity of ['Common', 'Uncommon', 'Rare', 'Epic'] as const) {
      expect(copyLimitFor(rarity)).toBe(MAX_COPIES);
    }
  });

  it('allows only one Legendary', () => {
    expect(copyLimitFor('Legendary')).toBe(LEGENDARY_COPIES);
    expect(LEGENDARY_COPIES).toBe(1);
  });

  it('refuses a third copy of a Common', () => {
    const owned = { [COMMON.id]: { copies: 2 as const, gold: 0 as const } };
    let deck = emptyDeck();
    deck = addCard(deck, owned, COMMON.id);
    deck = addCard(deck, owned, COMMON.id);
    expect(countOf(deck, COMMON.id)).toBe(2);

    expect(canAdd(deck, owned, COMMON.id)).toBe(false);
    deck = addCard(deck, owned, COMMON.id);
    expect(countOf(deck, COMMON.id)).toBe(2);
  });

  it('refuses a second copy of a Legendary even when two are owned', () => {
    const owned = { [LEGENDARY.id]: { copies: 2 as const, gold: 0 as const } };
    let deck = addCard(emptyDeck(), owned, LEGENDARY.id);
    expect(countOf(deck, LEGENDARY.id)).toBe(1);

    expect(canAdd(deck, owned, LEGENDARY.id)).toBe(false);
    deck = addCard(deck, owned, LEGENDARY.id);
    expect(countOf(deck, LEGENDARY.id)).toBe(1);
  });

  it('caps a card at the number of copies actually owned', () => {
    const owned = { [COMMON.id]: { copies: 1 as const, gold: 0 as const } };
    expect(allowedCopies(owned, COMMON.id)).toBe(1);

    const deck = addCard(emptyDeck(), owned, COMMON.id);
    expect(canAdd(deck, owned, COMMON.id)).toBe(false);
  });

  it('refuses a card that is not owned at all', () => {
    expect(allowedCopies({}, COMMON.id)).toBe(0);
    expect(canAdd(emptyDeck(), {}, COMMON.id)).toBe(false);
  });

  it('refuses a card that is not in the registry', () => {
    const owned = { 'no-such-card': { copies: 2 as const, gold: 0 as const } };
    expect(allowedCopies(owned, 'no-such-card')).toBe(0);
  });

  // Two unrelated terms often draw the same statline. Under the old
  // per-template rule they blocked each other in a deck; they must not now.
  it('lets two different cards sharing a statline both be fielded', () => {
    const pairs = new Map<string, string[]>();
    for (const card of ALL_CARDS) {
      if (card.type !== 'Minion') continue;
      const key = `${card.cost}/${card.attack}/${card.health}/${card.rarity}`;
      pairs.set(key, [...(pairs.get(key) ?? []), card.id]);
    }
    const shared = [...pairs.values()].find(
      (ids) => ids.length >= 2 && ids.every((id) => cardById(id)!.rarity !== 'Legendary')
    );
    expect(shared, 'no two cards share a statline — test is vacuous').toBeDefined();

    const owned: Owned = {
      [shared![0]]: { copies: 2, gold: 0 },
      [shared![1]]: { copies: 2, gold: 0 }
    };
    let deck = emptyDeck();
    for (const id of [shared![0], shared![0], shared![1], shared![1]]) {
      deck = addCard(deck, owned, id);
    }
    expect(deck.cardIds).toHaveLength(4);
  });
});

describe('deck size', () => {
  it('refuses a 31st card', () => {
    const owned = ownsFirst(20);
    const deck = autoBuild(owned, 1);
    expect(deck.cardIds).toHaveLength(DECK_SIZE);
    const extra = Object.keys(owned)[0];
    expect(canAdd(deck, owned, extra)).toBe(false);
  });

  it('removes one copy at a time', () => {
    const owned = { [COMMON.id]: { copies: 2 as const, gold: 0 as const } };
    let deck = addCard(addCard(emptyDeck(), owned, COMMON.id), owned, COMMON.id);
    deck = removeCard(deck, COMMON.id);
    expect(countOf(deck, COMMON.id)).toBe(1);
  });

  it('reports how much a thin collection can field', () => {
    const owned = { [COMMON.id]: { copies: 2 as const, gold: 0 as const } };
    expect(maxDeckSize(owned)).toBe(2);
    expect(distinctCount(owned)).toBe(1);
    expect(maxDeckSize(ownsFirst(40))).toBe(DECK_SIZE);
  });

  it('counts a Legendary once toward what can be fielded', () => {
    const owned = { [LEGENDARY.id]: { copies: 2 as const, gold: 0 as const } };
    expect(maxDeckSize(owned)).toBe(1);
  });
});

describe('legality', () => {
  it('accepts the starter deck', () => {
    expect(deckProblems(starterDeck(), starterCollection())).toEqual([]);
    expect(isLegal(starterDeck(), starterCollection())).toBe(true);
  });

  it('rejects a short deck', () => {
    expect(deckProblems(emptyDeck(), {})[0]).toContain('0 of 30');
  });

  it('rejects cards the player does not own', () => {
    const deck = { name: 'x', cardIds: Array(DECK_SIZE).fill(COMMON.id) };
    const problems = deckProblems(deck, {});
    expect(problems.some((p) => p.includes("don't own"))).toBe(true);
  });

  it('rejects two copies of a Legendary by name', () => {
    const deck = { name: 'x', cardIds: [LEGENDARY.id, LEGENDARY.id] };
    const owned = { [LEGENDARY.id]: { copies: 2 as const, gold: 0 as const } };
    expect(deckProblems(deck, owned).some((p) => p.includes('Legendary'))).toBe(true);
  });

  it('rejects cards that no longer exist', () => {
    const deck = { name: 'x', cardIds: ['deleted-card'] };
    expect(deckProblems(deck, {}).some((p) => p.includes('no longer exist'))).toBe(true);
  });
});

describe('autoBuild', () => {
  it('produces a legal 30-card deck from the starter collection', () => {
    const owned = starterCollection();
    const deck = autoBuild(owned, 7);
    expect(deck.cardIds).toHaveLength(DECK_SIZE);
    expect(deckProblems(deck, owned)).toEqual([]);
  });

  it('is deterministic for a given seed', () => {
    const owned = ownsFirst(40);
    expect(autoBuild(owned, 42).cardIds).toEqual(autoBuild(owned, 42).cardIds);
  });

  it('never exceeds a card limit', () => {
    const owned = ownsFirst(60);
    const deck = autoBuild(owned, 3);
    for (const id of new Set(deck.cardIds)) {
      expect(countOf(deck, id), id).toBeLessThanOrEqual(allowedCopies(owned, id));
    }
  });

  it('falls short rather than cheating when the collection is too thin', () => {
    const owned = ownsFirst(4);
    expect(autoBuild(owned, 1).cardIds).toHaveLength(8);
  });
});

describe('the starter set', () => {
  it('is 15 cards, 2 copies each', () => {
    expect(STARTER_CARD_IDS).toHaveLength(15);
    expect(new Set(STARTER_CARD_IDS).size).toBe(15);
    const owned = starterCollection();
    for (const id of STARTER_CARD_IDS) expect(ownedCount(owned, id)).toBe(2);
  });

  it('names only real cards, and no Legendary', () => {
    for (const id of STARTER_CARD_IDS) {
      const card = cardById(id);
      expect(card, id).toBeDefined();
      expect(card!.rarity, id).not.toBe('Legendary');
    }
  });

  it('makes exactly one full deck', () => {
    expect(starterDeck().cardIds).toHaveLength(DECK_SIZE);
    expect(maxDeckSize(starterCollection())).toBe(DECK_SIZE);
  });

  it('has a playable curve and at least one spell', () => {
    const cards = resolveDeck(starterDeck());
    expect(cards).toHaveLength(DECK_SIZE);
    expect(cards.filter((c) => c.cost <= 2).length).toBeGreaterThanOrEqual(10);
    expect(cards.filter((c) => c.type === 'Spell').length).toBeGreaterThanOrEqual(2);
    expect(Math.max(...cards.map((c) => c.cost))).toBeLessThanOrEqual(7);
  });
});

describe('deck views', () => {
  it('groups the deck by card, ordered by cost', () => {
    const entries = deckEntries(starterDeck());
    expect(entries).toHaveLength(15);
    expect(entries.every((e) => e.count === 2)).toBe(true);
    const costs = entries.map((e) => e.card.cost);
    expect([...costs].sort((a, b) => a - b)).toEqual(costs);
  });

  it('resolves ids into cards, skipping unknown ones', () => {
    expect(resolveDeck({ name: 'x', cardIds: [COMMON.id, 'gone'] })).toHaveLength(1);
  });
});

describe('pruneDeck', () => {
  it('drops copies the player can no longer field', () => {
    const deck = { name: 'x', cardIds: [COMMON.id, COMMON.id] };
    const owned = { [COMMON.id]: { copies: 1 as const, gold: 0 as const } };
    expect(pruneDeck(deck, owned).cardIds).toEqual([COMMON.id]);
  });

  it('drops a card that has left the registry', () => {
    expect(pruneDeck({ name: 'x', cardIds: ['gone'] }, {}).cardIds).toEqual([]);
  });

  it('leaves a legal deck untouched', () => {
    const deck = starterDeck();
    expect(pruneDeck(deck, starterCollection()).cardIds).toEqual(deck.cardIds);
  });

  it('drops a second Legendary', () => {
    const owned = addCopies({}, LEGENDARY.id, 2);
    const deck = { name: 'x', cardIds: [LEGENDARY.id, LEGENDARY.id] };
    expect(pruneDeck(deck, owned).cardIds).toEqual([LEGENDARY.id]);
  });
});
