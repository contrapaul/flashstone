import { describe, expect, it } from 'vitest';
import { CardSchema } from '../../validators/card.validator';
import { PLAYABLE_CLASSES, type CardClass } from '../../types/cards';
import { ALL_CARDS, cardById } from './cards';
import { HERO_POWERS } from './classes';
import { DESIGN_IDEAS, STUDY_NOTE, tokenById } from './tokens';

describe('the four classes', () => {
  it('each has a hero power, and Neutral has none', () => {
    for (const heroClass of PLAYABLE_CLASSES) {
      expect(HERO_POWERS[heroClass], heroClass).toBeTruthy();
    }
    expect(HERO_POWERS.Neutral).toBeNull();
  });

  it('names them as agreed', () => {
    expect(HERO_POWERS.Designer!.name).toBe('Summon a Design Idea');
    expect(HERO_POWERS.Engineer!.name).toBe('Make it Stronger');
    expect(HERO_POWERS.Consumer!.name).toBe('Pay on Credit');
    expect(HERO_POWERS.Manufacturer!.name).toBe('Robotic Arm');
  });

  it('only the Manufacturer needs a target', () => {
    expect(HERO_POWERS.Manufacturer!.needsTarget).toBe(true);
    for (const c of ['Designer', 'Engineer', 'Consumer'] as CardClass[]) {
      expect(HERO_POWERS[c]!.needsTarget, c).toBeFalsy();
    }
  });
});

describe('the class card set', () => {
  const byClass = (c: CardClass) => ALL_CARDS.filter((card) => card.class === c);

  it('gives each class exactly ten cards', () => {
    for (const heroClass of PLAYABLE_CLASSES) {
      expect(byClass(heroClass), heroClass).toHaveLength(10);
    }
  });

  it('leaves every syllabus card Neutral', () => {
    const sl = ALL_CARDS.filter((c) => c.definition);
    expect(sl.length).toBeGreaterThan(150);
    for (const card of sl) {
      expect(card.class ?? 'Neutral', card.id).toBe('Neutral');
    }
  });

  it('validates every class card', () => {
    for (const heroClass of PLAYABLE_CLASSES) {
      for (const card of byClass(heroClass)) {
        expect(() => CardSchema.parse(card), card.id).not.toThrow();
      }
    }
  });

  // Keywords render on their own line; naming them in the text prints them twice.
  it('keeps keyword names out of class card text', () => {
    for (const card of ALL_CARDS) {
      for (const keyword of card.keywords) {
        expect(card.description, `${card.id} repeats ${keyword}`).not.toContain(keyword);
      }
    }
  });

  it('gives each class a usable curve', () => {
    for (const heroClass of PLAYABLE_CLASSES) {
      const costs = byClass(heroClass).map((c) => c.cost);
      expect(Math.min(...costs), heroClass).toBeLessThanOrEqual(2);
      expect(Math.max(...costs), heroClass).toBeLessThanOrEqual(7);
    }
  });

  it('gives each class exactly one Legendary', () => {
    for (const heroClass of PLAYABLE_CLASSES) {
      expect(byClass(heroClass).filter((c) => c.rarity === 'Legendary'), heroClass).toHaveLength(1);
    }
  });
});

describe('the Design Ideas', () => {
  it('are the four renamed totems, with their original statlines', () => {
    const byName = Object.fromEntries(DESIGN_IDEAS.map((i) => [i.name, i]));

    expect(byName['Rechargeable Battery']).toMatchObject({ attack: 0, health: 2 });
    expect(byName['OLED Screen']).toMatchObject({ attack: 1, health: 1 });
    expect(byName['Reinforced Frame']).toMatchObject({ attack: 0, health: 2, keywords: ['Taunt'] });
    expect(byName['Overclocked CPU']).toMatchObject({ attack: 0, health: 2, spellDamage: 1 });
  });

  it('all cost 1 and belong to the Designer', () => {
    for (const idea of DESIGN_IDEAS) {
      expect(idea.cost, idea.name).toBe(1);
      expect(idea.class, idea.name).toBe('Designer');
    }
  });

  it('resolve by id, including the generic Study Note', () => {
    for (const idea of DESIGN_IDEAS) expect(tokenById(idea.id)).toBe(idea);
    expect(tokenById(STUDY_NOTE.id)).toBe(STUDY_NOTE);
  });

  // Tokens are summoned, never owned: packs must not deal them and they must not
  // count toward collection completion.
  it('are not in the card registry', () => {
    for (const idea of [...DESIGN_IDEAS, STUDY_NOTE]) {
      expect(cardById(idea.id), idea.name).toBeUndefined();
    }
  });
});
