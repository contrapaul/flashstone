import type { CardClass, Effect } from '../../types/cards';
import type { MatchState, PlayerId } from '../engine/state';
import { DESIGN_IDEAS } from './tokens';

/**
 * The four classes and their hero powers.
 *
 * Powers are **data, not a switch in the engine**: each carries a list of
 * `Effect`s that resolve through the same `resolveEffect` cards use. That means
 * a power cannot do anything a card could not, which is the property that keeps
 * them testable and keeps the engine from growing a second rules system.
 *
 * All four cost 2 mana and may be used once per turn. Every class is unlocked
 * from the start; class *cards* are earned through packs (DECISIONS.md §11).
 */

export interface HeroPower {
  name: string;
  description: string;
  /** Must be aimed by the player. Reuses Phase 1B's targeting whole. */
  needsTarget?: boolean;
  /**
   * Effects to resolve. A function rather than a list because the Designer's
   * depends on the board — which idea it summons is decided at use time.
   */
  effects(state: MatchState, id: PlayerId): Effect[];
  /**
   * True when using it would do nothing, so it is refused before mana is spent.
   * Only the Designer has such a state: all four ideas already out.
   */
  isUseless?(state: MatchState, id: PlayerId): boolean;
}

/** Ideas not already on this player's board. */
function missingIdeas(state: MatchState, id: PlayerId) {
  const out = new Set(state.players[id].board.map((m) => m.card.id));
  return DESIGN_IDEAS.filter((idea) => !out.has(idea.id));
}

export const HERO_POWERS: Record<CardClass, HeroPower | null> = {
  Neutral: null,

  Designer: {
    name: 'Summon a Design Idea',
    description: 'Summon a random Design Idea.',
    // As in Hearthstone: it gives one you do not already have, so the fourth use
    // is guaranteed to complete the set rather than risking a duplicate.
    isUseless: (state, id) => missingIdeas(state, id).length === 0,
    effects(state, id) {
      const available = missingIdeas(state, id);
      if (available.length === 0) return [];
      // Seeded from the match, so a replay produces the same idea.
      const rng = (state.seed + state.turnNumber * 31 + state.nextInstanceId * 7) >>> 0;
      const idea = available[rng % available.length];
      return [{ trigger: 'Battlecry', action: 'SummonToken', value: 1, condition: idea.id }];
    }
  },

  Engineer: {
    name: 'Make it Stronger',
    description: 'Gain 2 Armor.',
    effects: () => [{ trigger: 'Battlecry', action: 'GainArmor', value: 2 }]
  },

  Consumer: {
    name: 'Pay on Credit',
    description: 'Draw a card and take 2 damage.',
    effects: () => [
      { trigger: 'Battlecry', action: 'DrawCard', value: 1 },
      // SelfHero, not Hero: `Hero` resolves to the *enemy* for harmful actions,
      // so this card is inexpressible without it.
      { trigger: 'Battlecry', action: 'DealDamage', target: 'SelfHero', value: 2 }
    ]
  },

  Manufacturer: {
    name: 'Robotic Arm',
    description: 'Deal 1 damage.',
    needsTarget: true,
    effects: () => [{ trigger: 'Battlecry', action: 'DealDamage', target: 'Chosen', value: 1 }]
  }
};

export function heroPowerFor(heroClass: CardClass): HeroPower | null {
  return HERO_POWERS[heroClass] ?? null;
}
