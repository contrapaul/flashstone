import type { Card, CardClass, Rarity } from '../../types/cards';
import { cardById } from '../data/cards';
import { ownedCount, type Owned } from '../collection/owned';
import { createRng, shuffle } from '../engine/rng';

export const DECK_SIZE = 30;
export const MAX_COPIES = 2;
/** Legendaries are singletons. DECISIONS.md §2. */
export const LEGENDARY_COPIES = 1;

/**
 * A deck is a list of card ids; the registry says what they are and the
 * player's collection says whether they may be used.
 *
 * The copy limit is **per card**, not per statline. An earlier design capped
 * copies per *template*, which made sense when thousands of imported flashcards
 * shared a handful of statlines. On a curated set of 155 cards it read as a bug:
 * two unrelated terms that happened to draw the same 4-mana 4/5 would block each
 * other in a deck.
 */
export interface Deck {
  name: string;
  cardIds: string[];
  /**
   * The deck's class, which decides its hero power.
   *
   * Optional on the type only so decks saved before classes existed still parse.
   * `deckProblems` requires a playable one, so a legacy deck surfaces as
   * "choose a class" — a one-click fix — rather than silently playing without a
   * hero power.
   */
  class?: CardClass;
}

/** A card is fieldable in a deck of this class if it is that class or Neutral. */
export function cardFitsClass(card: Card, deckClass: CardClass | undefined): boolean {
  const cardClass = card.class ?? 'Neutral';
  if (cardClass === 'Neutral') return true;
  return cardClass === deckClass;
}

export function emptyDeck(name = 'New deck'): Deck {
  return { name, cardIds: [] };
}

/** How many copies of this card a deck may hold, before ownership. */
export function copyLimitFor(rarity: Rarity): number {
  return rarity === 'Legendary' ? LEGENDARY_COPIES : MAX_COPIES;
}

/** Copies of one card already in the deck. */
export function countOf(deck: Deck, cardId: string): number {
  return deck.cardIds.filter((id) => id === cardId).length;
}

/**
 * The ceiling on one card in this deck: the rarity limit, further capped by how
 * many copies the player actually owns. You cannot field two of a Legendary
 * however many you own, and you cannot field two of a Common you own one of.
 */
export function allowedCopies(owned: Owned, cardId: string): number {
  const card = cardById(cardId);
  if (!card) return 0;
  return Math.min(copyLimitFor(card.rarity), ownedCount(owned, cardId));
}

export function canAdd(deck: Deck, owned: Owned, cardId: string): boolean {
  if (deck.cardIds.length >= DECK_SIZE) return false;
  const card = cardById(cardId);
  if (!card || !cardFitsClass(card, deck.class)) return false;
  return countOf(deck, cardId) < allowedCopies(owned, cardId);
}

