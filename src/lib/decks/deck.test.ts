import { describe, expect, it } from 'vitest';
import { mapRowsToCards } from '../parsers/fieldMapper';
import {
  DECK_SIZE,
  MAX_COPIES,
  addCard,
  autoBuild,
  canAdd,
  countOf,
  deckEntries,
  deckProblems,
  emptyDeck,
  isLegal,
  maxDeckSize,
  removeCard,
  resolveDeck,
  type Collection
} from './deck';

function collectionOf(size: number): Collection {
  const cards = mapRowsToCards(
    Array.from({ length: size }, (_, i) => ({ Front: `q${i}`, Back: `a${i}` })),
    { front: 'Front', back: 'Back' }
  );
  return { name: 'Test', cards, importedAt: '2026-07-25T00:00:00.000Z' };
}

describe('deck editing', () => {
  it('adds and removes single copies', () => {
    const collection = collectionOf(5);
    const id = collection.cards[0].id;
    let deck = emptyDeck();

    deck = addCard(deck, id);
    deck = addCard(deck, id);
    expect(countOf(deck, id)).toBe(2);

    deck = removeCard(deck, id);
    expect(countOf(deck, id)).toBe(1);
    expect(deck.cardIds).toHaveLength(1);
  });

  it('refuses a third copy of the same card', () => {
    const collection = collectionOf(5);
    const id = collection.cards[0].id;
    let deck = emptyDeck();
    for (let i = 0; i < 5; i++) deck = addCard(deck, id);
    expect(countOf(deck, id)).toBe(MAX_COPIES);
    expect(canAdd(deck, id)).toBe(false);
  });

  it('refuses cards past the deck size', () => {
    const collection = collectionOf(40);
    let deck = emptyDeck();
    for (const card of collection.cards) deck = addCard(deck, card.id);
    expect(deck.cardIds).toHaveLength(DECK_SIZE);
    expect(canAdd(deck, collection.cards[35].id)).toBe(false);
  });

  it('ignores removing a card that is not in the deck', () => {
    const collection = collectionOf(3);
    const deck = addCard(emptyDeck(), collection.cards[0].id);
    expect(removeCard(deck, collection.cards[1].id)).toEqual(deck);
  });

  it('does not mutate the deck it was given', () => {
    const collection = collectionOf(3);
    const deck = emptyDeck();
    addCard(deck, collection.cards[0].id);
    expect(deck.cardIds).toHaveLength(0);
  });
});

describe('legality', () => {
  it('requires exactly a full deck', () => {
    const collection = collectionOf(20);
    let deck = emptyDeck();
    expect(isLegal(deck, collection)).toBe(false);

    deck = autoBuild(collection, 1);
    expect(deck.cardIds).toHaveLength(DECK_SIZE);
    expect(deckProblems(deck, collection)).toEqual([]);
    expect(isLegal(deck, collection)).toBe(true);
  });

  it('reports cards that left the collection', () => {
    const collection = collectionOf(20);
    const deck = autoBuild(collection, 2);
    const shrunk: Collection = { ...collection, cards: collection.cards.slice(0, 2) };
    expect(deckProblems(deck, shrunk).join(' ')).toMatch(/no longer in your collection/);
  });

  it('caps what a small collection can field', () => {
    expect(maxDeckSize(collectionOf(4))).toBe(8);
    expect(maxDeckSize(collectionOf(100))).toBe(DECK_SIZE);
  });
});

describe('auto-build', () => {
  it('fills a legal 30-card deck from a big enough collection', () => {
    const collection = collectionOf(40);
    const deck = autoBuild(collection, 7);
    expect(deck.cardIds).toHaveLength(DECK_SIZE);
    expect(isLegal(deck, collection)).toBe(true);
    for (const id of new Set(deck.cardIds)) {
      expect(countOf(deck, id)).toBeLessThanOrEqual(MAX_COPIES);
    }
  });

  it('only uses cards from the collection', () => {
    const collection = collectionOf(25);
    const known = new Set(collection.cards.map((c) => c.id));
    for (const id of autoBuild(collection, 3).cardIds) expect(known.has(id)).toBe(true);
  });

  it('falls short gracefully when the collection is too small', () => {
    const collection = collectionOf(6);
    const deck = autoBuild(collection, 4);
    expect(deck.cardIds).toHaveLength(12);
    expect(isLegal(deck, collection)).toBe(false);
    expect(deckProblems(deck, collection)[0]).toMatch(/12 of 30/);
  });

  it('is stable for a given seed and varies across seeds', () => {
    const collection = collectionOf(40);
    expect(autoBuild(collection, 11)).toEqual(autoBuild(collection, 11));
    const a = autoBuild(collection, 11).cardIds.join();
    const b = autoBuild(collection, 12).cardIds.join();
    expect(a).not.toBe(b);
  });
});

describe('resolving a deck for play', () => {
  it('expands ids into the engine card list', () => {
    const collection = collectionOf(20);
    const deck = autoBuild(collection, 5);
    const cards = resolveDeck(deck, collection);
    expect(cards).toHaveLength(DECK_SIZE);
    expect(cards.every((c) => c.type === 'Minion')).toBe(true);
  });

  it('skips ids missing from the collection rather than throwing', () => {
    const collection = collectionOf(10);
    const deck = { name: 'd', cardIds: [collection.cards[0].id, 'not-a-real-id'] };
    expect(resolveDeck(deck, collection)).toHaveLength(1);
  });

  it('groups the deck list by card, ordered by cost', () => {
    const collection = collectionOf(20);
    const deck = autoBuild(collection, 9);
    const entries = deckEntries(deck, collection);

    expect(entries.reduce((sum, e) => sum + e.count, 0)).toBe(DECK_SIZE);
    const costs = entries.map((e) => e.card.cost);
    expect([...costs].sort((a, b) => a - b)).toEqual(costs);
  });
});
