import type { Card } from '../../types/cards';
import { createRng, shuffle } from '../engine/rng';

export const DECK_SIZE = 30;
export const MAX_COPIES = 2;

/** A deck stores card ids, not cards — the collection is the source of truth. */
export interface Deck {
  name: string;
  cardIds: string[];
}

export interface Collection {
  name: string;
  cards: Card[];
  importedAt: string;
}

export function emptyDeck(name = 'New deck'): Deck {
  return { name, cardIds: [] };
}

export function countOf(deck: Deck, cardId: string): number {
  return deck.cardIds.filter((id) => id === cardId).length;
}

export function canAdd(deck: Deck, cardId: string): boolean {
  return deck.cardIds.length < DECK_SIZE && countOf(deck, cardId) < MAX_COPIES;
}

export function addCard(deck: Deck, cardId: string): Deck {
  if (!canAdd(deck, cardId)) return deck;
  return { ...deck, cardIds: [...deck.cardIds, cardId] };
}

/** Removes a single copy. */
export function removeCard(deck: Deck, cardId: string): Deck {
  const index = deck.cardIds.indexOf(cardId);
  if (index === -1) return deck;
  const cardIds = [...deck.cardIds];
  cardIds.splice(index, 1);
  return { ...deck, cardIds };
}

export function isLegal(deck: Deck, collection: Collection): boolean {
  return deckProblems(deck, collection).length === 0;
}

/** Human-readable reasons a deck can't be played, for the builder UI. */
export function deckProblems(deck: Deck, collection: Collection): string[] {
  const problems: string[] = [];
  if (deck.cardIds.length !== DECK_SIZE) {
    problems.push(`Deck has ${deck.cardIds.length} of ${DECK_SIZE} cards.`);
  }
  const known = new Set(collection.cards.map((c) => c.id));
  if (deck.cardIds.some((id) => !known.has(id))) {
    problems.push('Deck contains cards that are no longer in your collection.');
  }
  const overCopies = [...new Set(deck.cardIds)].filter(
    (id) => countOf(deck, id) > MAX_COPIES
  );
  if (overCopies.length > 0) {
    problems.push(`More than ${MAX_COPIES} copies of ${overCopies.length} card(s).`);
  }
  return problems;
}

/** The most cards a collection can legally field, capped at a full deck. */
export function maxDeckSize(collection: Collection): number {
  return Math.min(DECK_SIZE, collection.cards.length * MAX_COPIES);
}

/**
 * Fills a legal deck from the collection. Falls short only when the collection
 * is too small; the builder surfaces that rather than silently producing junk.
 * Seeded so tests are stable, but defaults to varying per click.
 */
export function autoBuild(collection: Collection, seed = Date.now()): Deck {
  const rng = createRng(seed >>> 0);
  const pool = shuffle(rng, collection.cards);
  const cardIds: string[] = [];

  for (let copy = 0; copy < MAX_COPIES; copy++) {
    for (const card of pool) {
      if (cardIds.length >= DECK_SIZE) break;
      cardIds.push(card.id);
    }
    if (cardIds.length >= DECK_SIZE) break;
  }

  return { name: 'Auto-built deck', cardIds };
}

/** Expands a deck into the card list the engine consumes. */
export function resolveDeck(deck: Deck, collection: Collection): Card[] {
  const byId = new Map(collection.cards.map((c) => [c.id, c]));
  return deck.cardIds.flatMap((id) => {
    const card = byId.get(id);
    return card ? [card] : [];
  });
}

/** Card counts for the builder's deck list, ordered by cost then name. */
export function deckEntries(
  deck: Deck,
  collection: Collection
): { card: Card; count: number }[] {
  const byId = new Map(collection.cards.map((c) => [c.id, c]));
  const counts = new Map<string, number>();
  for (const id of deck.cardIds) counts.set(id, (counts.get(id) ?? 0) + 1);

  return [...counts.entries()]
    .flatMap(([id, count]) => {
      const card = byId.get(id);
      return card ? [{ card, count }] : [];
    })
    .sort((a, b) => a.card.cost - b.card.cost || a.card.name.localeCompare(b.card.name));
}
