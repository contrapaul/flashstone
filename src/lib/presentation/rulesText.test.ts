import { describe, expect, it } from 'vitest';
import { glossaryFor, rulesText } from './rulesText';

const flat = (text: string, sd = 0, spell = false) =>
  rulesText(text, sd, spell)
    .map((r) => (r.bold ? `[${r.text}]` : r.boosted ? `{${r.text}}` : r.text))
    .join('');

describe('card text', () => {
  it('bolds trigger words and keywords, and leaves prose alone', () => {
    expect(flat('Battlecry: Give a friendly minion Divine Shield.')).toBe('[Battlecry:] Give a friendly minion [Divine Shield].');
    expect(flat('At the end of your turn, draw a card.')).toBe('[At the end of your turn], draw a card.');
    expect(flat('Restore 3 Health to your hero.')).toBe('Restore 3 Health to your hero.');
  });

  it("raises a spell's damage by Spell Damage, green and starred", () => {
    expect(flat('Deal 3 damage to a chosen target.', 1, true)).toBe('Deal {*4*} damage to a chosen target.');
  });

  it("never raises a minion's damage, or a spell's without Spell Damage", () => {
    expect(flat('Battlecry: Deal 2 damage to all enemies.', 2, false)).toBe('[Battlecry:] Deal 2 damage to all enemies.');
    expect(flat('Deal 6 damage to a chosen target.', 0, true)).toBe('Deal 6 damage to a chosen target.');
  });

  it('keeps every character of the text', () => {
    const text = 'Deathrattle: Summon 2 1/1 Study Notes. Taunt.';
    expect(rulesText(text).map((r) => r.text).join('')).toBe(text);
  });
});

describe('the glossary', () => {
  it('explains the keywords a card has and the rules words in its text, once each', () => {
    const card = { keywords: ['Taunt', 'DivineShield'], description: 'Battlecry: Freeze a random enemy minion. Freeze.' };
    expect(glossaryFor(card).map((g) => g.term)).toEqual(['Taunt', 'Divine Shield', 'Battlecry', 'Freeze']);
  });

  it('knows Spell Damage from the stat, and Transform from its text', () => {
    expect(glossaryFor({ keywords: [], description: 'Spell Damage +1', spellDamage: 1 }).map((g) => g.term)).toEqual(['Spell Damage']);
    expect(glossaryFor({ keywords: [], description: 'Transform a minion into a 1/1 Study Note.' }).map((g) => g.term)).toEqual(['Transform']);
  });

  it('has nothing to say about a vanilla card', () => {
    expect(glossaryFor({ keywords: [], description: '' })).toEqual([]);
  });
});
