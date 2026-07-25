import type { Card, Rarity } from '../../types/cards';
import { RARITY_WEIGHTS } from '../../utils/rarity';
import { nearestTemplate, templateForHash, type CardTemplate } from '../data/templates';
import { createRng, type Rng } from '../engine/rng';
import type { RawRow } from './csvParser';

/**
 * Turns flashcard rows into playable cards.
 *
 * Every imported flashcard becomes a Minion — the card's name is the question and
 * its description is the answer, so studying happens by reading your own board.
 *
 * Mechanics never come from the flashcard itself. Each card is *bound* to a
 * template from lib/data/templates.ts, chosen from a hash of its own text, and
 * the template supplies cost, stats, rarity and keywords. That is what keeps a
 * flashcard memorable: the same question always plays the same way, and it can
 * never turn up as a 3/2 Charge in one deck and a 1/5 in another.
 *
 * A sheet that carries its own cost/attack/health/rarity columns snaps to the
 * closest real template rather than inventing an off-template statline.
 */

export interface FieldMapping {
  front: string;
  back: string;
  name?: string;
  cost?: string;
  attack?: string;
  health?: string;
  rarity?: string;
}

export type ImportSource = 'csv' | 'md' | 'anki' | 'manual';

const RARITIES = Object.keys(RARITY_WEIGHTS) as Rarity[];

export function mapRowsToCards(
  rows: RawRow[],
  mapping: FieldMapping,
  source: ImportSource = 'csv'
): Card[] {
  return rows.map((row, index) => buildCard(row, mapping, source, index));
}

function buildCard(
  row: RawRow,
  mapping: FieldMapping,
  source: ImportSource,
  index: number
): Card {
  const front = (row[mapping.front] ?? '').trim();
  const back = (row[mapping.back] ?? '').trim();

  // Seeded from the card's own text, so the same flashcard always binds to the
  // same template and keeps the same identity across imports.
  const hash = hashString(`${front} ${back}`);
  const template = resolveTemplate(row, mapping, hash);

  const name = (row[mapping.name ?? ''] || front || `Card ${index + 1}`).slice(0, 50);
  const description = (back || front || 'No description').slice(0, 200);

  return {
    id: deterministicUuid(createRng(hash)),
    name,
    cost: template.cost,
    type: 'Minion',
    rarity: template.rarity,
    attack: template.attack,
    health: template.health,
    keywords: [...template.keywords],
    effects: [],
    description,
    tags: [],
    templateId: template.id,
    _rawFront: front,
    _rawBack: back,
    _importSource: source
  };
}

function resolveTemplate(row: RawRow, mapping: FieldMapping, hash: number): CardTemplate {
  const cost = readInt(row, mapping.cost, 0, 10);
  const attack = readInt(row, mapping.attack, 1, 9);
  const health = readInt(row, mapping.health, 1, 9);
  const rarity = readRarity(row, mapping);

  const supplied = cost ?? attack ?? health ?? rarity;
  if (supplied === undefined) return templateForHash(hash);
  return nearestTemplate({ cost, attack, health, rarity });
}

function readRarity(row: RawRow, mapping: FieldMapping): Rarity | undefined {
  if (!mapping.rarity) return undefined;
  const raw = row[mapping.rarity]?.trim().toLowerCase();
  return RARITIES.find((r) => r.toLowerCase() === raw);
}

function readInt(
  row: RawRow,
  column: string | undefined,
  min: number,
  max: number
): number | undefined {
  if (!column) return undefined;
  const raw = row[column];
  if (raw === undefined || raw.trim() === '') return undefined;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) return undefined;
  return Math.min(max, Math.max(min, Math.round(parsed)));
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
