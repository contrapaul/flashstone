import { z } from 'zod';

const KeywordSchema = z.enum(['Taunt', 'Charge', 'DivineShield', 'Windfury', 'Stealth']);

const EffectSchema = z.object({
  trigger: z.enum(['Battlecry', 'Deathrattle', 'StartOfTurn', 'EndOfTurn', 'OnAttack', 'Passive']),
  action: z.enum([
    'DealDamage',
    'DrawCard',
    'BuffAttack',
    'BuffHealth',
    'Heal',
    'SummonToken',
    'Destroy',
    'GainKeyword',
    'GainMana',
    'Freeze',
    'Silence'
  ]),
  target: z.enum(['Self', 'EnemyMinion', 'FriendlyMinion', 'Hero', 'RandomEnemy', 'AllEnemies']).optional(),
  value: z.number().int().min(0).max(99).optional(),
  // v0.3: GainKeyword's keyword, first-class. `condition` still carries it on
  // older data — engine.ts reads this first and falls back.
  keyword: KeywordSchema.optional(),
  condition: z.string().nullable().optional()
});

/**
 * Two id shapes are legal, deliberately:
 *
 *  - a **slug**, for the SL card set — `user-centred-design-ucd`. Stable across
 *    regeneration and reordering, which is what lets a player's collection,
 *    decks and pack history survive the card set growing.
 *  - a **UUIDv4**, which `parsers/fieldMapper.ts` still mints for the shelved
 *    import path.
 *
 * Slugs used to fail here (`z.string().uuid()`), which would have rejected every
 * card in the game.
 */
const IdSchema = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/i, 'must be a slug or UUID');

export const CardSchema = z.object({
  id: IdSchema,
  name: z.string().min(1).max(120),
  cost: z.number().int().min(0).max(10),
  type: z.enum(['Minion', 'Spell', 'HeroPower']),
  rarity: z.enum(['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary']),
  attack: z.number().int().min(1).max(9).optional(),
  health: z.number().int().min(1).max(9).optional(),
  keywords: z.array(KeywordSchema).default([]),
  effects: z.array(EffectSchema).max(3),
  // Empty is valid and common: a vanilla card has no game text at all, and a
  // keyword-only card's text is rendered from `keywords`, not from here.
  description: z.string().max(200),
  // 800, not 600: Datschefski's Five Principles is 768 characters in the source.
  definition: z.string().max(800).optional(),
  sections: z.array(z.string()).optional(),
  hl: z.boolean().optional(),
  art: z.object({ type: z.enum(['css', 'image']), value: z.string() }).optional(),
  tags: z.array(z.string()).default([]),
  templateId: z.string().optional(),
  _rawFront: z.string().optional(),
  _rawBack: z.string().optional(),
  _importSource: z.enum(['csv', 'md', 'anki', 'manual']).optional()
}).refine((data) => {
  if (data.type === 'Minion') return data.attack !== undefined && data.health !== undefined;
  if (data.type === 'Spell' || data.type === 'HeroPower') return data.attack === undefined && data.health === undefined;
  return true;
});

export type ValidatedCard = z.infer<typeof CardSchema>;
