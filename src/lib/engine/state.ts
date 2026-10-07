import type { Action, Card, CardClass, CardType, Trigger } from '../../types/cards';
import type { CueRef } from './events';

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
  /** This player's minions that have died this game, oldest first. Public, as the board was. */
  graveyard: Card[];
}

/** What happened to one thing an action touched. */
export type HistoryResult =
  | 'damage'
  | 'heal'
  | 'killed'
  | 'buff'
  | 'frozen'
  | 'silenced'
  | 'shielded'
  | 'summoned'
  | 'armor'
  | 'returned'
  | 'transformed';

export interface HistoryTarget {
  ref: CueRef;
  /** The minion's card, or absent for a hero. */
  cardId?: string;
  name: string;
  result: HistoryResult;
  amount?: number;
}

/**
 * One action, and what came of it — the match's play history.
 *
 * Entries are made by the engine as actions happen: a card played, an attack,
 * a hero power, a turn trigger, fatigue, a burn. Everything the action caused
 * — Battlecries, Deathrattles and all — is folded into its `targets`.
 *
 * **Public information only**, by construction: every card it names has been
 * played, has attacked, sits on the board, or was burned in plain sight. A
 * draw is never an entry. `view.test.ts` holds it to that.
 */
export interface HistoryEntry {
  /** Its place in the match's history, counting from 0. Survives trimming. */
  n: number;
  turn: number;
  actor: PlayerId;
  kind: 'play' | 'attack' | 'heroPower' | 'trigger' | 'fatigue' | 'burn';
  /** The card that acted; absent for a hero power and for fatigue. */
  cardId?: string;
  name: string;
  cardType?: CardType;
  /** Which text fired, for a `trigger`. */
  trigger?: Trigger;
  /** The class whose hero power it was, for a `heroPower`. */
  heroClass?: CardClass;
  /** Fatigue's damage. */
  amount?: number;
  targets: HistoryTarget[];
}

export interface MatchState {
  players: Record<PlayerId, PlayerState>;
  current: PlayerId;
  turnNumber: number;
  winner: PlayerId | 'draw' | null;
  log: string[];
  /** The play history — see HistoryEntry. */
  history: HistoryEntry[];
  /** The entry being written, while an action resolves. Engine bookkeeping. */
  openEntry: number | null;
  /** An entry just opened, waiting to be stamped on the next cue. Engine bookkeeping. */
  stamp: number | null;
  /** Which entry last damaged or destroyed each minion, to credit its death. Engine bookkeeping. */
  lastHit: Record<string, number>;
  /**
   * Reactions waiting to fire — a minion's text answering something that just
   * happened (it was hurt, a friend died, its owner cast a spell). Queued as it
   * happens and fired once the action has settled, as Hearthstone resolves them,
   * so an attack's two hits both land before either side reacts.
   */
  reactions: { owner: PlayerId; instanceId: string; trigger: Trigger }[];
  seed: number;
  nextInstanceId: number;
  /** Ordered animation cues drained by the UI. See events.ts. */
  events: import('./events').GameEvent[];
}

/**
 * A minion as it may be shown: what the view sends and what a `summon` cue
 * carries. Defined here rather than in the protocol so the engine can emit it —
 * the cue and the view are then the same shape by construction.
 */
export interface MinionSnapshot {
  instanceId: string;
  card: Card;
  attack: number;
  health: number;
  maxHealth: number;
  keywords: string[];
  divineShield: boolean;
  summonedThisTurn: boolean;
  attacksThisTurn: number;
  frozen: boolean;
  silenced: boolean;
  buffed: boolean;
}

export interface WeaponSnapshot {
  name: string;
  attack: number;
  durability: number;
}

export function snapshotMinion(minion: MinionInstance): MinionSnapshot {
  return {
    instanceId: minion.instanceId,
    card: minion.card,
    attack: minion.attack,
    health: minion.health,
    maxHealth: minion.maxHealth,
    keywords: [...minion.keywords],
    divineShield: minion.divineShield,
    summonedThisTurn: minion.summonedThisTurn,
    attacksThisTurn: minion.attacksThisTurn,
    frozen: minion.frozen,
    silenced: minion.silenced,
    buffed: minion.buffed
  };
}

export function snapshotWeapon(weapon: WeaponInstance | null): WeaponSnapshot | null {
  return weapon ? { name: weapon.card.name, attack: weapon.attack, durability: weapon.durability } : null;
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
/** Aimed actions that only mean anything to a minion: a hero is not offered as their target. */
export const MINION_ONLY: ReadonlySet<Action> = new Set([
  'Destroy',
  'Silence',
  'SwapStats',
  'BuffAttack',
  'BuffHealth',
  'GainKeyword',
  'ReturnToHand',
  'Transform'
]);

/** Whether a card's aimed effect can only be pointed at minions. */
export function aimsAtMinions(card: Card): boolean {
  return card.effects.some((e) => e.target === 'Chosen' && MINION_ONLY.has(e.action));
}

export function spellTargets(
  state: MatchState,
  caster: PlayerId,
  side: 'any' | 'enemy' | 'friendly' = 'any',
  minionsOnly = false
): Character[] {
  const foe = opponentOf(caster);
  const out: Character[] = [];

  const add = (owner: PlayerId) => {
    for (const minion of state.players[owner].board) {
      if (isTargetable(minion)) out.push({ kind: 'minion', owner, minion });
    }
    if (!minionsOnly) out.push({ kind: 'hero', owner });
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
