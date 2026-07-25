import type { Card } from '../../types/cards';
import { createRng, shuffle } from '../engine/rng';

export const DECK_SIZE = 30;
export const MAX_COPIES = 2;

/**
 * A deck stores the ids of the specific flashcards you chose; the collection is
 * the source of truth for what they are.
 *
 * The copy limit applies per **template**, not per flashcard. A thousand
 * flashcards may share the 4-mana 4/5, but a deck can still only field two of
 * it — you just get to choose which two flashcards wear it.
 */
export interface Deck {
  name: string;
  cardIds: string[];
}

/** The permanent library. Imports merge into it; nothing is ever auto-removed. */
export interface Collection {
  name: string;
  cards: Card[];
  importedAt: string;
}

/** Cards imported before templates existed group under their own id. */
export function templateOf(card: Card): string {
  return card.templateId ?? `legacy:${card.id}`;
}

export function emptyDeck(name = 'New deck'): Deck {
  return { name, cardIds: [] };
}

function indexById(collection: Collection): Map<string, Card> {
  return new Map(collection.cards.map((c) => [c.id, c]));
}

/** Copies of one exact flashcard. */
export function countOf(deck: Deck, cardId: string): number {
  return deck.cardIds.filter((id) => id === cardId).length;
}

/** Copies of a template, counting every flashcard bound to it. */
export function countOfTemplate(
  deck: Deck,
  collection: Collection,
  templateId: string
): number {
  const byId = indexById(collection);
  return deck.cardIds.filter((id) => {
    const card = byId.get(id);
    return card ? templateOf(card) === templateId : false;
  }).length;
}

export function canAdd(deck: Deck, collection: Collection, cardId: string): boolean {
  if (deck.cardIds.length >= DECK_SIZE) return false;
  const card = indexById(collection).get(cardId);
  if (!card) return false;
  return countOfTemplate(deck, collection, templateOf(card)) < MAX_COPIES;
}

export function addCard(deck: Deck, collection: Collection, cardId: string): Deck {
  if (!canAdd(deck, collection, cardId)) return deck;
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

  const byId = indexById(collection);
  if (deck.cardIds.some((id) => !byId.has(id))) {
    problems.push('Deck contains cards that are no longer in your collection.');
  }

  const perTemplate = new Map<string, number>();
  for (const id of deck.cardIds) {
    const card = byId.get(id);
    if (!card) continue;
    const template = templateOf(card);
    perTemplate.set(template, (perTemplate.get(template) ?? 0) + 1);
  }
  const over = [...perTemplate.values()].filter((n) => n > MAX_COPIES).length;
  if (over > 0) {
    problems.push(`More than ${MAX_COPIES} copies of ${over} card(s).`);
  }

  return problems;
}

/** Distinct templates in a collection — the real ceiling on deck variety. */
export function templateCount(collection: Collection): number {
  return new Set(collection.cards.map(templateOf)).size;
}

/**
 * The most cards a collection can legally field, capped at a full deck. Bounded
 * by distinct templates, not raw card count: importing the same statline a
 * thousand times does not let you field it a thousand times.
 */
export function maxDeckSize(collection: Collection): number {
  return Math.min(DECK_SIZE, templateCount(collection) * MAX_COPIES);
}

/**
 * Fills a legal deck from the collection, respecting the per-template limit.
 * Falls short only when the collection lacks distinct templates; the builder
 * surfaces that rather than silently producing junk. Seeded so tests are
 * stable, but defaults to varying per click.
 */
export function autoBuild(collection: Collection, seed = Date.now()): Deck {
  const rng = createRng(seed >>> 0);
  const pool = shuffle(rng, collection.cards);
  const cardIds: string[] = [];
  const used = new Map<string, number>();

  for (let copy = 0; copy < MAX_COPIES; copy++) {
    for (const card of pool) {
      if (cardIds.length >= DECK_SIZE) break;
      const template = templateOf(card);
      if ((used.get(template) ?? 0) >= MAX_COPIES) continue;
      used.set(template, (used.get(template) ?? 0) + 1);
      cardIds.push(card.id);
    }
    if (cardIds.length >= DECK_SIZE) break;
  }

  return { name: 'Auto-built deck', cardIds };
}

/** Expands a deck into the card list the engine consumes. */
export function resolveDeck(deck: Deck, collection: Collection): Card[] {
  const byId = indexById(collection);
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
  const byId = indexById(collection);
  const counts = new Map<string, number>();
  for (const id of deck.cardIds) counts.set(id, (counts.get(id) ?? 0) + 1);

  return [...counts.entries()]
    .flatMap(([id, count]) => {
      const card = byId.get(id);
      return card ? [{ card, count }] : [];
    })
    .sort((a, b) => a.card.cost - b.card.cost || a.card.name.localeCompare(b.card.name));
}

/** One row per template, with every flashcard bound to it — the collection view. */
export interface TemplateGroup {
  templateId: string;
  /** Representative card, for showing the statline. */
  sample: Card;
  cards: Card[];
  inDeck: number;
}

export function groupByTemplate(deck: Deck, collection: Collection): TemplateGroup[] {
  const groups = new Map<string, Card[]>();
  for (const card of collection.cards) {
    const template = templateOf(card);
    const list = groups.get(template);
    if (list) list.push(card);
    else groups.set(template, [card]);
  }

  const byId = indexById(collection);
  const deckCounts = new Map<string, number>();
  for (const id of deck.cardIds) {
    const card = byId.get(id);
    if (!card) continue;
    const template = templateOf(card);
    deckCounts.set(template, (deckCounts.get(template) ?? 0) + 1);
  }

  return [...groups.entries()]
    .map(([templateId, cards]) => ({
      templateId,
      sample: cards[0],
      cards: [...cards].sort((a, b) => a.name.localeCompare(b.name)),
      inDeck: deckCounts.get(templateId) ?? 0
    }))
    .sort(
      (a, b) => a.sample.cost - b.sample.cost || a.templateId.localeCompare(b.templateId)
    );
}

/**
 * Merges an import into the library. Cards are keyed by id, which is a hash of
 * the flashcard's text — so re-importing an unchanged file is a no-op, while an
 * edited answer arrives as a new card alongside the original. Nothing is ever
 * dropped; removing cards is a deliberate act, see `removeCards`.
 */
export function mergeCollection(existing: Collection | null, incoming: Collection): Collection {
  if (!existing) return incoming;

  const byId = new Map(existing.cards.map((c) => [c.id, c]));
  for (const card of incoming.cards) byId.set(card.id, card);

  return {
    name: existing.name,
    cards: [...byId.values()],
    importedAt: incoming.importedAt
  };
}

/** Bulk removal — only ever driven by an explicit user action. */
export function removeCards(collection: Collection, cardIds: Iterable<string>): Collection {
  const drop = new Set(cardIds);
  return { ...collection, cards: collection.cards.filter((c) => !drop.has(c.id)) };
}

/** Drops deck slots whose card is gone, so a deck survives a bulk delete. */
export function pruneDeck(deck: Deck, collection: Collection): Deck {
  const known = new Set(collection.cards.map((c) => c.id));
  return { ...deck, cardIds: deck.cardIds.filter((id) => known.has(id)) };
}
