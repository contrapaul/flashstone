import type { CardType, Effect, Keyword, Rarity, Target } from '../../types/cards';
import { RARITY_WEIGHTS } from '../../utils/rarity';

/**
 * The card templates — the actual game cards.
 *
 * A template is a statline: cost, attack, health, rarity and keywords. Imported
 * flashcards are *bound* to a template, and thousands of flashcards can share
 * one. That separation is deliberate: a given flashcard must always play the
 * same way, or you can't memorise it. The flashcard supplies the name and text;
 * the template supplies everything mechanical.
 *
 * Decks allow two copies of a *template*, no matter how many flashcards carry
 * it — so a huge collection widens your choice of which card to look at, not
 * how many copies you can field.
 *
 * Budget: a vanilla minion carries roughly `2 * cost + 1` total stats. Keywords
 * are paid for out of that budget, and rarer templates are allowed to sit above
 * the curve.
 */

export interface CardTemplate {
  /** Stable and descriptive — reordering this file must not change bindings. */
  id: string;
  cost: number;
  attack: number;
  health: number;
  rarity: Rarity;
  keywords: Keyword[];
}

// [cost, attack, health, rarity, ...keywords]
type Row = [number, number, number, Rarity, ...Keyword[]];

const ROWS: Row[] = [
  // ── 1 mana ──
  [1, 1, 2, 'Common'],
  [1, 2, 1, 'Common'],
  [1, 1, 3, 'Common'],
  [1, 3, 1, 'Uncommon'],
  [1, 2, 2, 'Uncommon'],
  [1, 1, 4, 'Rare', 'Taunt'],
  [1, 2, 1, 'Rare', 'Charge'],
  [1, 1, 1, 'Rare', 'DivineShield'],
  [1, 1, 1, 'Rare', 'DivineShield', 'Taunt'],
  [1, 1, 2, 'Epic', 'Stealth'],
  [1, 3, 2, 'Epic'],
  [1, 2, 3, 'Legendary', 'DivineShield'],

  // ── 2 mana ──
  [2, 2, 3, 'Common'],
  [2, 3, 2, 'Common'],
  [2, 1, 4, 'Common'],
  [2, 4, 1, 'Common'],
  [2, 2, 2, 'Common', 'Taunt'],
  [2, 3, 3, 'Uncommon'],
  [2, 2, 4, 'Uncommon'],
  [2, 1, 5, 'Uncommon', 'Taunt'],
  [2, 4, 2, 'Uncommon'],
  [2, 3, 1, 'Rare', 'Charge'],
  [2, 2, 2, 'Rare', 'DivineShield'],
  [2, 3, 2, 'Rare', 'Stealth'],
  [2, 4, 3, 'Epic'],
  [2, 3, 4, 'Epic', 'Taunt'],
  [2, 2, 3, 'Legendary', 'Windfury'],

  // ── 3 mana ──
  [3, 3, 4, 'Common'],
  [3, 4, 3, 'Common'],
  [3, 2, 5, 'Common'],
  [3, 5, 2, 'Common'],
  [3, 3, 3, 'Common', 'Taunt'],
  [3, 4, 4, 'Uncommon'],
  [3, 2, 6, 'Uncommon', 'Taunt'],
  [3, 5, 3, 'Uncommon'],
  [3, 3, 5, 'Uncommon'],
  [3, 4, 2, 'Rare', 'Charge'],
  [3, 3, 3, 'Rare', 'DivineShield'],
  [3, 4, 3, 'Rare', 'Stealth'],
  [3, 2, 4, 'Rare', 'Windfury'],
  [3, 5, 4, 'Epic'],
  [3, 4, 5, 'Epic', 'Taunt'],
  [3, 3, 4, 'Epic', 'DivineShield'],
  [3, 4, 4, 'Legendary', 'Charge'],

  // ── 4 mana ──
  [4, 4, 5, 'Common'],
  [4, 5, 4, 'Common'],
  [4, 3, 6, 'Common'],
  [4, 6, 3, 'Common'],
  [4, 4, 4, 'Common', 'Taunt'],
  [4, 5, 5, 'Uncommon'],
  [4, 3, 7, 'Uncommon', 'Taunt'],
  [4, 6, 4, 'Uncommon'],
  [4, 4, 6, 'Uncommon'],
  [4, 5, 3, 'Rare', 'Charge'],
  [4, 4, 4, 'Rare', 'DivineShield'],
  [4, 5, 4, 'Rare', 'Stealth'],
  [4, 3, 5, 'Rare', 'Windfury'],
  [4, 6, 5, 'Epic'],
  [4, 5, 6, 'Epic', 'Taunt'],
  [4, 4, 5, 'Epic', 'DivineShield'],
  [4, 5, 5, 'Legendary', 'Windfury'],

  // ── 5 mana ──
  [5, 5, 6, 'Common'],
  [5, 6, 5, 'Common'],
  [5, 4, 7, 'Common'],
  [5, 7, 4, 'Common'],
  [5, 5, 5, 'Common', 'Taunt'],
  [5, 6, 6, 'Uncommon'],
  [5, 4, 8, 'Uncommon', 'Taunt'],
  [5, 7, 5, 'Uncommon'],
  [5, 5, 7, 'Uncommon'],
  [5, 6, 4, 'Rare', 'Charge'],
  [5, 5, 5, 'Rare', 'DivineShield'],
  [5, 6, 5, 'Rare', 'Stealth'],
  [5, 4, 6, 'Rare', 'Windfury'],
  [5, 7, 6, 'Epic'],
  [5, 6, 7, 'Epic', 'Taunt'],
  [5, 5, 6, 'Epic', 'DivineShield'],
  [5, 6, 6, 'Legendary', 'Charge'],

  // ── 6 mana ──
  [6, 6, 7, 'Common'],
  [6, 7, 6, 'Common'],
  [6, 5, 8, 'Common'],
  [6, 8, 5, 'Common'],
  [6, 6, 6, 'Common', 'Taunt'],
  [6, 7, 7, 'Uncommon'],
  [6, 5, 9, 'Uncommon', 'Taunt'],
  [6, 8, 6, 'Uncommon'],
  [6, 6, 8, 'Uncommon'],
  [6, 7, 5, 'Rare', 'Charge'],
  [6, 6, 6, 'Rare', 'DivineShield'],
  [6, 7, 6, 'Rare', 'Stealth'],
  [6, 5, 7, 'Rare', 'Windfury'],
  [6, 8, 7, 'Epic'],
  [6, 7, 8, 'Epic', 'Taunt'],
  [6, 7, 7, 'Legendary', 'DivineShield'],

  // ── 7 mana ──
  [7, 7, 8, 'Common'],
  [7, 8, 7, 'Common'],
  [7, 6, 9, 'Common'],
  [7, 9, 6, 'Common'],
  [7, 7, 7, 'Common', 'Taunt'],
  [7, 8, 8, 'Uncommon'],
  [7, 6, 9, 'Uncommon', 'Taunt'],
  [7, 9, 7, 'Uncommon'],
  [7, 8, 6, 'Rare', 'Charge'],
  [7, 7, 7, 'Rare', 'DivineShield'],
  [7, 8, 7, 'Rare', 'Stealth'],
  [7, 6, 8, 'Rare', 'Windfury'],
  [7, 9, 8, 'Epic'],
  [7, 8, 9, 'Epic', 'Taunt'],
  [7, 8, 8, 'Legendary', 'Windfury'],

  // ── 8 mana ──
  [8, 8, 9, 'Common'],
  [8, 9, 8, 'Common'],
  [8, 7, 9, 'Common', 'Taunt'],
  [8, 9, 9, 'Uncommon'],
  [8, 8, 8, 'Uncommon', 'Taunt'],
  [8, 9, 7, 'Rare', 'Charge'],
  [8, 8, 8, 'Rare', 'DivineShield'],
  [8, 9, 8, 'Rare', 'Stealth'],
  [8, 7, 8, 'Rare', 'Windfury'],
  [8, 9, 9, 'Epic', 'Taunt'],
  [8, 9, 9, 'Legendary', 'DivineShield'],

  // ── 9 mana ──
  [9, 9, 9, 'Common'],
  [9, 8, 9, 'Common', 'Taunt'],
  [9, 9, 9, 'Uncommon', 'Taunt'],
  [9, 9, 8, 'Rare', 'Charge'],
  [9, 9, 9, 'Epic', 'DivineShield'],
  [9, 9, 9, 'Legendary', 'Windfury'],

  // ── 10 mana ──
  [10, 9, 9, 'Common'],
  [10, 9, 9, 'Uncommon', 'Taunt'],
  [10, 9, 9, 'Rare', 'Charge'],
  [10, 9, 9, 'Epic', 'Stealth'],
  [10, 9, 9, 'Legendary', 'DivineShield', 'Windfury']
];

