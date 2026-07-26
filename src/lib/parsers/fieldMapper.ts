import type { Card } from '../../types/cards';
import { templateForHash } from '../data/templates';
import { createRng, type Rng } from '../engine/rng';
import type { RawRow } from './csvParser';

/**
 * Turns flashcard rows into playable cards.
 *
 * Every imported flashcard becomes a Minion — the card's name is the question
 * and its description is the answer, so studying happens by reading your own
 * board.
 *
 * Mechanics never come from the sheet. Each card is bound to a template from
 * lib/data/templates.ts, chosen from a hash of its own text, and the template
 * supplies cost, stats, rarity and keywords. That is what keeps a flashcard
 * memorable: the same question always plays the same way. It also means the
 * import has nothing to configure beyond which column is which.
 */

export interface FieldMapping {
  front: string;
  back: string;
}

export type ImportSource = 'csv' | 'md' | 'anki' | 'manual';

export function mapRowsToCards(
  rows: RawRow[],
  mapping: FieldMapping,
  source: ImportSource = 'csv'
): Card[] {
  return rows
    .map((row) => ({
      front: (row[mapping.front] ?? '').trim(),
      back: (row[mapping.back] ?? '').trim()
    }))
    // A row with nothing in the chosen columns is not a card, whatever else it
    // may carry.
    .filter(({ front, back }) => front !== '' || back !== '')
    .map(({ front, back }) => buildCard(front, back, source));
}

function buildCard(front: string, back: string, source: ImportSource): Card {
  // Seeded from the card's own text, so the same flashcard always binds to the
  // same template and keeps the same identity across imports.
  const hash = hashString(`${front} ${back}`);
  const template = templateForHash(hash);

  return {
    id: deterministicUuid(createRng(hash)),
    name: (front || back).slice(0, 50),
    cost: template.cost,
    type: 'Minion',
    rarity: template.rarity,
    attack: template.attack,
    health: template.health,
    keywords: [...template.keywords],
    effects: [],
    description: (back || front).slice(0, 200),
    tags: [],
    templateId: template.id,
    _rawFront: front,
    _rawBack: back,
    _importSource: source
  };
}

/** FNV-1a. Stable across runs — art.ts uses the same constants deliberately. */
function hashString(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** A UUIDv4-shaped id drawn from the seeded RNG, so ids are stable across imports. */
function deterministicUuid(rng: Rng): string {
  const hex: string[] = [];
  for (let i = 0; i < 32; i++) hex.push(Math.floor(rng.next() * 16).toString(16));
  hex[12] = '4';
  hex[16] = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  const s = hex.join('');
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}
