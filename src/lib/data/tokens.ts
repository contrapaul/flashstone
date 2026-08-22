import type { Card } from '../../types/cards';

/**
 * Tokens — cards that are summoned, never drawn, and never collected.
 *
 * They are deliberately **not** in the card registry: a token is not something a
 * player owns, packs must never deal one, and the collection screen must not
 * count them toward completion.
 */

/** The generic 1/1 that `SummonToken` produces when no token is named. */
export const STUDY_NOTE: Card = {
  id: 'token-study-note',
  name: 'Study Note',
  cost: 1,
  type: 'Minion',
  rarity: 'Common',
  attack: 1,
  health: 1,
  keywords: [],
  effects: [],
  description: ''
};

/**
 * The Designer's four Design Ideas.
 *
 * Renamed copies of Hearthstone's basic totems, keeping their statlines exactly:
 * the numbers are load-bearing — a 0/2 body that cannot attack is what makes the
 * power a board-building tool rather than a damage one.
 */
export const DESIGN_IDEAS: Card[] = [
  {
    id: 'token-rechargeable-battery',
    name: 'Rechargeable Battery',
    cost: 1,
    type: 'Minion',
    rarity: 'Common',
    class: 'Designer',
    attack: 0,
    health: 2,
    keywords: [],
    effects: [{ trigger: 'EndOfTurn', action: 'Heal', target: 'AllFriendly', value: 1 }],
    description: 'At the end of your turn, restore 1 Health to all friendly minions.'
  },
  {
    id: 'token-oled-screen',
    name: 'OLED Screen',
    cost: 1,
    type: 'Minion',
    rarity: 'Common',
    class: 'Designer',
    attack: 1,
    health: 1,
    keywords: [],
    effects: [],
    description: ''
  },
  {
    id: 'token-reinforced-frame',
    name: 'Reinforced Frame',
    cost: 1,
    type: 'Minion',
    rarity: 'Common',
    class: 'Designer',
    attack: 0,
    health: 2,
    keywords: ['Taunt'],
    effects: [],
    description: ''
  },
  {
    id: 'token-overclocked-cpu',
    name: 'Overclocked CPU',
    cost: 1,
    type: 'Minion',
    rarity: 'Common',
    class: 'Designer',
    attack: 0,
    health: 2,
    keywords: [],
    spellDamage: 1,
    effects: [],
    description: 'Spell Damage +1'
  }
];

const BY_ID = new Map([STUDY_NOTE, ...DESIGN_IDEAS].map((c) => [c.id, c]));

export function tokenById(id: string): Card | undefined {
  return BY_ID.get(id);
}