const KEYWORD_TAG: Record<Keyword, string> = {
  Taunt: 't',
  Charge: 'c',
  DivineShield: 'd',
  Windfury: 'w',
  Stealth: 's'
};

function toTemplate([cost, attack, health, rarity, ...keywords]: Row): CardTemplate {
  const tag = keywords.map((k) => KEYWORD_TAG[k]).join('');
  return {
    id: `${cost}-${attack}-${health}-${rarity[0]}${tag ? `-${tag}` : ''}`,
    cost,
    attack,
    health,
    rarity,
    keywords
  };
}

export const TEMPLATES: CardTemplate[] = ROWS.map(toTemplate);

const BY_ID = new Map(TEMPLATES.map((t) => [t.id, t]));

/** Templates bucketed by rarity, so binding can be rarity-weighted. */
const BY_RARITY = TEMPLATES.reduce(
  (acc, template) => {
    (acc[template.rarity] ??= []).push(template);
    return acc;
  },
  {} as Record<Rarity, CardTemplate[]>
);

export function templateById(id: string): CardTemplate | undefined {
  return BY_ID.get(id);
}

/**
 * Binds a hash to exactly one template — rarity-weighted, then evenly within
 * that rarity. Pure: the same hash always lands on the same template, which is
 * what lets a flashcard stay memorable across imports.
 */
