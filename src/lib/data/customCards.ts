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


const minion = (
  id: string,
  name: string,
  cls: Card['class'],
  cost: number,
  attack: number,
  health: number,
  rarity: Card['rarity'],
  description = '',
  extra: Partial<Card> = {}
): Card => ({
  id,
  name,
  cost,
  type: 'Minion',
  rarity,
  class: cls,
  attack,
  health,
  keywords: [],
  effects: [],
  description,
  tags: ['class'],
  ...extra
});

const classSpell = (
  id: string,
  name: string,
  cls: Card['class'],
  cost: number,
  rarity: Card['rarity'],
  effects: Card['effects'],
  description: string,
  targeting?: Card['targeting']
): Card => ({
  ...spell(id, name, cost, rarity, effects, description, targeting),
  class: cls,
  tags: ['class']
});

const classWeapon = (
  id: string,
  name: string,
  cls: Card['class'],
  cost: number,
  attack: number,
  durability: number,
  rarity: Card['rarity'],
  description = ''
): Card => ({
  ...weapon(id, name, cost, attack, durability, rarity, description),
  class: cls,
  tags: ['class']
});

/**
 * The forty class cards — ten each.
 *
 * Each class leans on its archetype so the four feel different to play:
 * **Designer** goes wide with tokens and buffs them, **Engineer** stacks armor
 * and weapons, **Consumer** draws hard and pays in health, **Manufacturer**
 * burns face and board.
 *
 * Everything here uses mechanics the engine already has. A card list is the
 * wrong place to hide a new system.
 */
