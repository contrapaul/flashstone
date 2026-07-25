import type { Card, Keyword, Rarity } from '../../types/cards';
import { RARITY_WEIGHTS } from '../../utils/rarity';
import { createRng, type Rng } from '../engine/rng';
import type { RawRow } from './csvParser';

/**
 * Turns flashcard rows into playable cards.
 *
 * Every imported flashcard becomes a Minion — the card's name is the question and
 * its description is the answer, so studying happens by reading your own board.
 *
 * Stats come from explicit columns when the sheet has them, and are otherwise
 * derived from a hash of the card's text. Derivation is fully deterministic: the
 * same flashcard always produces the same card, so re-importing a deck is stable.
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

/** Rarer cards earn better keywords. Commons stay vanilla. */
const RARITY_KEYWORDS: Record<Rarity, Keyword[]> = {
  Common: [],
  Uncommon: ['Taunt'],
  Rare: ['Taunt', 'Charge'],
  Epic: ['Taunt', 'Charge', 'DivineShield', 'Stealth'],
  Legendary: ['Taunt', 'DivineShield', 'Windfury', 'Stealth']
};

/** Extra stat points on top of the vanilla curve. */
const RARITY_BONUS: Record<Rarity, number> = {
  Common: 0,
  Uncommon: 0,
  Rare: 1,
  Epic: 1,
  Legendary: 2
};

/** Chance a card of each rarity actually gets its keyword. */
const KEYWORD_CHANCE: Record<Rarity, number> = {
  Common: 0,
  Uncommon: 0.4,
  Rare: 0.6,
  Epic: 0.8,
  Legendary: 1
};

/** Mana curve — deliberately front-loaded so decks have early plays. */
const COST_WEIGHTS: [number, number][] = [
  [1, 12],
  [2, 20],
  [3, 20],
  [4, 16],
  [5, 12],
  [6, 9],
  [7, 6],
  [8, 5]
];

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

  // Seeded from the card's own text, so the same flashcard is always the same card.
  const rng = createRng(hashString(`${front} ${back}`));

  const rarity = readRarity(row, mapping) ?? pickRarity(rng);
  const cost = readInt(row, mapping.cost, 0, 10) ?? weightedPick(rng, COST_WEIGHTS);

  const explicitAttack = readInt(row, mapping.attack, 1, 9);
  const explicitHealth = readInt(row, mapping.health, 1, 9);
  const derived = deriveStats(rng, cost, rarity);

  const keywords = keywordsFor(rng, rarity);
  const name = (row[mapping.name ?? ''] || front || `Card ${index + 1}`).slice(0, 50);
  const description = (back || front || 'No description').slice(0, 200);

  return {
    id: deterministicUuid(rng),
    name,
    cost,
    type: 'Minion',
    rarity,
    attack: explicitAttack ?? derived.attack,
    health: explicitHealth ?? derived.health,
    keywords,
    effects: [],
    description,
    tags: [],
    _rawFront: front,
    _rawBack: back,
    _importSource: source
  };
}

/** Vanilla curve: a cost-N minion carries roughly 2N+1 total stats. */
function deriveStats(rng: Rng, cost: number, rarity: Rarity) {
  const total = Math.max(2, 2 * cost + 1 + RARITY_BONUS[rarity]);
  // Split the budget, leaning slightly toward attack on cheap cards.
  const attackShare = 0.35 + rng.next() * 0.3;
  const attack = clamp(Math.round(total * attackShare), 1, 9);
  const health = clamp(total - attack, 1, 9);
  return { attack, health };
}

function keywordsFor(rng: Rng, rarity: Rarity): Keyword[] {
  const pool = RARITY_KEYWORDS[rarity];
  if (pool.length === 0) return [];
  if (rng.next() > KEYWORD_CHANCE[rarity]) return [];
  return [pool[Math.floor(rng.next() * pool.length)]];
}

function pickRarity(rng: Rng): Rarity {
  return weightedPick(
    rng,
    RARITIES.map((r) => [r, RARITY_WEIGHTS[r]] as [Rarity, number])
  );
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
  return clamp(Math.round(parsed), min, max);
}

function weightedPick<T>(rng: Rng, table: [T, number][]): T {
  const total = table.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = rng.next() * total;
  for (const [value, weight] of table) {
    roll -= weight;
    if (roll <= 0) return value;
  }
  return table[table.length - 1][0];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** FNV-1a. Small, fast, and stable across runs — unlike seeding from Math.random. */
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
