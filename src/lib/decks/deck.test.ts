import { describe, expect, it } from 'vitest';
import { mapRowsToCards } from '../parsers/fieldMapper';
import {
  DECK_SIZE,
  MAX_COPIES,
  addCard,
  autoBuild,
  canAdd,
  countOf,
  countOfTemplate,
  deckEntries,
  deckProblems,
  emptyDeck,
  groupByTemplate,
  isLegal,
  maxDeckSize,
  mergeCollection,
  pruneDeck,
  removeCard,
  removeCards,
  resolveDeck,
  templateCount,
  templateOf,
  type Collection
} from './deck';

function collectionFrom(rows: { Front: string; Back: string }[]): Collection {
  return {
    name: 'Test',
    cards: mapRowsToCards(rows, { front: 'Front', back: 'Back' }),
    importedAt: '2026-07-25T00:00:00.000Z'
  };
}

function collectionOf(size: number, prefix = ''): Collection {
  return collectionFrom(
    Array.from({ length: size }, (_, i) => ({
      Front: `${prefix}q${i}`,
      Back: `${prefix}a${i}`
    }))
  );
}

/** Two cards guaranteed to share a template, for the per-template copy rules. */
function sharedTemplatePair(): { collection: Collection; a: string; b: string } {
  const collection = collectionOf(400);
  const groups = new Map<string, string[]>();
  for (const card of collection.cards) {
    const t = templateOf(card);
    const list = groups.get(t);
    if (list) list.push(card.id);
    else groups.set(t, [card.id]);
  }
  const pair = [...groups.values()].find((ids) => ids.length >= 2)!;
  return { collection, a: pair[0], b: pair[1] };
}

describe('deck editing', () => {
  it('adds and removes single copies', () => {
    const collection = collectionOf(5);
    const id = collection.cards[0].id;
    let deck = emptyDeck();

    deck = addCard(deck, collection, id);
    deck = addCard(deck, collection, id);
    expect(countOf(deck, id)).toBe(2);

    deck = removeCard(deck, id);
    expect(countOf(deck, id)).toBe(1);
    expect(deck.cardIds).toHaveLength(1);
  });

  it('refuses a third copy of the same card', () => {
    const collection = collectionOf(5);
    const id = collection.cards[0].id;
    let deck = emptyDeck();
    for (let i = 0; i < 5; i++) deck = addCard(deck, collection, id);
    expect(countOf(deck, id)).toBe(MAX_COPIES);
    expect(canAdd(deck, collection, id)).toBe(false);
  });

  it('ignores an id that is not in the collection', () => {
    const collection = collectionOf(3);
    expect(canAdd(emptyDeck(), collection, 'not-a-real-id')).toBe(false);
    expect(addCard(emptyDeck(), collection, 'not-a-real-id').cardIds).toHaveLength(0);
  });

  it('does not mutate the deck it was given', () => {
    const collection = collectionOf(3);
    const deck = emptyDeck();
    addCard(deck, collection, collection.cards[0].id);
    expect(deck.cardIds).toHaveLength(0);
  });
});

describe('the copy limit counts templates, not flashcards', () => {
  it('caps two per template even across different flashcards', () => {
    const { collection, a, b } = sharedTemplatePair();
    const template = templateOf(collection.cards.find((c) => c.id === a)!);

    let deck = addCard(emptyDeck(), collection, a);
    deck = addCard(deck, collection, b);
    expect(countOfTemplate(deck, collection, template)).toBe(2);

    // A third flashcard on the same template is refused, even though it is a
    // different card — this is the rule that stops a huge import inflating one
    // statline into a whole deck.
    expect(canAdd(deck, collection, a)).toBe(false);
    expect(canAdd(deck, collection, b)).toBe(false);
    expect(addCard(deck, collection, b).cardIds).toHaveLength(2);
  });

  it('lets you mix which flashcards fill a template slot', () => {
    const { collection, a, b } = sharedTemplatePair();
    const deck = addCard(addCard(emptyDeck(), collection, a), collection, b);
    expect(new Set(deck.cardIds)).toEqual(new Set([a, b]));
  });

  it('reports an over-filled template as a problem', () => {
    const { collection, a, b } = sharedTemplatePair();
    const deck = { name: 'bad', cardIds: [a, a, b] };
    expect(deckProblems(deck, collection).join(' ')).toMatch(/More than 2 copies/);
  });

  it('bounds deck size by distinct templates, not raw card count', () => {
    const collection = collectionOf(400);
    expect(templateCount(collection)).toBeLessThan(collection.cards.length);
    expect(maxDeckSize(collection)).toBe(DECK_SIZE);

    const tiny = collectionOf(3);
    expect(maxDeckSize(tiny)).toBe(templateCount(tiny) * MAX_COPIES);
  });
});

describe('legality', () => {
  it('requires exactly a full deck', () => {
    const collection = collectionOf(200);
    expect(isLegal(emptyDeck(), collection)).toBe(false);

    const deck = autoBuild(collection, 1);
    expect(deck.cardIds).toHaveLength(DECK_SIZE);
    expect(deckProblems(deck, collection)).toEqual([]);
  });

  it('reports cards that left the collection', () => {
    const collection = collectionOf(200);
    const deck = autoBuild(collection, 2);
    const shrunk: Collection = { ...collection, cards: collection.cards.slice(0, 2) };
    expect(deckProblems(deck, shrunk).join(' ')).toMatch(/no longer in your collection/);
  });
});