const CLASS_CARDS: Card[] = [
  // ── Designer: tokens and board width ──
  minion('modular-housing', 'Modular Housing', 'Designer', 2, 2, 2, 'Common',
    'Battlecry: Summon a 1/1 Study Note.',
    { effects: [{ trigger: 'Battlecry', action: 'SummonToken', value: 1 }] }),
  minion('iteration-loop', 'Iteration Loop', 'Designer', 4, 3, 4, 'Common',
    'At the end of your turn, summon a 1/1 Study Note.',
    { effects: [{ trigger: 'EndOfTurn', action: 'SummonToken', value: 1 }] }),
  minion('design-studio', 'Design Studio', 'Designer', 5, 4, 5, 'Uncommon',
    'Battlecry: Give all friendly minions +1 Health.',
    { effects: [{ trigger: 'Battlecry', action: 'BuffHealth', target: 'AllFriendly', value: 1 }] }),
  minion('concept-sketch', 'Concept Sketch', 'Designer', 1, 1, 2, 'Common'),
  minion('form-follows-function', 'Form Follows Function', 'Designer', 3, 2, 5, 'Uncommon',
    '', { keywords: ['Taunt'] }),
  minion('lead-designer', 'Lead Designer', 'Designer', 6, 5, 6, 'Rare',
    'Battlecry: Give all friendly minions +1 Attack.',
    { effects: [{ trigger: 'Battlecry', action: 'BuffAttack', target: 'AllFriendly', value: 1 }] }),
  classSpell('rapid-iteration', 'Rapid Iteration', 'Designer', 3, 'Common',
    [{ trigger: 'Battlecry', action: 'SummonToken', value: 2 }],
    'Summon two 1/1 Study Notes.'),
  classSpell('refine', 'Refine', 'Designer', 1, 'Common',
    [{ trigger: 'Battlecry', action: 'BuffHealth', target: 'Chosen', value: 3 }],
    'Give a minion +3 Health.', 'friendly'),
  classSpell('storm-of-ideas', 'Storm of Ideas', 'Designer', 4, 'Rare',
    [{ trigger: 'Battlecry', action: 'DealDamage', target: 'AllEnemies', value: 2 }],
    'Deal 2 damage to all enemies.'),
  minion('the-brief', 'The Brief', 'Designer', 7, 6, 7, 'Legendary',
    'Battlecry: Summon three 1/1 Study Notes.',
    { effects: [{ trigger: 'Battlecry', action: 'SummonToken', value: 3 }] }),

  // ── Engineer: armor, weapons, staying power ──
  minion('safety-factor', 'Safety Factor', 'Engineer', 2, 1, 4, 'Common',
    '', { keywords: ['Taunt'] }),
  minion('load-bearing-wall', 'Load-Bearing Wall', 'Engineer', 4, 3, 7, 'Common',
    '', { keywords: ['Taunt'] }),
  minion('stress-test', 'Stress Test', 'Engineer', 3, 3, 3, 'Common',
    'Battlecry: Gain 3 Armor.',
    { effects: [{ trigger: 'Battlecry', action: 'GainArmor', value: 3 }] }),
  minion('tolerance-check', 'Tolerance Check', 'Engineer', 5, 4, 6, 'Uncommon',
    'Battlecry: Gain 4 Armor.',
    { effects: [{ trigger: 'Battlecry', action: 'GainArmor', value: 4 }] }),
  minion('site-foreman', 'Site Foreman', 'Engineer', 6, 6, 6, 'Rare',
    'Battlecry: Destroy a minion.',
    { effects: [{ trigger: 'Battlecry', action: 'Destroy', target: 'Chosen' }], targeting: 'enemy' }),
  classSpell('reinforce-structure', 'Reinforce Structure', 'Engineer', 2, 'Common',
    [{ trigger: 'Battlecry', action: 'GainArmor', value: 5 }],
    'Gain 5 Armor.'),
  classSpell('shear-force', 'Shear Force', 'Engineer', 3, 'Common',
    [{ trigger: 'Battlecry', action: 'DealDamage', target: 'Chosen', value: 4 }],
    'Deal 4 damage to a minion.', 'enemy'),
  classWeapon('torque-wrench', 'Torque Wrench', 'Engineer', 3, 3, 2, 'Common'),
  classWeapon('impact-driver', 'Impact Driver', 'Engineer', 5, 5, 2, 'Rare'),
  minion('chief-engineer', 'Chief Engineer', 'Engineer', 7, 7, 7, 'Legendary',
    'Battlecry: Gain 8 Armor.',
    { effects: [{ trigger: 'Battlecry', action: 'GainArmor', value: 8 }] }),

  // ── Consumer: draw hard, pay in health ──
  minion('impulse-buy', 'Impulse Buy', 'Consumer', 1, 2, 1, 'Common'),
  minion('brand-loyalty', 'Brand Loyalty', 'Consumer', 3, 3, 4, 'Common',
    'Battlecry: Draw a card.',
    { effects: [{ trigger: 'Battlecry', action: 'DrawCard', value: 1 }] }),
  // Not "Planned Obsolescence" — that is already an SL syllabus term, and the
  // registry refuses duplicate ids at module load.
  minion('upgrade-cycle', 'Upgrade Cycle', 'Consumer', 4, 5, 4, 'Uncommon',
    'Deathrattle: Draw a card.',
    { effects: [{ trigger: 'Deathrattle', action: 'DrawCard', value: 1 }] }),
  minion('market-research', 'Market Research', 'Consumer', 5, 4, 5, 'Rare',
    'Battlecry: Draw 2 cards.',
    { effects: [{ trigger: 'Battlecry', action: 'DrawCard', value: 2 }] }),
  minion('disposable-income', 'Disposable Income', 'Consumer', 2, 3, 2, 'Common'),
  classSpell('buy-now-pay-later', 'Buy Now, Pay Later', 'Consumer', 2, 'Common',
    [
      { trigger: 'Battlecry', action: 'DrawCard', value: 2 },
      { trigger: 'Battlecry', action: 'DealDamage', target: 'SelfHero', value: 3 }
    ],
    'Draw 2 cards. Take 3 damage.'),
  classSpell('hard-sell', 'Hard Sell', 'Consumer', 3, 'Common',
    [{ trigger: 'Battlecry', action: 'DealDamage', target: 'Chosen', value: 4 }],
    'Deal 4 damage.'),
  classSpell('recall-notice', 'Recall Notice', 'Consumer', 4, 'Uncommon',
    [{ trigger: 'Battlecry', action: 'Destroy', target: 'Chosen' }],
    'Destroy a minion.', 'enemy'),
  classSpell('warranty-claim', 'Warranty Claim', 'Consumer', 2, 'Common',
    [{ trigger: 'Battlecry', action: 'Heal', target: 'SelfHero', value: 6 }],
    'Restore 6 Health to your hero.'),
  minion('the-early-adopter', 'The Early Adopter', 'Consumer', 6, 5, 5, 'Legendary',
    'Battlecry: Draw 3 cards. Take 3 damage.',
    {
      effects: [
        { trigger: 'Battlecry', action: 'DrawCard', value: 3 },
        { trigger: 'Battlecry', action: 'DealDamage', target: 'SelfHero', value: 3 }
      ]
    }),

  // ── Manufacturer: direct damage ──
  minion('production-line', 'Production Line', 'Manufacturer', 3, 3, 3, 'Common',
    'Battlecry: Deal 2 damage.',
    { effects: [{ trigger: 'Battlecry', action: 'DealDamage', target: 'Chosen', value: 2 }] }),
  minion('quality-control', 'Quality Control', 'Manufacturer', 2, 2, 3, 'Common',
    'Battlecry: Deal 1 damage.',
    { effects: [{ trigger: 'Battlecry', action: 'DealDamage', target: 'Chosen', value: 1 }] }),
  minion('tooling-up', 'Tooling Up', 'Manufacturer', 4, 4, 4, 'Common',
    'Spell Damage +1', { spellDamage: 1 }),
  minion('automation-cell', 'Automation Cell', 'Manufacturer', 5, 4, 6, 'Uncommon',
    'Spell Damage +1', { spellDamage: 1 }),
  minion('batch-run', 'Batch Run', 'Manufacturer', 6, 6, 5, 'Rare',
    'Battlecry: Deal 3 damage to all enemies.',
    { effects: [{ trigger: 'Battlecry', action: 'DealDamage', target: 'AllEnemies', value: 3 }] }),
  classSpell('cnc-burst', 'CNC Burst', 'Manufacturer', 1, 'Common',
    [{ trigger: 'Battlecry', action: 'DealDamage', target: 'Chosen', value: 2 }],
    'Deal 2 damage.'),
  classSpell('injection-mould', 'Injection Mould', 'Manufacturer', 4, 'Common',
    [{ trigger: 'Battlecry', action: 'DealDamage', target: 'Chosen', value: 5 }],
    'Deal 5 damage.'),
  classSpell('cooling-cycle', 'Cooling Cycle', 'Manufacturer', 2, 'Common',
    [{ trigger: 'Battlecry', action: 'Freeze', target: 'Chosen' }],
    'Freeze a minion.', 'enemy'),
  classSpell('overrun', 'Overrun', 'Manufacturer', 5, 'Uncommon',
    [{ trigger: 'Battlecry', action: 'DealDamage', target: 'AllEnemies', value: 4 }],
    'Deal 4 damage to all enemies.'),
  minion('the-factory', 'The Factory', 'Manufacturer', 7, 6, 6, 'Legendary',
    'Spell Damage +2. Battlecry: Deal 3 damage.',
    {
      spellDamage: 2,
      effects: [{ trigger: 'Battlecry', action: 'DealDamage', target: 'Chosen', value: 3 }]
    })
];

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
  weapon('the-jig', 'The Jig', 7, 5, 4, 'Legendary'),

  ...CLASS_CARDS
];
