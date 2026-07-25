import { describe, expect, it } from 'vitest';
import { CardSchema } from '../../validators/card.validator';
import { parseCSV } from './csvParser';
import { mapRowsToCards, type FieldMapping } from './fieldMapper';

/** The common case: a plain two-column export with no game data at all. */
const PLAIN: FieldMapping = { front: 'Front', back: 'Back' };

function plainRows(count = 12) {
  return Array.from({ length: count }, (_, i) => ({
    Front: `Question number ${i}?`,
    Back: `The answer to question ${i} is something worth remembering.`
  }));
}

describe('importing plain flashcards', () => {
  it('produces valid cards from front/back only', () => {
    const cards = mapRowsToCards(plainRows(), PLAIN);
    expect(cards).toHaveLength(12);
    for (const card of cards) {
      expect(() => CardSchema.parse(card), card.name).not.toThrow();
    }
  });

  it('makes every imported flashcard a playable minion with stats', () => {
    const cards = mapRowsToCards(plainRows(), PLAIN);
    for (const card of cards) {
      expect(card.type).toBe('Minion');
      expect(card.attack).toBeGreaterThanOrEqual(1);
      expect(card.health).toBeGreaterThanOrEqual(1);
    }
  });

  it('uses the question as the name and the answer as the description', () => {
    const [card] = mapRowsToCards(
      [{ Front: 'Capital of France?', Back: 'Paris' }],
      PLAIN
    );
    expect(card.name).toBe('Capital of France?');
    expect(card.description).toBe('Paris');
    expect(card._rawFront).toBe('Capital of France?');
    expect(card._rawBack).toBe('Paris');
  });

  it('keeps costs and stats inside the schema bounds', () => {
    const rows = Array.from({ length: 300 }, (_, i) => ({
      Front: `q${i}`,
      Back: `a${i} ${'x'.repeat(i)}`
    }));
    for (const card of mapRowsToCards(rows, PLAIN)) {
      expect(card.cost).toBeGreaterThanOrEqual(0);
      expect(card.cost).toBeLessThanOrEqual(10);
      expect(card.attack).toBeGreaterThanOrEqual(1);
      expect(card.attack).toBeLessThanOrEqual(9);
      expect(card.health).toBeGreaterThanOrEqual(1);
      expect(card.health).toBeLessThanOrEqual(9);
    }
  });

  it('truncates overlong text to fit the schema', () => {
    const [card] = mapRowsToCards(
      [{ Front: 'F'.repeat(200), Back: 'B'.repeat(500) }],
      PLAIN
    );
    expect(card.name.length).toBeLessThanOrEqual(50);
    expect(card.description.length).toBeLessThanOrEqual(200);
    expect(() => CardSchema.parse(card)).not.toThrow();
  });
});

describe('determinism', () => {
  it('produces an identical card for the same flashcard every time', () => {
    const row = [{ Front: 'What is spaced repetition?', Back: 'Reviewing at intervals.' }];
    const first = mapRowsToCards(row, PLAIN)[0];
    const second = mapRowsToCards(row, PLAIN)[0];
    expect(second).toEqual(first);
    expect(second.id).toBe(first.id);
  });

  it('gives different flashcards different identities', () => {
    const cards = mapRowsToCards(plainRows(40), PLAIN);
    expect(new Set(cards.map((c) => c.id)).size).toBe(40);
  });

  it('does not depend on row order', () => {
    const rows = plainRows(5);
    const forward = mapRowsToCards(rows, PLAIN);
    const backward = mapRowsToCards([...rows].reverse(), PLAIN);
    const byName = (cards: typeof forward) =>
      Object.fromEntries(cards.map((c) => [c.name, c]));
    expect(byName(backward)).toEqual(byName(forward));
  });
});