export function templateForHash(hash: number): CardTemplate {
  const rarities = Object.keys(BY_RARITY) as Rarity[];
  const total = rarities.reduce((sum, r) => sum + RARITY_WEIGHTS[r], 0);

  // Two independent slices of the hash: one picks rarity, one picks within it.
  // The within-rarity pick used to be `hash % pool.length` on the raw hash.
  // Genuinely varied flashcard text reaches every template fine that way, but
  // sequentially numbered text — "Word 1", "Word 2", ... a real pattern for
  // vocabulary lists — correlates in the hash's low bits under FNV-1a, and
  // modulo by an even pool length preserves that: confirmed directly, only 5
  // of the 10 Legendary templates were ever reachable from 50,000 rows shaped
  // like "Question 0? Answer 0", "Question 1? Answer 1", .... Shifting to a
  // higher slice of the hash for this pick avoids it.
  let roll = (hash >>> 8) % total;
  let chosen: Rarity = rarities[0];
  for (const rarity of rarities) {
    roll -= RARITY_WEIGHTS[rarity];
    if (roll < 0) {
      chosen = rarity;
      break;
    }
  }

  const pool = BY_RARITY[chosen];
  return pool[(hash >>> 16) % pool.length];
}

/**
 * Picks the template closest to an explicitly supplied statline, so a sheet
 * with its own cost/attack/health columns still lands on a real card rather
 * than inventing one off-template.
 */
export function nearestTemplate(want: {
  cost?: number;
  attack?: number;
  health?: number;
  rarity?: Rarity;
}): CardTemplate {
  let best = TEMPLATES[0];
  let bestScore = Infinity;

  for (const template of TEMPLATES) {
    let score = 0;
    // Cost and an explicitly named rarity are strong intent; raw stats are a
    // preference. Without the rarity weight, a 1-point health difference can
    // outvote "I asked for a Legendary".
    if (want.cost !== undefined) score += Math.abs(template.cost - want.cost) * 4;
    if (want.rarity !== undefined && template.rarity !== want.rarity) score += 6;
    if (want.attack !== undefined) score += Math.abs(template.attack - want.attack);
    if (want.health !== undefined) score += Math.abs(template.health - want.health);
    if (score < bestScore) {
      bestScore = score;
      best = template;
    }
  }
  return best;
}

// ──────────────────────────────────────────────────────────────
// ABILITIES
//
// The other half of the mechanical layer. A template supplies the statline; the
// pools below supply what the card *does*, bound the same way — deterministically,
// from the card's own hash — so a card's ability is as stable as its stats.
//
// Two hard constraints, both enforced by tests in slCards.test.ts:
//
//  1. **No `Passive` trigger.** It resolves to nothing (see types/cards.ts).
//  2. **Every spell effect is `Battlecry`.** That is the only trigger `playCard`
//     fires for a spell, so any other trigger makes the card do nothing at all.
// ──────────────────────────────────────────────────────────────

/**
 * How often a minion of each rarity has an ability at all. Commons are mostly
 * vanilla on purpose: a board where every minion triggers something is
 * unreadable, and plain stats are what makes the rare cards feel rare.
 */
const ABILITY_CHANCE: Record<Rarity, number> = {
  Common: 0.2,
  Uncommon: 0.45,
  Rare: 0.7,
  Epic: 0.9,
  Legendary: 1
};

