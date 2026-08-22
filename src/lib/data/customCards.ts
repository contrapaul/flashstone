import type { Card } from '../../types/cards';

/**
 * Hand-authored cards, merged into the registry alongside the SL set.
 *
 * This is the injection point for new cards: nothing here is generated, and
 * nothing regenerates it. Ids must be slugs and must not collide with an SL
 * term's id — `cards.ts` throws at module load if one does.
 *
 * **Names are placeholders.** These are the mechanics; Paul renames them to fit
 * the syllabus. Keeping them recognisable (Fireball, not "Thermal Analysis")
 * makes the balance obvious while it is being tuned.
 */

const spell = (
  id: string,
  name: string,
  cost: number,
  rarity: Card['rarity'],
  effects: Card['effects'],
  description: string,
  targeting?: Card['targeting']
): Card => ({
  id,
  name,
  cost,
  type: 'Spell',
  rarity,
  keywords: [],
  effects,
  description,
  ...(targeting ? { targeting } : {}),
  tags: ['basic']
});

const weapon = (
  id: string,
  name: string,
  cost: number,
  attack: number,
  durability: number,
  rarity: Card['rarity'],
  description = ''
): Card => ({
  id,
  name,
  cost,
  type: 'Weapon',
  rarity,
  attack,
  durability,
  keywords: [],
  effects: [],
  description,
  tags: ['basic']
});

export const CUSTOM_CARDS: Card[] = [
  // ── Targeted damage ──
  spell(
    'fireball',
    'Fireball',
    4,
    'Common',
    [{ trigger: 'Battlecry', action: 'DealDamage', target: 'Chosen', value: 6 }],
    'Deal 6 damage.'
  ),
  spell(
    'frostbolt',
    'Frostbolt',
    2,
    'Common',
    [
      { trigger: 'Battlecry', action: 'DealDamage', target: 'Chosen', value: 3 },
      { trigger: 'Battlecry', action: 'Freeze', target: 'Chosen' }
    ],
    'Deal 3 damage and Freeze.'
  ),
  spell(
    'arcane-blast',
    'Arcane Blast',
    3,
    'Common',
    [{ trigger: 'Battlecry', action: 'DealDamage', target: 'AllEnemies', value: 2 }],
    'Deal 2 damage to all enemies.'
  ),

  // ── Removal ──
  spell(
    'dismantle',
    'Dismantle',
    5,
    'Rare',
    [{ trigger: 'Battlecry', action: 'Destroy', target: 'Chosen' }],
    'Destroy a minion.',
    'enemy'
  ),
  spell(
    'quiet-the-room',
    'Quiet the Room',
    2,
    'Uncommon',
    [{ trigger: 'Battlecry', action: 'Silence', target: 'Chosen' }],
    'Silence a minion.'
  ),

  // ── Support ──
  spell(
    'healing-touch',
    'Healing Touch',
    3,
    'Common',
    [{ trigger: 'Battlecry', action: 'Heal', target: 'Chosen', value: 8 }],
    'Restore 8 Health.',
    'friendly'
  ),
  spell(
    'second-draft',
    'Second Draft',
    3,
    'Common',
    [{ trigger: 'Battlecry', action: 'DrawCard', value: 2 }],
    'Draw 2 cards.'
  ),
  spell(
    'reinforce',
    'Reinforce',
    2,
    'Common',
    [
      { trigger: 'Battlecry', action: 'BuffAttack', target: 'Chosen', value: 2 },
      { trigger: 'Battlecry', action: 'BuffHealth', target: 'Chosen', value: 2 }
    ],
    'Give a minion +2/+2.',
    'friendly'
  ),
  spell(
    'inversion',
    'Inversion',
    2,
    'Epic',
    [{ trigger: 'Battlecry', action: 'SwapStats', target: 'Chosen' }],
    "Swap a minion's Attack and Health."
  ),
  spell(
    'rally',
    'Rally',
    4,
    'Uncommon',
    [{ trigger: 'Battlecry', action: 'SummonToken', value: 3 }],
    'Summon three 1/1 Study Notes.'
  ),

  // ── Weapons ──
  // Budget: roughly attack x durability ~= 2 x cost + 1, the same shape the
  // minion templates use, since total damage is what a weapon really costs.
  weapon('drafting-blade', 'Drafting Blade', 2, 2, 2, 'Common'),
  weapon('craft-knife', 'Craft Knife', 1, 1, 3, 'Common'),
  weapon('bench-hammer', 'Bench Hammer', 3, 3, 2, 'Uncommon'),
  weapon('press-brake', 'Press Brake', 5, 4, 3, 'Rare'),
  weapon('the-jig', 'The Jig', 7, 5, 4, 'Legendary')
];
