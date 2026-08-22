import { describe, expect, it } from 'vitest';
import { ALL_CARDS } from '../data/cards';
import { MAX_OWNED, ownedCount, goldCount, type Owned } from '../collection/owned';
import { starterCollection } from '../data/starter';
import { GOLD_CHANCE, PACK_SIZE, applyPack, openPack } from './pack';
import { PLAYABLE_CLASSES } from '../../types/cards';

const RARE_OR_BETTER = ['Rare', 'Epic', 'Legendary'];

function complete(): Owned {
  const owned: Owned = {};
  for (const card of ALL_CARDS) owned[card.id] = { copies: 2, gold: 0 };
  return owned;
}

/** Everything at two copies except one named card. */
function allBut(cardId: string): Owned {
  const owned = complete();
  delete owned[cardId];
  return owned;
}

describe('pack contents', () => {
  it('always deals five cards', () => {
    for (let seed = 1; seed <= 50; seed++) {
      expect(openPack(starterCollection(), seed)).toHaveLength(PACK_SIZE);
    }
  });

  it('never repeats a card within one pack', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const ids = openPack(starterCollection(), seed).map((p) => p.card.id);
      expect(new Set(ids).size, `seed ${seed}`).toBe(PACK_SIZE);
    }
  });

  it('guarantees the last slot is Rare or better', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const pack = openPack(starterCollection(), seed);
      expect(RARE_OR_BETTER, `seed ${seed}`).toContain(pack[PACK_SIZE - 1].card.rarity);
    }
  });

  it('is deterministic for a given seed', () => {
    const owned = starterCollection();
    const a = openPack(owned, 4242).map((p) => `${p.card.id}:${p.gold}`);
    const b = openPack(owned, 4242).map((p) => `${p.card.id}:${p.gold}`);
    expect(a).toEqual(b);
  });

  it('varies between seeds', () => {
    const owned = starterCollection();
    const first = openPack(owned, 1).map((p) => p.card.id).join();
    const different = [2, 3, 4, 5].some(
      (s) => openPack(owned, s).map((p) => p.card.id).join() !== first
    );
    expect(different).toBe(true);
  });

  it('marks a card the player has none of as new', () => {
    const owned = starterCollection();
    for (const dealt of openPack(owned, 77)) {
      expect(dealt.isNew).toBe(ownedCount(owned, dealt.card.id) === 0);
    }
  });
});

describe('what a pack will not deal', () => {
  it('never deals a card already held at two copies', () => {
    const owned = starterCollection();
    const held = Object.keys(owned);
    for (let seed = 1; seed <= 300; seed++) {
      for (const dealt of openPack(owned, seed)) {
        expect(held, `seed ${seed} dealt ${dealt.card.id}`).not.toContain(dealt.card.id);
      }
    }
  });

  // The last card is the whole point of the no-duplicates rule.
  it('always deals the one missing card when only one is missing', () => {
    const target = ALL_CARDS[40].id;
    const owned = allBut(target);
    for (let seed = 1; seed <= 20; seed++) {
      const ids = openPack(owned, seed).map((p) => p.card.id);
      expect(ids, `seed ${seed}`).toContain(target);
    }
  });

  it('still deals five cards once the collection is complete', () => {
    const pack = openPack(complete(), 9);
    expect(pack).toHaveLength(PACK_SIZE);
    expect(new Set(pack.map((p) => p.card.id)).size).toBe(PACK_SIZE);
  });
});

describe('rarity distribution', () => {
  it('follows the weights across many packs', () => {
    const counts: Record<string, number> = {};
    let total = 0;
    // Against an empty collection, so the pool is the whole set every time.
    for (let seed = 1; seed <= 2000; seed++) {
      // Only the four weighted slots; the fifth is guaranteed and would skew it.
      for (const dealt of openPack({}, seed).slice(0, 4)) {
        counts[dealt.card.rarity] = (counts[dealt.card.rarity] ?? 0) + 1;
        total++;
      }
    }
    const share = (r: string) => (counts[r] ?? 0) / total;
    expect(share('Common')).toBeGreaterThan(0.4);
    expect(share('Common')).toBeLessThan(0.6);
    expect(share('Uncommon')).toBeGreaterThan(0.2);
    expect(share('Uncommon')).toBeLessThan(0.4);
    expect(share('Legendary')).toBeLessThan(0.05);
  });
});

describe('gold variants', () => {
  it('lands near the stated rate', () => {
    let gold = 0;
    let total = 0;
    for (let seed = 1; seed <= 4000; seed++) {
      for (const dealt of openPack({}, seed)) {
        if (dealt.gold) gold++;
        total++;
      }
    }
    const rate = gold / total;
    expect(rate).toBeGreaterThan(GOLD_CHANCE * 0.7);
    expect(rate).toBeLessThan(GOLD_CHANCE * 1.3);
  });

  it('upgrades a held copy rather than being wasted', () => {
    const id = ALL_CARDS[0].id;
    const owned: Owned = { [id]: { copies: 2, gold: 0 } };
    const next = applyPack(owned, [{ card: ALL_CARDS[0], gold: true, isNew: false }]);

    expect(ownedCount(next, id)).toBe(2);
    expect(goldCount(next, id)).toBe(1);
  });

  it('never lets gold exceed copies, whatever a pack contains', () => {
    let owned: Owned = {};
    for (let seed = 1; seed <= 400; seed++) {
      owned = applyPack(owned, openPack(owned, seed));
      for (const [id, entry] of Object.entries(owned)) {
        expect(entry.gold, `${id} after seed ${seed}`).toBeLessThanOrEqual(entry.copies);
        expect(entry.copies, id).toBeLessThanOrEqual(MAX_OWNED);
      }
    }
  });
});