/** Small effects, safe on any card at any cost. */
const MODEST: Effect[] = [
  { trigger: 'Battlecry', action: 'DealDamage', target: 'EnemyMinion', value: 1 },
  { trigger: 'Battlecry', action: 'DealDamage', target: 'RandomEnemy', value: 2 },
  { trigger: 'Battlecry', action: 'DrawCard', value: 1 },
  { trigger: 'Battlecry', action: 'Heal', target: 'Hero', value: 2 },
  { trigger: 'Battlecry', action: 'BuffAttack', target: 'FriendlyMinion', value: 1 },
  { trigger: 'Battlecry', action: 'BuffHealth', target: 'FriendlyMinion', value: 2 },
  { trigger: 'Battlecry', action: 'SummonToken', value: 1 },
  { trigger: 'Battlecry', action: 'Freeze', target: 'EnemyMinion' },
  { trigger: 'Deathrattle', action: 'SummonToken', value: 1 },
  { trigger: 'Deathrattle', action: 'DrawCard', value: 1 },
  { trigger: 'Deathrattle', action: 'DealDamage', target: 'AllEnemies', value: 1 },
  { trigger: 'StartOfTurn', action: 'BuffAttack', target: 'Self', value: 1 },
  { trigger: 'EndOfTurn', action: 'Heal', target: 'Hero', value: 1 },
  { trigger: 'Battlecry', action: 'GainKeyword', target: 'Self', keyword: 'Taunt' }
];

/** Reserved for Rare and above — swingy enough to decide a board. */
const POTENT: Effect[] = [
  { trigger: 'Battlecry', action: 'DealDamage', target: 'AllEnemies', value: 2 },
  { trigger: 'Battlecry', action: 'Destroy', target: 'EnemyMinion' },
  { trigger: 'Battlecry', action: 'Silence', target: 'EnemyMinion' },
  { trigger: 'Battlecry', action: 'DrawCard', value: 2 },
  { trigger: 'Battlecry', action: 'SummonToken', value: 2 },
  { trigger: 'Battlecry', action: 'GainKeyword', target: 'Self', keyword: 'DivineShield' },
  { trigger: 'StartOfTurn', action: 'SummonToken', value: 1 },
  { trigger: 'Deathrattle', action: 'DealDamage', target: 'AllEnemies', value: 2 },
  { trigger: 'EndOfTurn', action: 'BuffAttack', target: 'FriendlyMinion', value: 1 }
];

/**
 * A spell is nothing but its effect, so it always has one, and it is always a
 * Battlecry. Values run higher than a minion's — a spell leaves no body behind.
 */
const SPELL_MODEST: Effect[] = [
  { trigger: 'Battlecry', action: 'DealDamage', target: 'RandomEnemy', value: 3 },
  { trigger: 'Battlecry', action: 'DealDamage', target: 'EnemyMinion', value: 3 },
  { trigger: 'Battlecry', action: 'DrawCard', value: 2 },
  { trigger: 'Battlecry', action: 'Heal', target: 'Hero', value: 5 },
  { trigger: 'Battlecry', action: 'BuffAttack', target: 'FriendlyMinion', value: 2 },
  { trigger: 'Battlecry', action: 'BuffHealth', target: 'FriendlyMinion', value: 3 },
  { trigger: 'Battlecry', action: 'Freeze', target: 'EnemyMinion' },
  { trigger: 'Battlecry', action: 'SummonToken', value: 2 }
];

const SPELL_POTENT: Effect[] = [
  { trigger: 'Battlecry', action: 'DealDamage', target: 'AllEnemies', value: 3 },
  { trigger: 'Battlecry', action: 'Destroy', target: 'EnemyMinion' },
  { trigger: 'Battlecry', action: 'Silence', target: 'EnemyMinion' },
  { trigger: 'Battlecry', action: 'DrawCard', value: 3 },
  { trigger: 'Battlecry', action: 'SummonToken', value: 3 },
  { trigger: 'Battlecry', action: 'GainKeyword', target: 'FriendlyMinion', keyword: 'Windfury' }
];

const POTENT_RARITIES: Rarity[] = ['Rare', 'Epic', 'Legendary'];

/**
 * A second, independent avalanche of the card's hash.
 *
 * `templateForHash` already spends the `>>> 8` and `>>> 16` slices of the raw
 * value. Reusing the same bits here would correlate a card's ability with its
 * statline — every 4-mana 4/5 would end up with the same Battlecry. Mixing first
 * decorrelates the two completely.
 */
