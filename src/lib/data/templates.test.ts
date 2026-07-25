import { describe, expect, it } from 'vitest';
import type { Rarity } from '../../types/cards';
import { CardSchema } from '../../validators/card.validator';
import { RARITY_WEIGHTS } from '../../utils/rarity';
import { TEMPLATES, nearestTemplate, templateById, templateForHash } from './templates';

const RARITIES = Object.keys(RARITY_WEIGHTS) as Rarity[];

describe('the template library', () => {
  it('is big enough to feel varied', () => {
    expect(TEMPLATES.length).toBeGreaterThanOrEqual(100);
  });

  it('has unique ids', () => {
    const ids = TEMPLATES.map((t) => t.id);
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    expect(dupes, `duplicate template ids: ${[...new Set(dupes)].join(', ')}`).toEqual([]);
  });

  it('finds every template by its own id', () => {
    for (const template of TEMPLATES) {
      expect(templateById(template.id)).toBe(template);
    }
  });

  it('keeps every template inside the card schema bounds', () => {
    for (const t of TEMPLATES) {
      expect(() =>
        CardSchema.parse({
          id: '00000000-0000-4000-8000-000000000000',
          name: t.id,
          cost: t.cost,
          type: 'Minion',
          rarity: t.rarity,
          attack: t.attack,
          health: t.health,
          keywords: t.keywords,
          effects: [],
          description: t.id,
          tags: []
        })
      , t.id).not.toThrow();
    }
  });

  it('covers the whole mana curve', () => {
    const costs = new Set(TEMPLATES.map((t) => t.cost));
    for (let cost = 1; cost <= 10; cost++) {
      expect(costs, `no template costs ${cost}`).toContain(cost);
    }
  });

  it('offers every rarity, so rarity-weighted binding always resolves', () => {
    for (const rarity of RARITIES) {
      expect(
        TEMPLATES.some((t) => t.rarity === rarity),
        `no ${rarity} template`
      ).toBe(true);
    }
  });

  it('uses every keyword the engine implements', () => {
    const used = new Set(TEMPLATES.flatMap((t) => t.keywords));
    for (const keyword of ['Taunt', 'Charge', 'DivineShield', 'Windfury', 'Stealth']) {
      expect(used, `no template grants ${keyword}`).toContain(keyword);
    }
  });

  it('stays near the vanilla stat budget', () => {
    // Roughly 2N+1, with headroom for rarity and keyword trade-offs.
    for (const t of TEMPLATES) {
      const budget = 2 * t.cost + 1;
      const total = t.attack + t.health;
      expect(total, `${t.id} is far off curve`).toBeGreaterThanOrEqual(budget - 4);
      expect(total, `${t.id} is far off curve`).toBeLessThanOrEqual(budget + 4);
    }
  });
});

describe('binding a hash to a template', () => {
  it('is deterministic', () => {
    for (const hash of [0, 1, 99, 123456, 0xffffffff]) {
      expect(templateForHash(hash)).toBe(templateForHash(hash));
    }
  });

  it('always returns a template from the library', () => {
    for (let i = 0; i < 2000; i++) {
      expect(templateById(templateForHash(i * 2654435761).id)).toBeDefined();
    }
  });

  it('leans common, so rare cards stay rare', () => {
    const sample = Array.from({ length: 4000 }, (_, i) => templateForHash(i * 2654435761));
    const share = (r: Rarity) => sample.filter((t) => t.rarity === r).length / sample.length;

    expect(share('Common')).toBeGreaterThan(share('Rare'));
    expect(share('Rare')).toBeGreaterThan(share('Legendary'));
    expect(share('Legendary')).toBeGreaterThan(0);
  });

  it('reaches a wide spread of the library', () => {
    const seen = new Set(
      Array.from({ length: 4000 }, (_, i) => templateForHash(i * 2654435761).id)
    );
    expect(seen.size).toBeGreaterThan(TEMPLATES.length / 2);
  });
});

describe('snapping supplied stats to a template', () => {
  it('returns an exact match when one exists', () => {
    const target = TEMPLATES.find((t) => t.cost === 4 && t.rarity === 'Common')!;
    const got = nearestTemplate({
      cost: target.cost,
      attack: target.attack,
      health: target.health,
      rarity: target.rarity
    });
    expect(got.cost).toBe(target.cost);
    expect(got.attack).toBe(target.attack);
    expect(got.health).toBe(target.health);
  });

  it('respects an explicitly named rarity', () => {
    expect(nearestTemplate({ cost: 4, rarity: 'Legendary' }).rarity).toBe('Legendary');
    expect(nearestTemplate({ cost: 2, rarity: 'Epic' }).rarity).toBe('Epic');
  });

  it('prefers the requested cost above raw stats', () => {
    expect(nearestTemplate({ cost: 7, attack: 1, health: 1 }).cost).toBe(7);
  });

  it('still lands on a real template for nonsense input', () => {
    const got = nearestTemplate({ cost: 99, attack: 99, health: 99 });
    expect(templateById(got.id)).toBeDefined();
  });
});