export function addCard(deck: Deck, owned: Owned, cardId: string): Deck {
  if (!canAdd(deck, owned, cardId)) return deck;
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

export function isLegal(deck: Deck, owned: Owned): boolean {
  return deckProblems(deck, owned).length === 0;
}

/** Human-readable reasons a deck can't be played, for the builder UI. */
export function deckProblems(deck: Deck, owned: Owned): string[] {
  const problems: string[] = [];
  if (deck.cardIds.length !== DECK_SIZE) {
    problems.push(`Deck has ${deck.cardIds.length} of ${DECK_SIZE} cards.`);
  }

  const counts = new Map<string, number>();
  for (const id of deck.cardIds) counts.set(id, (counts.get(id) ?? 0) + 1);

  const unknown = [...counts.keys()].filter((id) => !cardById(id));
  if (unknown.length > 0) {
    problems.push(`Deck contains ${unknown.length} card(s) that no longer exist.`);
  }

  const unowned = [...counts.entries()].filter(
    ([id, n]) => cardById(id) && n > ownedCount(owned, id)
  );
  if (unowned.length > 0) {
    problems.push(`Deck uses ${unowned.length} card(s) you don't own enough copies of.`);
  }

  if (!deck.class || deck.class === 'Neutral') {
    problems.push('Choose a class for this deck.');
  } else {
    const wrongClass = [...counts.keys()].filter((id) => {
      const card = cardById(id);
      return card ? !cardFitsClass(card, deck.class) : false;
    });
    if (wrongClass.length > 0) {
      const names = wrongClass.slice(0, 3).map((id) => cardById(id)!.name);
      problems.push(
        `${wrongClass.length} card(s) belong to another class: ${names.join(', ')}` +
          (wrongClass.length > 3 ? '…' : '') + '.'
      );
    }
  }

  const overLimit = [...counts.entries()].filter(([id, n]) => {
    const card = cardById(id);
    return card ? n > copyLimitFor(card.rarity) : false;
  });
  if (overLimit.length > 0) {
    const legendary = overLimit.filter((e) => cardById(e[0])?.rarity === 'Legendary');
    problems.push(
      legendary.length > 0
        ? `Only ${LEGENDARY_COPIES} copy of a Legendary is allowed — ${legendary.length} over.`
        : `More than ${MAX_COPIES} copies of ${overLimit.length} card(s).`
    );
  }

  return problems;
}

/**
 * The most cards this collection can legally field, capped at a full deck.
 * Bounded by the per-card limits, so a collection of Legendaries alone cannot
 * fill a deck however many copies it holds.
 */
export function maxDeckSize(owned: Owned, deckClass?: CardClass): number {
  const total = Object.keys(owned).reduce((sum, id) => {
    const card = cardById(id);
    if (deckClass && card && !cardFitsClass(card, deckClass)) return sum;
    return sum + allowedCopies(owned, id);
  }, 0);
  return Math.min(DECK_SIZE, total);
}

/** Distinct cards owned — the real ceiling on deck variety. */
export function distinctCount(owned: Owned): number {
  return Object.keys(owned).filter((id) => allowedCopies(owned, id) > 0).length;
}

/**
 * Fills a legal deck from the collection, respecting every per-card limit.
 * Falls short only when the collection is too thin; the builder surfaces that
 * rather than silently producing junk. Seeded so tests are stable, but defaults
 * to varying per click.
 */
export function autoBuild(
  owned: Owned,
  seed = Date.now(),
  deckClass: CardClass = 'Designer'
): Deck {
  const rng = createRng(seed >>> 0);
  const pool = shuffle(rng, Object.keys(owned).filter((id) => allowedCopies(owned, id) > 0));
  let deck: Deck = { ...emptyDeck('Auto-built deck'), class: deckClass };

  // Two passes, so the deck spreads across distinct cards before doubling up.
  for (let copy = 0; copy < MAX_COPIES; copy++) {
    for (const id of pool) {
      if (deck.cardIds.length >= DECK_SIZE) return deck;
      deck = addCard(deck, owned, id);
    }
  }
  return deck;
}

/** Expands a deck into the card list the engine consumes. */
export function resolveDeck(deck: Deck): Card[] {
  return deck.cardIds.flatMap((id) => {
    const card = cardById(id);
    return card ? [card] : [];
  });
}

/** Card counts for the builder's deck list, ordered by cost then name. */
export function deckEntries(deck: Deck): { card: Card; count: number }[] {
  const counts = new Map<string, number>();
  for (const id of deck.cardIds) counts.set(id, (counts.get(id) ?? 0) + 1);

  return [...counts.entries()]
    .flatMap(([id, count]) => {
      const card = cardById(id);
      return card ? [{ card, count }] : [];
    })
    .sort((a, b) => a.card.cost - b.card.cost || a.card.name.localeCompare(b.card.name));
}

/** Drops deck slots the player can no longer field, so a deck survives a change. */
export function pruneDeck(deck: Deck, owned: Owned): Deck {
  const kept: string[] = [];
  const used = new Map<string, number>();
  for (const id of deck.cardIds) {
    const n = used.get(id) ?? 0;
    if (n >= allowedCopies(owned, id)) continue;
    // A deck that changed class drops the cards that no longer fit.
    const card = cardById(id);
    if (card && !cardFitsClass(card, deck.class)) continue;
    used.set(id, n + 1);
    kept.push(id);
  }
  return { ...deck, cardIds: kept };
}
