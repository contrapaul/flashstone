import { describe, expect, it } from 'vitest';
import { ALL_CARDS } from '../data/cards';
import { MAX_OWNED, ownedCount, goldCount, type Owned } from '../collection/owned';
import { starterCollection } from '../data/starter';
import { GOLD_CHANCE, PACK_SIZE, applyPack, openPack } from './pack';

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
