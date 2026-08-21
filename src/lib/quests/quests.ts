/**
 * Daily quests. Pure data and pure functions — the server owns progress, but the
 * rules live here so both sides agree on what a quest is.
 *
 * Three are active per day, drawn from the five below and refreshing at UTC
 * midnight. Rewards are DECISIONS.md §4.
 */

export type QuestId = 'win2' | 'play30' | 'cast10' | 'build' | 'review5';

/** What the client counts and reports. One counter per quest metric. */
export type QuestMetric = 'wins' | 'cardsPlayed' | 'spellsCast' | 'decksBuilt' | 'reviewSeconds';

export interface QuestDef {
  id: QuestId;
  label: string;
  /** Shown under the label, so the player knows what advances it. */
  detail: string;
  metric: QuestMetric;
  target: number;
  reward: number;
}

export const QUESTS: QuestDef[] = [
  {
    id: 'win2',
    label: 'Win 2 games',
    detail: 'Against the AI or online.',
    metric: 'wins',
    target: 2,
    reward: 75
  },
  {
    id: 'play30',
    label: 'Play 30 cards',
    detail: 'Minions and spells both count.',
    metric: 'cardsPlayed',
    target: 30,
    reward: 50
  },
  {
    id: 'cast10',
    label: 'Cast 10 spells',
    detail: 'Spells only.',
    metric: 'spellsCast',
    target: 10,
    reward: 50
  },
  {
    id: 'build',
    label: 'Build a new deck',
    detail: 'Save a deck you have not saved before.',
    metric: 'decksBuilt',
    target: 1,
    reward: 40
  },
  {
    id: 'review5',
    label: 'Review cards for 5 minutes',
    detail: 'Active time in review mode.',
    metric: 'reviewSeconds',
    target: 300,
    reward: 40
  }
];

const BY_ID = new Map(QUESTS.map((q) => [q.id, q]));

export function questById(id: string): QuestDef | undefined {
  return BY_ID.get(id as QuestId);
}

export const QUESTS_PER_DAY = 3;

/**
 * The largest increment a single progress report may carry, per metric.
 *
 * Progress is counted by the client — it is the only thing that sees a card
 * played — so the server clamps rather than believes. These are generous
 * against real play and absurd against a crafted request: nobody plays 30 cards
 * between two reports, and a report arrives after each one.
 */
export const MAX_INCREMENT: Record<QuestMetric, number> = {
  wins: 1,
  cardsPlayed: 10,
  spellsCast: 10,
  decksBuilt: 1,
  // Review reports on a timer; 120s covers a slow tab without allowing a jump.
  reviewSeconds: 120
};

export function clampIncrement(metric: QuestMetric, amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return Math.min(Math.floor(amount), MAX_INCREMENT[metric]);
}

/**
 * Which three quests are active on a given UTC day.
 *
 * A pure function of the day number, so every player sees the same three and
 * the server never has to store the choice — and yesterday's set can always be
 * recomputed when a late progress report arrives.
 */
export function questsForDay(day: number): QuestDef[] {
  const chosen: QuestDef[] = [];
  const pool = [...QUESTS];
  // A tiny LCG over the day number: deterministic, and it walks the whole pool
  // rather than favouring the first few.
  let seed = (day * 1103515245 + 12345) >>> 0;
  for (let i = 0; i < QUESTS_PER_DAY && pool.length > 0; i++) {
    seed = (seed * 1103515245 + 12345) >>> 0;
    chosen.push(...pool.splice(seed % pool.length, 1));
  }
  return chosen;
}

export interface QuestProgress {
  id: QuestId;
  progress: number;
  claimed: boolean;
}

export function isComplete(def: QuestDef, progress: number): boolean {
  return progress >= def.target;
}

/** Never reports past the target, so a progress bar cannot overfill. */
export function displayProgress(def: QuestDef, progress: number): number {
  return Math.min(progress, def.target);
}
