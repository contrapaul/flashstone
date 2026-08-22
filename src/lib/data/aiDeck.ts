import type { Card } from '../../types/cards';
import { createRng, shuffle } from '../engine/rng';
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

/** Seeded so practice is reproducible; vary the seed for a different opponent. */
export function buildAiDeck(seed = 20260821): Card[] {
  const rng = createRng(seed >>> 0);
  const deck: Card[] = [];

  for (const id of STAPLES) {
    const card = ALL_CARDS.find((c) => c.id === id);
    if (card) deck.push(card);
  }

  for (const [cost, want] of Object.entries(CURVE)) {
    const pool = shuffle(
      rng,
      ALL_CARDS.filter((c) => c.cost === Number(cost))
    );
    // One copy each, so no per-card or Legendary limit can be breached, and
    // never a card the staples already supplied.
    const fresh = pool.filter((c) => !deck.includes(c));
    deck.push(...fresh.slice(0, want));
  }

  // The staples pushed it over; trim from the top of the curve, which is where
  // an extra card matters least.
  return deck.sort((a, b) => a.cost - b.cost).slice(0, DECK_TARGET);
}