describe('auto-build', () => {
  it('fills a legal deck and never breaks the template limit', () => {
    const collection = collectionOf(300);
    const deck = autoBuild(collection, 7);
    expect(deck.cardIds).toHaveLength(DECK_SIZE);
    expect(isLegal(deck, collection)).toBe(true);

    const byId = new Map(collection.cards.map((c) => [c.id, c]));
    const counts = new Map<string, number>();
    for (const id of deck.cardIds) {
      const t = templateOf(byId.get(id)!);
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    for (const n of counts.values()) expect(n).toBeLessThanOrEqual(MAX_COPIES);
  });

  it('falls short gracefully when there are too few templates', () => {
    const collection = collectionOf(4);
    const deck = autoBuild(collection, 4);
    expect(deck.cardIds.length).toBe(maxDeckSize(collection));
    expect(isLegal(deck, collection)).toBe(false);
  });

  it('is stable for a given seed and varies across seeds', () => {
    const collection = collectionOf(300);
    expect(autoBuild(collection, 11)).toEqual(autoBuild(collection, 11));
    expect(autoBuild(collection, 11).cardIds.join()).not.toBe(
      autoBuild(collection, 12).cardIds.join()
    );
  });
});

describe('resolving a deck for play', () => {
  it('expands ids into the engine card list', () => {
    const collection = collectionOf(200);
    const cards = resolveDeck(autoBuild(collection, 5), collection);
    expect(cards).toHaveLength(DECK_SIZE);
    expect(cards.every((c) => c.type === 'Minion')).toBe(true);
  });

  it('skips ids missing from the collection rather than throwing', () => {
    const collection = collectionOf(10);
    const deck = { name: 'd', cardIds: [collection.cards[0].id, 'not-a-real-id'] };
    expect(resolveDeck(deck, collection)).toHaveLength(1);
  });

  it('groups the deck list by card, ordered by cost', () => {
    const collection = collectionOf(200);
    const entries = deckEntries(autoBuild(collection, 9), collection);
    expect(entries.reduce((sum, e) => sum + e.count, 0)).toBe(DECK_SIZE);
    const costs = entries.map((e) => e.card.cost);
    expect([...costs].sort((a, b) => a - b)).toEqual(costs);
  });
});

describe('the collection view', () => {
  it('gives one row per template, listing every flashcard on it', () => {
    const collection = collectionOf(300);
    const groups = groupByTemplate(emptyDeck(), collection);

    expect(groups).toHaveLength(templateCount(collection));
    expect(groups.reduce((sum, g) => sum + g.cards.length, 0)).toBe(
      collection.cards.length
    );
    const costs = groups.map((g) => g.sample.cost);
    expect([...costs].sort((a, b) => a - b)).toEqual(costs);
  });

  it('reports how many copies of each template are already in the deck', () => {
    const { collection, a, b } = sharedTemplatePair();
    const template = templateOf(collection.cards.find((c) => c.id === a)!);
    const deck = addCard(addCard(emptyDeck(), collection, a), collection, b);

    const group = groupByTemplate(deck, collection).find((g) => g.templateId === template)!;
    expect(group.inDeck).toBe(2);
    expect(group.cards.length).toBeGreaterThanOrEqual(2);
  });
});

describe('the library accumulates', () => {
  it('keeps everything from both imports', () => {
    const first = collectionOf(5, 'a');
    const second = collectionOf(5, 'b');
    const merged = mergeCollection(first, second);
    expect(merged.cards).toHaveLength(10);
  });

  it('treats re-importing an unchanged file as a no-op', () => {
    const first = collectionOf(8);
    const again = collectionOf(8);
    expect(mergeCollection(first, again).cards).toHaveLength(8);
  });

  it('keeps the old card when an answer is edited', () => {
    const original = collectionFrom([{ Front: 'Capital of Japan?', Back: 'Tokyo' }]);
    const edited = collectionFrom([
      { Front: 'Capital of Japan?', Back: 'Tokyo, on Honshu' }
    ]);
    const merged = mergeCollection(original, edited);

    expect(merged.cards).toHaveLength(2);
    expect(merged.cards.map((c) => c.description).sort()).toEqual([
      'Tokyo',
      'Tokyo, on Honshu'
    ]);
  });

  it('starts a library from nothing', () => {
    const incoming = collectionOf(3);
    expect(mergeCollection(null, incoming)).toBe(incoming);
  });

  it('never drops a card on its own — only on request', () => {
    const collection = collectionOf(10);
    const doomed = collection.cards.slice(0, 4).map((c) => c.id);
    const after = removeCards(collection, doomed);
    expect(after.cards).toHaveLength(6);
    expect(after.cards.some((c) => doomed.includes(c.id))).toBe(false);
  });

  it('prunes deck slots whose card was deleted', () => {
    const collection = collectionOf(200);
    const deck = autoBuild(collection, 3);
    const gone = deck.cardIds.slice(0, 5);
    const after = removeCards(collection, gone);

    const pruned = pruneDeck(deck, after);
    expect(pruned.cardIds).toHaveLength(DECK_SIZE - new Set(gone).size);
    expect(deckProblems(pruned, after).join(' ')).not.toMatch(/no longer/);
  });
});
