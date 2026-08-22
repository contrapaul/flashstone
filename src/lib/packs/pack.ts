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

/**
 * One slot per pack is reserved for a class card, drawn from whichever class
 * the collection currently holds fewest distinct cards of.
 *
 * Class cards are only obtainable from packs, and they are a small share of a
 * large pool: without a reserved slot at all, a full two-copy set of one class
 * is around 84 packs — over a month of daily play, likely longer than the topic
 * is taught. See OPEN-QUESTIONS.md #16; the measured figures are asserted in
 * pack.test.ts rather than trusted.
 *
 * Reserving the slot for *any* class left a real tail: measured over 300 runs,
 * 17% of players still owned nothing of some class after seven packs, and half
 * needed 5 packs to touch all four with a p90 of 9. Aiming the slot at the
 * thinnest class makes that deterministic — every class by pack 4, five of
 * every class by 16 — and changes nothing later: the whole collection still
 * takes 78 packs and one class still completes at 51, because the pool is the
 * same set of cards either way.
 *
 * Thinnest is a property of the **collection**, not of the player. There is no
 * "player's class" to bias toward — class is a per-deck choice (DECISIONS.md
 * §11) — and this rule deliberately does not invent one.
 */
const RESERVE_CLASS_SLOT = true;

function isClassCard(card: Card): boolean {
  return (card.class ?? 'Neutral') !== 'Neutral';
}

/**
 * Narrows a pool of class cards to the classes the player holds fewest distinct
 * cards of, counting only classes still present in the pool — a class already
 * collected in full cannot be the thinnest one, or the slot would aim at
 * nothing. Ties keep every tied class, so the rng still chooses between them.
 */
function thinnestClass(owned: Owned, classCards: Card[]): Card[] {
  const held = new Map<string, number>();
  for (const card of ALL_CARDS) {
    const cls = card.class;
    if (!cls || cls === 'Neutral') continue;
    if (ownedCount(owned, card.id) > 0) held.set(cls, (held.get(cls) ?? 0) + 1);
  }

  let fewest = Infinity;
  for (const card of classCards) fewest = Math.min(fewest, held.get(card.class!) ?? 0);
  return classCards.filter((c) => (held.get(c.class!) ?? 0) === fewest);
}

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
    // The class slot is the first, so it can never collide with the guaranteed
    // Rare in the last — the two reservations stay independent.
    const classSlot = RESERVE_CLASS_SLOT && slot === 0;

    let pool = remaining;
    if (guaranteed) {
      const good = remaining.filter((c) => RARE_OR_BETTER.includes(c.rarity));
      // Only fall back to the full pool if the set genuinely has no Rare left.
      if (good.length > 0) pool = good;
    } else if (classSlot) {
      const classCards = remaining.filter(isClassCard);
      // Falls back to the whole pool once every class card is collected, rather
      // than dealing a short pack.
      if (classCards.length > 0) pool = thinnestClass(owned, classCards);
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
