/**
 * A card's game text, marked up the way Hearthstone prints it: trigger words and
 * keywords in bold, and a spell's damage shown already boosted — green, with an
 * asterisk — while Spell Damage is in play.
 *
 * Pure, and it only reads the text: the card face still shows game text and
 * nothing else (DECISIONS.md §8). The pieces come back as runs for the card to
 * render, so no HTML is ever built from card data.
 */

export interface Run {
  text: string;
  bold?: boolean;
  /** A number raised by Spell Damage. */
  boosted?: boolean;
}

/** Words that are rules, not prose. Longest first, so "Divine Shield" wins over a shorter match. */
const BOLD = [
  'At the start of your turn',
  'At the end of your turn',
  'After this attacks',
  'Divine Shield',
  'Spell Damage',
  'Battlecry:',
  'Deathrattle:',
  'Windfury',
  'Discover',
  'Stealth',
  'Silence',
  'Charge',
  'Freeze',
  'Frozen',
  'Taunt'
];

const PATTERN = new RegExp(`(${BOLD.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})|Deal (\\d+) damage`, 'g');

/**
 * @param spellDamage extra damage the player's spells deal right now; only a
 *   spell's own "Deal N damage" is raised by it, never a minion's Battlecry.
 */
export function rulesText(text: string, spellDamage = 0, isSpell = false): Run[] {
  const runs: Run[] = [];
  let last = 0;
  for (const match of text.matchAll(PATTERN)) {
    const at = match.index ?? 0;
    if (at > last) runs.push({ text: text.slice(last, at) });
    if (match[1]) {
      runs.push({ text: match[1], bold: true });
    } else {
      const base = Number(match[2]);
      const boosted = isSpell && spellDamage > 0;
      runs.push({ text: 'Deal ' });
      runs.push(boosted ? { text: `*${base + spellDamage}*`, boosted: true } : { text: String(base) });
      runs.push({ text: ' damage' });
    }
    last = at + match[0].length;
  }
  if (last < text.length) runs.push({ text: text.slice(last) });
  return runs;
}
