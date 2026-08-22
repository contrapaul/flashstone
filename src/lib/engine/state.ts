import type { Card, CardClass } from '../../types/cards';

export const HERO_HEALTH = 30;
export const MAX_MANA = 10;
export const BOARD_LIMIT = 7;
export const HAND_LIMIT = 10;

export type PlayerId = 'player' | 'ai';

export interface MinionInstance {
  instanceId: string;
  card: Card;
  attack: number;
  health: number;
  maxHealth: number;
  keywords: string[];
  divineShield: boolean;
  summonedThisTurn: boolean;
  attacksThisTurn: number;
  /** Skips its next attack; cleared at the start of its controller's turn. */
  frozen: boolean;
  /** Keywords and effects stripped. Kept as a flag so the UI can grey it out. */
  silenced: boolean;
  /** Buffed since it was summoned — drives the green bloom on the stat gems. */
  buffed: boolean;
}

/** An equipped weapon. Replaced, never stacked — equipping destroys the old one. */
export interface WeaponInstance {
  card: Card;
  attack: number;
  durability: number;
}

export interface PlayerState {
  id: PlayerId;
  health: number;
  /** Absorbs hero damage before health. Nothing grants it yet — see HANDOVER §7. */
  armor: number;
  mana: number;
  maxMana: number;
  deck: Card[];
  hand: Card[];
  board: MinionInstance[];
  fatigue: number;
  /** The equipped weapon, or null. A hero can only attack while armed. */
  weapon: WeaponInstance | null;
  /** Hero swings taken this turn. One per turn, and only with a weapon. */
  heroAttacksThisTurn: number;
  /** Which class this hero is, and therefore which hero power they have. */
  heroClass: CardClass;
  /** Hero power used this turn. Cleared at the start of its controller's turn. */
  heroPowerUsedThisTurn: boolean;
}

export interface MatchState {
  players: Record<PlayerId, PlayerState>;
  current: PlayerId;
  turnNumber: number;
  winner: PlayerId | 'draw' | null;
  log: string[];
  seed: number;
  nextInstanceId: number;
  /** Ordered animation cues drained by the UI. See events.ts. */
  events: import('./events').GameEvent[];
}

/** A minion or a hero — anything that can be damaged or healed. */
export type Character =
  | { kind: 'minion'; owner: PlayerId; minion: MinionInstance }
  | { kind: 'hero'; owner: PlayerId };

export function opponentOf(id: PlayerId): PlayerId {
  return id === 'player' ? 'ai' : 'player';
}

export function findMinion(
  state: MatchState,
  instanceId: string
): { owner: PlayerId; minion: MinionInstance } | undefined {
  for (const owner of ['player', 'ai'] as PlayerId[]) {
    const minion = state.players[owner].board.find((m) => m.instanceId === instanceId);
    if (minion) return { owner, minion };
  }
  return undefined;
}

/** Windfury minions get two swings a turn; everything else gets one. */
export function maxAttacksFor(minion: MinionInstance): number {
  return minion.keywords.includes('Windfury') ? 2 : 1;
}

export function canAttack(minion: MinionInstance): boolean {
  if (minion.attack <= 0) return false;
  if (minion.frozen) return false;
  if (minion.attacksThisTurn >= maxAttacksFor(minion)) return false;
  if (minion.summonedThisTurn && !minion.keywords.includes('Charge')) return false;
  return true;
}

/** Stealth minions cannot be picked as a target — including as a Taunt. */
export function isTargetable(minion: MinionInstance): boolean {
  return !minion.keywords.includes('Stealth');
}

export const HERO_POWER_COST = 2;

/**
 * Spell Damage on a player's board.
 *
 * Summed from `card.spellDamage`, skipping silenced minions — silence strips a
 * minion's text, and Spell Damage is text.
 */
export function spellPowerOf(player: PlayerState): number {
  return player.board.reduce(
    (total, minion) => total + (minion.silenced ? 0 : (minion.card.spellDamage ?? 0)),
    0
  );
}

/** Whether the hero power is available right now. */
export function canUseHeroPower(state: MatchState, id: PlayerId): boolean {
  const p = state.players[id];
  if (state.winner || state.current !== id) return false;
  if (p.heroPowerUsedThisTurn) return false;
  return p.mana >= HERO_POWER_COST;
}

/**
 * Whether the hero may swing this turn.
 *
 * Deliberately separate from `canAttack`, which is minion-shaped: a hero has no
 * summoning sickness, no Windfury and no board slot, and folding it in would
 * mean four `if (isHero)` branches inside a function about minions.
 */
export function canHeroAttack(player: PlayerState): boolean {
  if (!player.weapon || player.weapon.attack <= 0) return false;
  return player.heroAttacksThisTurn < 1;
}

/**
 * What a spell may be aimed at.
 *
 * **Taunt does not restrict spells** — that is the standard rule and the
 * interesting one, since it means a Taunt wall stops attacks but not a fireball.
 * Stealth still hides a minion from being picked.
 */
export function spellTargets(
  state: MatchState,
  caster: PlayerId,
  side: 'any' | 'enemy' | 'friendly' = 'any'
): Character[] {
  const foe = opponentOf(caster);
  const out: Character[] = [];

  const add = (owner: PlayerId) => {
    for (const minion of state.players[owner].board) {
      if (isTargetable(minion)) out.push({ kind: 'minion', owner, minion });
    }
    out.push({ kind: 'hero', owner });
  };

  if (side !== 'friendly') add(foe);
  if (side !== 'enemy') add(caster);
  return out;
}

/** Taunt forces attackers to go through it first. */
export function legalTargets(state: MatchState, defenderId: PlayerId): Character[] {
  const board = state.players[defenderId].board.filter(isTargetable);
  const taunts = board.filter((m) => m.keywords.includes('Taunt'));
  if (taunts.length > 0) {
    return taunts.map((minion) => ({ kind: 'minion', owner: defenderId, minion }));
  }
  return [
    ...board.map((minion) => ({ kind: 'minion' as const, owner: defenderId, minion })),
    { kind: 'hero' as const, owner: defenderId }
  ];
}

/** Strips everything a Silence should remove. Used by the Silence action. */
export function silence(minion: MinionInstance): void {
  minion.silenced = true;
  minion.keywords = [];
  minion.divineShield = false;
}
