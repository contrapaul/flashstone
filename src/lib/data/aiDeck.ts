import type { Card, CardClass } from '../../types/cards';
import { createRng, shuffle } from '../engine/rng';
import { cardFitsClass } from '../decks/deck';
import { ALL_CARDS } from './cards';

/**
 * The opponent's deck.
 *
 * Both sides used to play the player's own list, which made every practice game
 * a mirror match. The AI now draws from the whole card set, so you meet cards
 * you do not own yet.
 *
 * Built to a curve rather than at random: an unweighted draw from the set lands
 * mostly on six-plus drops, and the AI's play logic curves out, so it would sit
 * doing nothing for six turns.
 */
const CURVE: Record<number, number> = { 1: 4, 2: 6, 3: 6, 4: 5, 5: 4, 6: 3, 7: 2 };

/**
 * Cards the opponent always carries.
 *
 * Weapons and aimed spells exist, so the AI has to be able to show them to a
 * player who has not collected any yet — otherwise the mechanics are invisible
 * in the only mode most people will play.
 */
const STAPLES = ['drafting-blade', 'bench-hammer', 'fireball', 'frostbolt', 'dismantle'];

const DECK_TARGET = 30;

/**
 * A deck for a class, as a player would build one: **every one of the class's
 * own cards first**, then the staples, then Neutral cards filling out the
 * curve around them. So each class plays like itself in practice — the
 * Designer goes wide, the Engineer armors up — and the deck is legal for that
 * class. `Neutral` builds a deck of Neutral cards only.
 *
 * Seeded so practice is reproducible; vary the seed for a different opponent.
 */
export function buildAiDeck(seed = 20260821, heroClass: CardClass = 'Neutral'): Card[] {
  const rng = createRng(seed >>> 0);
  const fits = (c: Card) => cardFitsClass(c, heroClass);
  const classCards = heroClass === 'Neutral' ? [] : ALL_CARDS.filter((c) => c.class === heroClass);
  const deck: Card[] = [...classCards];

  for (const id of STAPLES) {
    const card = ALL_CARDS.find((c) => c.id === id);
    if (card && fits(card) && !deck.includes(card)) deck.push(card);
  }

  // The curve is for the whole deck, so what is already in it counts against
  // each cost's share. Neutral cards fill whatever is left.
  for (const [cost, want] of Object.entries(CURVE)) {
    const have = deck.filter((c) => Math.min(c.cost, 7) === Number(cost)).length;
    const pool = shuffle(
      rng,
      ALL_CARDS.filter((c) => c.cost === Number(cost) && (c.class ?? 'Neutral') === 'Neutral')
    );
    // One copy each, so no per-card or Legendary limit can be breached.
    const fresh = pool.filter((c) => !deck.includes(c));
    deck.push(...fresh.slice(0, Math.max(0, want - have)));
  }

  // Over the target: trim Neutral cards from the top of the curve, where an
  // extra card matters least. The class's own cards always stay.
  const sorted = deck.sort((a, b) => a.cost - b.cost);
  while (sorted.length > DECK_TARGET) {
    const last = sorted.findLastIndex((c) => !classCards.includes(c));
    sorted.splice(last, 1);
  }
  return sorted;
}