describe('explicit columns win over derivation', () => {
  const mapping: FieldMapping = {
    front: 'Front',
    back: 'Back',
    name: 'Name',
    cost: 'Cost',
    attack: 'Atk',
    health: 'Hp',
    rarity: 'Rarity'
  };

  it('uses the supplied values', () => {
    const [card] = mapRowsToCards(
      [
        {
          Front: 'q',
          Back: 'a',
          Name: 'Hand Tuned',
          Cost: '4',
          Atk: '5',
          Hp: '2',
          Rarity: 'legendary'
        }
      ],
      mapping
    );
    expect(card.name).toBe('Hand Tuned');
    expect(card.cost).toBe(4);
    expect(card.attack).toBe(5);
    expect(card.health).toBe(2);
    expect(card.rarity).toBe('Legendary');
  });

  it('falls back to derivation for blank or unparseable cells', () => {
    const [card] = mapRowsToCards(
      [{ Front: 'q', Back: 'a', Name: '', Cost: '', Atk: 'abc', Hp: '3', Rarity: 'nonsense' }],
      mapping
    );
    expect(card.health).toBe(3);
    expect(card.name).toBe('q');
    expect(card.attack).toBeGreaterThanOrEqual(1);
    expect(() => CardSchema.parse(card)).not.toThrow();
  });

  it('clamps out-of-range supplied values instead of rejecting them', () => {
    const [card] = mapRowsToCards(
      [{ Front: 'q', Back: 'a', Name: 'Huge', Cost: '99', Atk: '99', Hp: '-5', Rarity: '' }],
      mapping
    );
    expect(card.cost).toBe(10);
    expect(card.attack).toBe(9);
    expect(card.health).toBe(1);
    expect(() => CardSchema.parse(card)).not.toThrow();
  });
});

describe('rarity and keywords', () => {
  const sample = () =>
    mapRowsToCards(
      Array.from({ length: 600 }, (_, i) => ({ Front: `q${i}`, Back: `a${i}` })),
      PLAIN
    );

  it('never gives a Common a keyword', () => {
    for (const card of sample().filter((c) => c.rarity === 'Common')) {
      expect(card.keywords).toEqual([]);
    }
  });

  it('always gives a Legendary exactly one keyword', () => {
    const legendaries = sample().filter((c) => c.rarity === 'Legendary');
    expect(legendaries.length).toBeGreaterThan(0);
    for (const card of legendaries) {
      expect(card.keywords).toHaveLength(1);
    }
  });

  it('can roll Stealth, but only on rarer cards', () => {
    const withStealth = sample().filter((c) => c.keywords.includes('Stealth'));
    expect(withStealth.length).toBeGreaterThan(0);
    for (const card of withStealth) {
      expect(['Epic', 'Legendary']).toContain(card.rarity);
    }
  });

  it('only ever assigns keywords the engine understands', () => {
    const known = ['Taunt', 'Charge', 'DivineShield', 'Windfury', 'Stealth'];
    for (const card of sample()) {
      for (const keyword of card.keywords) expect(known).toContain(keyword);
    }
  });

  it('keeps commons the bulk of a collection', () => {
    const cards = sample();
    const commons = cards.filter((c) => c.rarity === 'Common').length;
    expect(commons / cards.length).toBeGreaterThan(0.3);
    expect(new Set(cards.map((c) => c.rarity)).size).toBeGreaterThan(1);
  });
});

describe('end to end from a CSV export', () => {
  it('turns a typical two-column export into a valid collection', () => {
    const csv = [
      'Front,Back',
      'What year did WWII end?,1945',
      '"Capital of Japan?","Tokyo, on Honshu"',
      'Chemical symbol for gold?,Au'
    ].join('\n');

    const cards = mapRowsToCards(parseCSV(csv), PLAIN, 'anki');

    expect(cards).toHaveLength(3);
    expect(cards.map((c) => c.name)).toEqual([
      'What year did WWII end?',
      'Capital of Japan?',
      'Chemical symbol for gold?'
    ]);
    expect(cards[1].description).toBe('Tokyo, on Honshu');
    for (const card of cards) {
      expect(card._importSource).toBe('anki');
      expect(() => CardSchema.parse(card)).not.toThrow();
    }
  });
});
