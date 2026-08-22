import { describe, expect, it } from 'vitest';
import { CardSchema } from '../../validators/card.validator';
import { RARITY_WEIGHTS } from '../../utils/rarity';
import type { Rarity } from '../../types/cards';
import { TEMPLATES } from './templates';
import { SL_TERMS } from './slTerms';
import { ALL_CARDS, allCardIds, cardById } from './cards';
import { SL_CARDS } from './slCards';
import { CUSTOM_CARDS } from './customCards';

const RARITIES = Object.keys(RARITY_WEIGHTS) as Rarity[];

describe('the generated SL term list', () => {
  it('covers the whole source file', () => {
    // 167 rows in slcards.txt collapse to 155 cards: ten terms appear under two
    // sections each, and two more differ only in capitalisation.
    expect(SL_TERMS.length).toBe(155);
  });

  it('carries the four HL terms, all from C4.1', () => {
    const hl = SL_TERMS.filter((t) => t.hl);
    expect(hl).toHaveLength(4);
    for (const term of hl) expect(term.sections).toContain('C4.1');
  });

  it('records every section a repeated term appears under', () => {
    // 167 rows - 155 cards = 12 repeated rows, spread over 11 terms: one of
    // them, User-Centred Research Methods, appears three times.
    const shared = SL_TERMS.filter((t) => t.sections.length > 1);
    expect(shared.length).toBe(11);
    expect(shared.reduce((n, t) => n + t.sections.length - 1, 0)).toBe(12);

    const thrice = SL_TERMS.find((t) => t.id === 'user-centred-research-methods');
    expect(thrice?.sections).toEqual(['A2.1', 'B1.1', 'C1.2']);
  });

  it('gives every term a definition', () => {
    for (const term of SL_TERMS) {
      expect(term.definition.length, term.id).toBeGreaterThan(0);
    }
  });
});

describe('card ids', () => {
  it('are lowercase slugs', () => {
    for (const id of allCardIds()) {
      expect(id, id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it('are unique across the whole registry', () => {
    const ids = allCardIds();
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('resolve back to their card', () => {
    for (const card of ALL_CARDS) expect(cardById(card.id)).toBe(card);
  });
});

describe('every card', () => {
  it('passes the card schema', () => {
    for (const card of ALL_CARDS) {
      expect(() => CardSchema.parse(card), `${card.id}: ${card.description}`).not.toThrow();
    }
  });

  it('sits on a real template statline', () => {
    const minions = ALL_CARDS.filter((c) => c.type === 'Minion');
    for (const card of minions) {
      const match = TEMPLATES.some(
        (t) =>
          t.cost === card.cost &&
          t.attack === card.attack &&
          t.health === card.health &&
          t.rarity === card.rarity
      );
      expect(match, `${card.id} — ${card.cost}/${card.attack}/${card.health}`).toBe(true);
    }
  });

  // Only syllabus cards have a definition. The hand-authored spells and weapons
  // in customCards.ts are game pieces, not terms, and correctly have none.
  it('carries its definition when it is a syllabus term', () => {
    for (const card of SL_CARDS) {
      expect(card.definition, card.id).toBeTruthy();
    }
  });

  it('never puts a definition on the card face', () => {
    for (const card of ALL_CARDS) {
      if (!card.definition) continue;
      expect(card.description, card.id).not.toContain(card.definition);
    }
  });

  it('gives hand-authored cards no definition, and text only when they do something', () => {
    for (const card of CUSTOM_CARDS) {
      expect(card.definition, card.id).toBeUndefined();
      // The same rule as everywhere else: a card whose whole story is its stats
      // — a vanilla weapon — carries no text (DECISIONS.md §8).
      if (card.effects.length > 0) {
        expect(card.description.length, card.id).toBeGreaterThan(0);
      }
    }
  });

  // DECISIONS.md §8 — the face shows game text only. Keywords render on their
  // own line in CardPreview, so naming them here would print them twice.
  it('keeps keyword names out of the generated text', () => {
    for (const card of ALL_CARDS) {
      for (const keyword of card.keywords) {
        expect(card.description, `${card.id} repeats ${keyword}`).not.toContain(keyword);
      }
    }
  });

  it('has empty text when a generated card has no ability', () => {
    // Hand-authored cards may carry text without effects — a weapon's text
    // describes what it is, not what it triggers.
    for (const card of SL_CARDS) {
      if (card.effects.length === 0) expect(card.description, card.id).toBe('');
    }
  });

  it('has text whenever it has an ability', () => {
    for (const card of SL_CARDS) {
      if (card.effects.length > 0) expect(card.description.length, card.id).toBeGreaterThan(0);
    }
  });

  it('never uses the Passive trigger, which resolves to nothing', () => {
    for (const card of ALL_CARDS) {
      for (const effect of card.effects) {
        expect(effect.trigger, card.id).not.toBe('Passive');
      }
    }
  });
});

describe('spells', () => {
  const spells = SL_CARDS.filter((c) => c.type === 'Spell');

  it('make up a usable share of the set', () => {
    expect(spells.length).toBeGreaterThanOrEqual(15);
    expect(spells.length / ALL_CARDS.length).toBeLessThan(0.25);
  });

  // playCard only fires Battlecry effects. Any other trigger on a spell makes
  // the card do literally nothing when cast.
  it('only ever carry Battlecry effects', () => {
    for (const card of spells) {
      expect(card.effects.length, `${card.id} has no effect`).toBeGreaterThan(0);
      for (const effect of card.effects) {
        expect(effect.trigger, card.id).toBe('Battlecry');
      }
    }
  });

  it('have no body', () => {
    for (const card of spells) {
      expect(card.attack, card.id).toBeUndefined();
      expect(card.health, card.id).toBeUndefined();
      expect(card.keywords, card.id).toEqual([]);
    }
  });
});

describe('the set as a whole', () => {
  it('offers every rarity', () => {
    for (const rarity of RARITIES) {
      expect(ALL_CARDS.some((c) => c.rarity === rarity), `no ${rarity}`).toBe(true);
    }
  });

  it('covers a playable curve at every cost from 1 to 6', () => {
    for (let cost = 1; cost <= 6; cost++) {
      expect(ALL_CARDS.some((c) => c.cost === cost), `nothing costs ${cost}`).toBe(true);
    }
  });

  it('leaves most Commons vanilla and most Legendaries not', () => {
    const share = (rarity: Rarity) => {
      const pool = ALL_CARDS.filter((c) => c.rarity === rarity && c.type === 'Minion');
      return pool.filter((c) => c.effects.length > 0).length / pool.length;
    };
    expect(share('Common')).toBeLessThan(0.5);
    expect(share('Legendary')).toBeGreaterThan(0.5);
  });

  it('is stable — the same id always yields the same card', () => {
    // Guards the whole premise: a card you have learned must not change under
    // you when the term list is regenerated or reordered.
    const ergonomics = cardById('ergonomics');
    expect(ergonomics).toBeDefined();
    expect({
      cost: ergonomics!.cost,
      type: ergonomics!.type,
      rarity: ergonomics!.rarity,
      attack: ergonomics!.attack,
      health: ergonomics!.health
    }).toMatchInlineSnapshot(`
      {
        "attack": 6,
        "cost": 5,
        "health": 5,
        "rarity": "Common",
        "type": "Minion",
      }
    `);
  });
});