function mix(hash: number): number {
  let h = hash >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * Binds a hash to an ability list. Pure, like `templateForHash` — the same card
 * always does the same thing, which is the whole point of a memorable card.
 * Minions may get nothing; spells always get exactly one effect.
 */
export function abilityForHash(
  hash: number,
  rarity: Rarity,
  type: CardType,
  cost: number
): Effect[] {
  const h = mix(hash);
  const potent = POTENT_RARITIES.includes(rarity);

  if (type === 'Spell') {
    // Cost gates a spell's pool, not just rarity. A spell is nothing but its
    // effect, so an expensive one drawing "Freeze a minion" is a dead card, and
    // a one-mana "Destroy a minion" is a broken one. Rarity still opens the
    // potent pool early for cheap Rares and above.
    const pool = cost >= 4 ? SPELL_POTENT : potent ? [...SPELL_MODEST, ...SPELL_POTENT] : SPELL_MODEST;
    return [pool[h % pool.length]];
  }

  // A 0–999 roll from a slice not used for the pick below.
  if ((h >>> 12) % 1000 >= ABILITY_CHANCE[rarity] * 1000) return [];

  const pool = potent ? [...MODEST, ...POTENT] : MODEST;
  return [pool[h % pool.length]];
}

// ──────────────────────────────────────────────────────────────
// CARD TEXT
// ──────────────────────────────────────────────────────────────

const TARGET_PHRASE: Partial<Record<Target, string>> = {
  EnemyMinion: 'a random enemy minion',
  FriendlyMinion: 'a friendly minion',
  RandomEnemy: 'a random enemy',
  AllEnemies: 'all enemies',
  Self: 'this minion',
  Hero: 'your hero'
};

const KEYWORD_TEXT: Record<Keyword, string> = {
  Taunt: 'Taunt',
  Charge: 'Charge',
  DivineShield: 'Divine Shield',
  Windfury: 'Windfury',
  Stealth: 'Stealth'
};

function phrase(effect: Effect): string {
  const value = effect.value ?? 1;
  const target = TARGET_PHRASE[effect.target ?? 'Self'] ?? 'a target';

  switch (effect.action) {
    case 'DealDamage':
      return `Deal ${value} damage to ${effect.target === 'Hero' ? 'the enemy hero' : target}`;
    case 'DrawCard':
      return value === 1 ? 'Draw a card' : `Draw ${value} cards`;
    case 'Heal':
      return `Restore ${value} Health to ${target}`;
    case 'BuffAttack':
      return `Give ${target} +${value} Attack`;
    case 'BuffHealth':
      return `Give ${target} +${value} Health`;
    case 'SummonToken':
      return value === 1 ? 'Summon a 1/1 Study Note' : `Summon ${value} 1/1 Study Notes`;
    case 'Destroy':
      return `Destroy ${target}`;
    case 'Freeze':
      return `Freeze ${target}`;
    case 'Silence':
      return `Silence ${target}`;
    case 'GainKeyword':
      return `Give ${target} ${KEYWORD_TEXT[effect.keyword ?? 'Taunt']}`;
    case 'GainMana':
      return `Gain ${value} Mana Crystal${value === 1 ? '' : 's'} this turn`;
  }
}

/**
 * The card's game text — and **only** its game text.
 *
 * Keywords are deliberately absent: `CardPreview` renders those on their own
 * line, so naming them here would print them twice. A vanilla card returns '',
 * and so does a card whose only trait is a keyword. The term's definition is
 * never part of this; it lives on `card.definition` and is shown when inspecting.
 */
export function describeEffects(effects: Effect[], type: CardType): string {
  return effects
    .map((effect) => {
      const body = `${phrase(effect)}.`;
      // A spell is its effect, so it needs no trigger label; a minion does.
      if (type !== 'Minion') return body;
      switch (effect.trigger) {
        case 'Battlecry':
          return `Battlecry: ${body}`;
        case 'Deathrattle':
          return `Deathrattle: ${body}`;
        case 'StartOfTurn':
          return `At the start of your turn, ${body[0].toLowerCase()}${body.slice(1)}`;
        case 'EndOfTurn':
          return `At the end of your turn, ${body[0].toLowerCase()}${body.slice(1)}`;
        case 'OnAttack':
          return `After this attacks, ${body[0].toLowerCase()}${body.slice(1)}`;
        default:
          return body;
      }
    })
    .join(' ');
}
