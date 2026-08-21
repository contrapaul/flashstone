import type { Owned } from '../collection/owned';
import { emptyDeck, type Deck } from '../decks/deck';

/**
 * The 15 cards every player starts with, two copies each — exactly one legal
 * 30-card deck, so a new account can play immediately without visiting the shop.
 *
 * Chosen by curve rather than by power: 3 one-drops, 4 twos, 3 threes, 2 fours,
 * 2 fives and a six, all drawn from the A-sections so a new player meets the
 * foundational vocabulary first. No Legendaries — they are singletons, which
 * would leave the deck a card short of 30.
 *
 * Two of the fifteen are Spells, so a starting player can make progress on the
 * "cast 10 spells" quest without opening a pack.
 */
export const STARTER_CARD_IDS = [
  // 1 mana
  'static-data',
  'haptic-technology',
  'user-observation',
  // 2 mana
  'psychology-factors',
  'population-stereotype',
  'rapid-prototyping',
  'circular-economy',
  // 3 mana
  'scenario',
  'user-population',
  'augmented-reality-ar',
  // 4 mana
  'motion-capture',
  'functional-prototype',
  // 5 mana
  'research-question',
  'task-analysis',
  // 6 mana
  'research-stage'
] as const;

/** Two copies of each starter card. The collection a new account is granted. */
export function starterCollection(): Owned {
  const owned: Owned = {};
  for (const id of STARTER_CARD_IDS) owned[id] = { copies: 2, gold: 0 };
  return owned;
}

/**
 * The starter deck itself — both copies of all fifteen, in curve order. Used
 * for signed-out practice and as the fallback whenever no deck is saved.
 */
export function starterDeck(): Deck {
  return {
    ...emptyDeck('Starter deck'),
    cardIds: STARTER_CARD_IDS.flatMap((id) => [id, id])
  };
}
