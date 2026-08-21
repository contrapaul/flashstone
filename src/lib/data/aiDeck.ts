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

/** Seeded so practice is reproducible; vary the seed for a different opponent. */
export function buildAiDeck(seed = 20260821): Card[] {
  const rng = createRng(seed >>> 0);
  const deck: Card[] = [];

  for (const [cost, want] of Object.entries(CURVE)) {
    const pool = shuffle(
      rng,
      ALL_CARDS.filter((c) => c.cost === Number(cost))
    );
    // One copy each, so no per-card or Legendary limit can be breached.
    deck.push(...pool.slice(0, want));
  }

  return deck;
}