describe('applying a pack', () => {
  it('adds a copy of each card', () => {
    const pack = openPack({}, 5);
    const owned = applyPack({}, pack);
    for (const dealt of pack) expect(ownedCount(owned, dealt.card.id)).toBe(1);
  });

  it('does not mutate the collection it was given', () => {
    const before: Owned = {};
    applyPack(before, openPack({}, 5));
    expect(before).toEqual({});
  });

  it('completes a collection after enough packs, and never overfills', () => {
    let owned: Owned = {};
    for (let seed = 1; seed <= 400; seed++) owned = applyPack(owned, openPack(owned, seed));

    const missing = ALL_CARDS.filter((c) => ownedCount(owned, c.id) < MAX_OWNED);
    expect(missing, `still missing ${missing.length}`).toHaveLength(0);
    expect(Object.keys(owned)).toHaveLength(ALL_CARDS.length);
  });
});

describe('class cards in packs', () => {
  const CLASS_CARDS = ALL_CARDS.filter((c) => (c.class ?? 'Neutral') !== 'Neutral');

  it('the set has class cards to deal', () => {
    expect(CLASS_CARDS.length).toBe(40);
  });

  it('reserves a slot, so every pack carries one', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const pack = openPack({}, seed);
      const classCards = pack.filter((p) => (p.card.class ?? 'Neutral') !== 'Neutral');
      expect(classCards.length, `seed ${seed}`).toBeGreaterThanOrEqual(1);
    }
  });

  it('still guarantees the last slot is Rare or better', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const pack = openPack({}, seed);
      expect(RARE_OR_BETTER, `seed ${seed}`).toContain(pack[PACK_SIZE - 1].card.rarity);
    }
  });

  it('still never repeats a card within a pack', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const ids = openPack({}, seed).map((p) => p.card.id);
      expect(new Set(ids).size, `seed ${seed}`).toBe(PACK_SIZE);
    }
  });

  it('falls back gracefully once every class card is owned', () => {
    const owned: Owned = {};
    for (const card of CLASS_CARDS) owned[card.id] = { copies: 2, gold: 0 };
    const pack = openPack(owned, 5);
    expect(pack).toHaveLength(PACK_SIZE);
    expect(pack.every((p) => (p.card.class ?? 'Neutral') === 'Neutral')).toBe(true);
  });

  /**
   * The curve that actually matters.
   *
   * Class is a property of a **deck**, not a player — people build several decks
   * across several classes — so the meaningful question is how fast cards arrive
   * across *all four*, not how fast one class completes. Re-measured 2026-08-22
   * after the class slot began aiming at the thinnest class: one card of every
   * class by 4 packs at worst, five of every class by ~16, the whole 210-card
   * collection by 78.
   *
   * These are regression guards on the shape of the curve. If they start
   * failing, re-measure rather than nudging them.
   */
  it('gives a card of every class within four packs, from any seed', () => {
    for (let run = 0; run < 40; run++) {
      let owned: Owned = {};
      for (let p = 1; p <= 4; p++) owned = applyPack(owned, openPack(owned, run * 4001 + p));
      const per = PLAYABLE_CLASSES.map(
        (cls) => ALL_CARDS.filter((c) => c.class === cls && (owned[c.id]?.copies ?? 0) > 0).length
      );
      // The onboarding package hands over seven packs (DECISIONS.md §13); this
      // is what makes "every class is playable straight away" a promise rather
      // than a median. Before the thinnest-class rule, 17% of players finished
      // those seven still owning nothing of some class.
      expect(Math.min(...per), `run ${run} reached ${per.join('/')}`).toBeGreaterThanOrEqual(1);
    }
  });

  it('spreads across all four classes quickly', () => {
    let owned: Owned = {};
    let packs = 0;
    const distinct = (cls: string) =>
      ALL_CARDS.filter((c) => c.class === cls && (owned[c.id]?.copies ?? 0) > 0).length;

    while (packs < 60 && !PLAYABLE_CLASSES.every((c) => distinct(c) >= 5)) {
      owned = applyPack(owned, openPack(owned, packs + 1));
      packs++;
    }

    expect(
      PLAYABLE_CLASSES.every((c) => distinct(c) >= 5),
      `only reached ${PLAYABLE_CLASSES.map((c) => `${c}:${distinct(c)}`).join(' ')}`
    ).toBe(true);
    // 17 packs on this sequence — ~6 days at realistic income, or day 5 with
    // the onboarding package. Re-measure rather than nudge.
    expect(packs, `took ${packs} packs`).toBeLessThan(24);
  });

  // The number that decides whether collecting a class feels reasonable.
  // Measured, not estimated — see OPEN-QUESTIONS.md #16.
  it('delivers one class’s full set in a sane number of packs', () => {
    const target = 'Designer';
    const wanted = CLASS_CARDS.filter((c) => c.class === target).map((c) => c.id);

    let owned: Owned = {};
    let packs = 0;
    while (packs < 400) {
      const complete = wanted.every((id) => (owned[id]?.copies ?? 0) >= 2);
      if (complete) break;
      owned = applyPack(owned, openPack(owned, packs + 1));
      packs++;
    }

    expect(wanted.every((id) => (owned[id]?.copies ?? 0) >= 2), 'never completed').toBe(true);

    // 56 packs. Worth knowing, but **not the number to optimise**: a player
    // building decks across several classes is served by the spread test above,
    // not by rushing one class. Completing a single class is a late-game
    // milestone, and it lands at roughly the same time as the whole collection
    // (78 packs) because packs never deal a card already held at two copies.
    //
    // A regression guard, not a target. Re-measure rather than nudge.
    expect(packs, `took ${packs} packs`).toBeLessThan(70);
  });
});
