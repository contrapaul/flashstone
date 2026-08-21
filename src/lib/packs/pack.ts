import type { Card, Rarity } from '../../types/cards';
import { ALL_CARDS } from '../data/cards';
import { MAX_OWNED, ownedCount, type Owned } from '../collection/owned';
import { RARITY_WEIGHTS } from '../../utils/rarity';
import { createRng, type Rng } from '../engine/rng';

/**
 * Opening a pack.
 *
 * Pure and seeded, so a pack can be generated on the server, replayed in a test,
 * and audited later. Rules are DECISIONS.md §3 and §10.
 */

export const PACK_SIZE = 5;
export const PACK_COST = 100;
/** Chance that any single card in a pack arrives gold. Packs are the only source. */
export const GOLD_CHANCE = 0.05;

/** The guaranteed slot is Rare or better — the reason a pack always feels worth it. */
const RARE_OR_BETTER: Rarity[] = ['Rare', 'Epic', 'Legendary'];

export interface PackCard {
  card: Card;
  gold: boolean;
  /** False when this is the player's second copy — the UI marks them differently. */
  isNew: boolean;
}

function weightedRarity(rng: Rng, pool: Card[]): Rarity | null {
  const available = new Set(pool.map((c) => c.rarity));
  const rarities = (Object.keys(RARITY_WEIGHTS) as Rarity[]).filter((r) => available.has(r));
  if (rarities.length === 0) return null;

  const total = rarities.reduce((sum, r) => sum + RARITY_WEIGHTS[r], 0);
  let roll = rng.next() * total;
  for (const rarity of rarities) {
    roll -= RARITY_WEIGHTS[rarity];
    if (roll < 0) return rarity;
  }
  return rarities[rarities.length - 1];
}

function pickFrom(rng: Rng, pool: Card[]): Card | null {
  if (pool.length === 0) return null;
  return pool[Math.floor(rng.next() * pool.length)];
}

/**
 * Deals one pack.
 *
 * The pool is what the player does not already hold two of, so a pack never
 * wastes a slot on a card they cannot use — until the collection is complete,
 * at which point the constraint lifts and the whole set is fair game again.
 *
 * Gold is rolled **after** the card is chosen and independently of it. That is
 * what lets a gold copy of an already-maxed card still be worth something: the
 * standard pool excludes it, but `applyPack` upgrades a held copy instead.
 */
export function openPack(owned: Owned, seed: number): PackCard[] {
  const rng = createRng(seed >>> 0);

  const incomplete = ALL_CARDS.filter((c) => ownedCount(owned, c.id) < MAX_OWNED);
  const complete = incomplete.length === 0;
  // A complete collection would otherwise deal an empty pack.
  const source = complete ? ALL_CARDS : incomplete;

  const chosen: Card[] = [];
  for (let slot = 0; slot < PACK_SIZE; slot++) {
    // No two of the same card in one pack, which would read as a bad pack even
    // when the second copy is legitimately useful.
    const remaining = source.filter((c) => !chosen.includes(c));
    const guaranteed = slot === PACK_SIZE - 1;

    let pool = remaining;
    if (guaranteed) {
      const good = remaining.filter((c) => RARE_OR_BETTER.includes(c.rarity));
      // Only fall back to the full pool if the set genuinely has no Rare left.
      if (good.length > 0) pool = good;
    }

    const rarity = weightedRarity(rng, pool);
    const byRarity = rarity ? pool.filter((c) => c.rarity === rarity) : pool;
    const card = pickFrom(rng, byRarity.length > 0 ? byRarity : pool);
    if (!card) break;
    chosen.push(card);
  }

  return chosen.map((card) => ({
    card,
    gold: rng.next() < GOLD_CHANCE,
    isNew: ownedCount(owned, card.id) === 0
  }));
}

/**
 * Folds a dealt pack into a collection.
 *
 * Returns a new object; the invariant `gold <= copies <= 2` holds on the way out.
 * A gold card the player already holds two standard copies of **upgrades one**
 * rather than being discarded — the roll is the only way to get gold, so
 * throwing it away would make the rarest thing in the game worthless.
 */
export function applyPack(owned: Owned, pack: PackCard[]): Owned {
  const next: Owned = { ...owned };

  for (const { card, gold } of pack) {
    const current = next[card.id];
    const copies = Math.min(MAX_OWNED, (current?.copies ?? 0) + 1) as 1 | 2;
    const heldGold = current?.gold ?? 0;
    next[card.id] = {
      copies,
      gold: Math.min(copies, heldGold + (gold ? 1 : 0)) as 0 | 1 | 2
    };
  }

  return next;
}
