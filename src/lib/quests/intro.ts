import type { QuestMetric } from './quests';

/**
 * The new-player package — four one-time quests, DECISIONS.md §13.
 *
 * Separate from the daily quests on purpose. Dailies are a rhythm: three of
 * five, refreshing at UTC midnight, paying gold. These are a **runway**: they
 * never expire, they are claimed once ever, and they pay packs, which nothing
 * else in the game does.
 *
 * Together they hand over 7 packs and 200 gold — about 900 gold, or three and a
 * half days of income, in the first session or two. Measured against the pack
 * curve, that moves "a card of every class" to day one and "five of every
 * class" from day 8 to day 5 for a keen player, and from day 27 to day 15 for a
 * light one, while barely touching the month it takes to collect everything.
 */

export interface IntroQuestDef {
  id: string;
  label: string;
  detail: string;
  metric: QuestMetric;
  target: number;
  gold: number;
  packs: number;
  /** A card back unlocked on claim. Not for sale — winning is the only source. */
  back?: string;
}

/**
 * `first-match` pays for **finishing** a match, won or lost, and is what reveals
 * the other three. Losing your first game and being paid for it is the point:
 * the moment a new player is most likely to leave is the one where the game
 * should be most generous.
 */
export const FIRST_MATCH = 'first-match';

export const INTRO_QUESTS: IntroQuestDef[] = [
  {
    id: FIRST_MATCH,
    label: 'Play your first match',
    detail: 'Win or lose — finishing it is enough.',
    metric: 'matches',
    target: 1,
    gold: 100,
    packs: 1
  },
  {
    id: 'first-win',
    label: 'Win a game',
    detail: 'Against the AI or online.',
    metric: 'wins',
    target: 1,
    gold: 0,
    packs: 1
  },
  {
    id: 'first-deck',
    label: 'Build a deck',
    detail: 'Save a deck of your own.',
    metric: 'decksBuilt',
    target: 1,
    gold: 100,
    packs: 0
  },
  {
    id: 'three-wins',
    label: 'Win 3 games',
    detail: 'They add up across every game you play.',
    metric: 'wins',
    target: 3,
    gold: 0,
    packs: 5,
    back: 'ascendant'
  }
];

const BY_ID = new Map(INTRO_QUESTS.map((q) => [q.id, q]));

export function introQuestById(id: string): IntroQuestDef | undefined {
  return BY_ID.get(id);
}

export function isIntroQuest(id: string): boolean {
  return BY_ID.has(id);
}

/**
 * Which intro quests to show.
 *
 * Only the first, until it is finished — four quests in front of someone who
 * has not yet played a game is a chore list, not a welcome. Progress on the
 * hidden three still accrues, so winning your very first match completes two of
 * them at once rather than wasting the win.
 */
export function visibleIntroQuests(progressOf: (id: string) => number): IntroQuestDef[] {
  const played = progressOf(FIRST_MATCH) >= 1;
  return played ? INTRO_QUESTS : INTRO_QUESTS.filter((q) => q.id === FIRST_MATCH);
}
