// ──────────────────────────────────────────────────────────────
// CARD SCHEMA & VALIDATION RULES v0.4
// Designed for: Flashcard import, early-Hearthstone pacing,
// deterministic fallbacks, rarity-weighted drafting
//
// v0.2 adds the keywords and actions the visual overhaul needs:
//   Keyword 'Stealth'; Action 'Freeze' and 'Silence'.
// v0.3 adds what the SL card set needs: a first-class `keyword` field on
//   Effect, and the study fields (`definition`, `sections`, `hl`) that carry a
//   term's meaning without ever putting it on the card face.
// v0.4 adds spells you aim and weapons you swing: Target 'Chosen', CardType
//   'Weapon' with `durability`, and Action 'SwapStats'.
// card.validator.ts must be updated in the same commit.
// ──────────────────────────────────────────────────────────────

export type CardType = 'Minion' | 'Spell' | 'HeroPower' | 'Weapon';
export type Rarity = 'Common' | 'Uncommon' | 'Rare' | 'Epic' | 'Legendary';
export type Keyword = 'Taunt' | 'Charge' | 'DivineShield' | 'Windfury' | 'Stealth';
export type Trigger =
  | 'Battlecry'
  | 'Deathrattle'
  | 'StartOfTurn'
  | 'EndOfTurn'
  | 'OnAttack'
  /**
   * Resolves to nothing — the engine has no continuous-effect layer to hang it
   * on. Kept in the union so existing data still parses, but the SL card
   * generator must never emit it; slCards.test.ts enforces that.
   */
  | 'Passive';
export type Action =
  | 'DealDamage'
  | 'DrawCard'
  | 'BuffAttack'
  | 'BuffHealth'
  | 'Heal'
  | 'SummonToken'
  | 'Destroy'
  | 'GainKeyword'
  | 'GainMana'
  | 'Freeze'
  | 'Silence'
  /** Swaps a minion's Attack and Health. */
  | 'SwapStats';
export type Target =
  | 'Self'
  | 'EnemyMinion'
  | 'FriendlyMinion'
  | 'Hero'
  | 'RandomEnemy'
  | 'AllEnemies'
  /**
   * Aimed by the player rather than picked by the engine.
   *
   * A card with a `Chosen` effect cannot be played without a target — `playCard`
   * refuses it rather than fizzling, so a misclick never silently burns the card
   * and its mana.
   */
  | 'Chosen';

export interface Effect {
  trigger: Trigger;
  action: Action;
  target?: Target;
  value?: number; // e.g., damage, buff size, cards to draw
  /**
   * Which keyword a `GainKeyword` action grants. Before v0.3 the engine read
   * this off `condition`, which is still honoured as a fallback so cards
   * written against the old shape keep working.
   */
  keyword?: Keyword;
  condition?: string | null; // Optional: "if_target_has_taunt", "only_if_empty_board", etc.
}

export interface Card {
  id: string; // UUIDv4 or deterministic hash (e.g., sha256(name+frontText))
  name: string;
  cost: number; // Mana to play (0-10)
  type: CardType;
  rarity: Rarity;

  // Minion and Weapon fields (undefined for Spells and HeroPowers)
  attack?: number; // 1-9
  health?: number; // 1-9, Minions only
  /** Weapons only — swings remaining before the weapon breaks. */
  durability?: number;

  /**
   * Which side a `Chosen` effect may be aimed at. Absent means either.
   * Checked server-side too; the UI only uses it to decide what to light up.
   */
  targeting?: 'any' | 'enemy' | 'friendly';

  keywords: Keyword[];
  effects: Effect[]; // Structured effect array (parsed or manual)
  /**
   * The card's *game* text and nothing else, generated from `effects`. A card
   * whose only trait is a keyword carries '' — CardPreview renders keywords on
   * their own line, so repeating them here would print them twice — and a card
   * with nothing but stats carries '' as well. The term's meaning lives in
   * `definition` and never appears on the card face.
   */
  description: string;

  /** The SL definition. Shown when inspecting, in the deck builder and in review. */
  definition?: string;
  /** Every syllabus section this term appeared under, e.g. ['A2.1', 'A2.2']. */
  sections?: string[];
  /** True for HL-only content (section C4.1). */
  hl?: boolean;

  art?: { type: 'css' | 'image'; value: string }; // CSS class/hash or R2 URL
  tags?: string[]; // Flashcard metadata, used for rarity weighting & filtering

  /**
   * The template this card was bound to at import, from lib/data/templates.ts.
   * Stored rather than recomputed, so growing the template library never
   * re-maps cards you have already learned. Decks allow two copies per
   * templateId, however many flashcards share it.
   */
  templateId?: string;

  // Import/Mapping metadata (stripped before match sync)
  _rawFront?: string;
  _rawBack?: string;
  _importSource?: 'csv' | 'md' | 'anki' | 'manual';
}
