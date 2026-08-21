import type { Card } from '../../types/cards';
import { ALL_CARDS, cardById } from '../data/cards';

/**
 * What a player owns.
 *
 * Not a list of card objects — the cards themselves live in the registry
 * (`data/cards.ts`) and are the same for everyone. A collection is only
 * *counts*, keyed by card id, which is what lets the card set grow without
 * touching anybody's collection.
 *
 * Gold is a **variant, not a separate card** (DECISIONS.md §10). A gold copy
 * overrides a standard one rather than adding to the total, so `gold` can never
 * exceed `copies` and `copies` can never exceed two.
 */

export const MAX_OWNED = 2;

export interface CardOwnership {
  copies: 1 | 2;
  /** How many of those copies are gold. Always <= copies. */
  gold: 0 | 1 | 2;
}

export type Owned = Record<string, CardOwnership>;

export function ownedCount(owned: Owned, cardId: string): number {
  return owned[cardId]?.copies ?? 0;
}

export function goldCount(owned: Owned, cardId: string): number {
  return owned[cardId]?.gold ?? 0;
}

export function isGold(owned: Owned, cardId: string): boolean {
  return goldCount(owned, cardId) > 0;
}

/** Distinct cards owned, in registry order. Unknown ids are skipped. */
export function ownedCards(owned: Owned): Card[] {
  return Object.keys(owned).flatMap((id) => {
    const card = cardById(id);
    return card && ownedCount(owned, id) > 0 ? [card] : [];
  });
}

/** Total copies held, counting both of a pair. */
export function totalCopies(owned: Owned): number {
  return Object.values(owned).reduce((n, entry) => n + entry.copies, 0);
}

/**
 * Grants copies, clamped at two. Returns a new object — callers treat the
 * collection as immutable so Svelte reactivity and server writes stay honest.
 */
export function addCopies(owned: Owned, cardId: string, count = 1): Owned {
  if (count <= 0) return owned;
  const current = owned[cardId];
  const copies = Math.min(MAX_OWNED, (current?.copies ?? 0) + count) as 1 | 2;
  return { ...owned, [cardId]: { copies, gold: current?.gold ?? 0 } };
}

/**
 * Turns owned copies gold.
 *
 * A gold roll on a card already held at two standard copies is **not wasted** —
 * it upgrades one of them (DECISIONS.md §10). If the card is not owned at all,
 * the gold copy grants it.
 */
export function upgradeToGold(owned: Owned, cardId: string, count = 1): Owned {
  if (count <= 0) return owned;
  const granted = owned[cardId] ? owned : addCopies(owned, cardId, 1);
  const current = granted[cardId];
  const gold = Math.min(current.copies, current.gold + count) as 0 | 1 | 2;
  return { ...granted, [cardId]: { ...current, gold } };
}

/**
 * Every card in the registry held at two copies.
 *
 * Derived from `ALL_CARDS` at call time and never cached: adding cards must move
 * the finish line, not strand a player past it (DECISIONS.md §9).
 */
export function isComplete(owned: Owned): boolean {
  return ALL_CARDS.every((card) => ownedCount(owned, card.id) >= MAX_OWNED);
}

/** Cards that could still come out of a pack — anything short of two copies. */
export function incompleteCardIds(owned: Owned): string[] {
  return ALL_CARDS.filter((card) => ownedCount(owned, card.id) < MAX_OWNED).map((c) => c.id);
}
