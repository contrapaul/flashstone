import { describe, expect, it } from 'vitest';
import { rulesText } from './rulesText';

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
