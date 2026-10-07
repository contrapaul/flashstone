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

/**
 * What each rules word on a card means, for the inspector (REVISIONS R9.3):
 * short, plain, and true to this engine rather than to Hearthstone's wording.
 */
export const GLOSSARY: Record<string, string> = {
  Taunt: 'Enemies must attack this first.',
  Charge: 'Can attack the turn it is played.',
  'Divine Shield': 'The first time it would take damage, it takes none — and the shield breaks.',
  Windfury: 'Can attack twice each turn.',
  Stealth: 'Can’t be attacked, or picked as a target, by the opponent.',
  Battlecry: 'Happens when you play it from your hand.',
  Deathrattle: 'Happens when it dies.',
  Freeze: 'A frozen minion misses its next attack.',
  Silence: 'Removes everything a minion’s text gives it: keywords, effects and auras.',
  'Spell Damage': 'Your spells deal this much more damage while it is on the board.',
  Discover: 'Choose one of three cards.',
  Transform: 'Becomes something else, losing everything it had.'
};

const KEYWORD_TERM: Record<string, string> = { DivineShield: 'Divine Shield' };

/** The rules terms a card uses — its keywords, and the words in its text — each once, in glossary order. */
export function glossaryFor(card: { keywords: string[]; description: string; spellDamage?: number }): { term: string; meaning: string }[] {
  const used = new Set(card.keywords.map((k) => KEYWORD_TERM[k] ?? k));
  if (card.spellDamage) used.add('Spell Damage');
  for (const term of Object.keys(GLOSSARY)) {
    if (new RegExp(`\\b${term}`).test(card.description)) used.add(term);
  }
  return Object.keys(GLOSSARY).filter((t) => used.has(t)).map((term) => ({ term, meaning: GLOSSARY[term] }));
}
