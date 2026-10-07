import { z } from 'zod';
import type { Card, CardClass } from '../../types/cards';
import type { GameEvent } from '../engine/events';
import type { HistoryEntry, MinionSnapshot, PlayerId, WeaponSnapshot } from '../engine/state';

/**
 * The wire between the browser and the match Durable Object.
 *
 * Everything the client sends is an **intent**, never a result: "I want to play
 * hand card 2 onto slot 1", not "a minion appeared". The room applies it through
 * the same `playCard` / `attack` / `endTurn` the local game uses, and broadcasts
 * what actually happened. A client cannot make a move the engine would reject,
 * because the engine is the thing deciding.
 *
 * Everything is validated with Zod on arrival. A malformed frame is answered
 * with an error, never trusted and never allowed to throw inside the room.
 */

export const PROTOCOL_VERSION = 1;

/**
 * The emotes: a fixed, friendly set — never free text, which in a classroom
 * is the whole point. Keyed so the wire carries an id, not a phrase.
 */
export const EMOTES = {
  hello: 'Hello!',
  nice: 'Nice design!',
  thanks: 'Thanks!',
  hmm: 'Hmm…',
  oops: 'Back to the drawing board!',
  incoming: 'Prototype incoming!'
} as const;
export type EmoteId = keyof typeof EMOTES;
const EmoteSchema = z.enum(['hello', 'nice', 'thanks', 'hmm', 'oops', 'incoming']);

// ── Client → server ──────────────────────────────────────────

const TargetRefSchema = z.union([
  z.object({ kind: z.literal('hero') }),
  z.object({ kind: z.literal('minion'), instanceId: z.string().max(32) })
]);

/** A spell target, which may be on either side of the table. */
const ChosenRefSchema = z.union([
  z.object({ kind: z.literal('hero'), side: z.enum(['me', 'foe']) }),
  z.object({ kind: z.literal('minion'), instanceId: z.string().max(32) })
]);

export const ClientMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('hello'), version: z.number().int() }),
  z.object({
    type: z.literal('playCard'),
    handIndex: z.number().int().min(0).max(9),
    slot: z.number().int().min(0).max(7).optional(),
    /**
     * Where an aimed spell points. **Re-validated against `spellTargets`
     * server-side** — the client decides what to light up, never what is legal.
     * Unlike an attack target this may name a friendly character, so it carries
     * an owner.
     */
    target: ChosenRefSchema.optional()
  }),
  z.object({
    type: z.literal('attack'),
    instanceId: z.string().max(32),
    target: TargetRefSchema
  }),
  /** The hero swinging an equipped weapon. */
  z.object({ type: z.literal('heroAttack'), target: TargetRefSchema }),
  /** Using the class hero power. `target` only for powers that are aimed. */
  z.object({ type: z.literal('heroPower'), target: ChosenRefSchema.optional() }),
  z.object({ type: z.literal('endTurn') }),
  /** Keeps the opening hand but for these positions, which go back for new cards. */
  z.object({ type: z.literal('mulligan'), replace: z.array(z.number().int().min(0).max(3)).max(4) }),
  /** One of the fixed emotes. Rate-limited by the room. */
  z.object({ type: z.literal('emote'), emote: EmoteSchema }),
  /** Picks one of a Discover's options, by position. */
  z.object({ type: z.literal('choose'), index: z.number().int().min(0).max(2) }),
  z.object({ type: z.literal('concede') }),
  /** Asks for the full state again — used after a reconnect. */
  z.object({ type: z.literal('resync') })
]);

export type ClientMessage = z.infer<typeof ClientMessageSchema>;
export type TargetRef = z.infer<typeof TargetRefSchema>;
export type ChosenRef = z.infer<typeof ChosenRefSchema>;

// ── Server → client ──────────────────────────────────────────

/**
 * What one player is allowed to see.
 *
 * The opponent's hand is a **count**, not a list, and their deck is a count too.
 * Sending the whole `MatchState` would put their hand in the browser's memory
 * where devtools can read it — the one thing an authoritative server exists to
 * prevent.
 */
export interface PlayerView {
  you: PlayerId;
  turn: PlayerId;
  turnNumber: number;
  winner: PlayerId | 'draw' | null;
  me: {
    health: number;
    armor: number;
    mana: number;
    maxMana: number;
    hand: Card[];
    deckCount: number;
    board: SerialisedMinion[];
    weapon: SerialisedWeapon | null;
    canHeroAttack: boolean;
    heroClass: CardClass;
    /** Enough mana, right turn, not yet used, and it would actually do something. */
    canUseHeroPower: boolean;
    heroPowerUsed: boolean;
    spellDamage: number;
  };
  foe: {
    health: number;
    armor: number;
    mana: number;
    maxMana: number;
    handCount: number;
    deckCount: number;
    board: SerialisedMinion[];
    weapon: SerialisedWeapon | null;
    heroClass: CardClass;
    heroPowerUsed: boolean;
    spellDamage: number;
  };
  log: string[];
  /**
   * The latest actions, each with what it did — the Chronicle. Public by
   * construction: an entry names only cards that were played, burned or on
   * the board, never one still in a hand or a deck.
   */
  history: HistoryEntry[];
  /**
   * Before the first turn: `choose` while your opening hand awaits keep-or-replace,
   * `waiting` once yours is settled and theirs is not, null after.
   */
  mulligan: 'choose' | 'waiting' | null;
  /** A Discover waiting on **you**: its options. Never sent to the other player. */
  choice: Card[] | null;
  /** A Discover waiting on the other player — all you may know of it. */
  foeChoosing: boolean;
  /** Seconds left on the current turn, so both clients show the same clock. */
  turnEndsIn: number;
}

/** The engine's snapshot shapes, so a cue and a view can never disagree on one. */
export type SerialisedWeapon = WeaponSnapshot;
export type SerialisedMinion = MinionSnapshot;

export interface OpponentInfo {
  username: string;
  cardBack: string;
}

export type ServerMessage =
  | { type: 'joined'; you: PlayerId; opponent: OpponentInfo | null }
  | { type: 'waiting' }
  /** State plus the cues that produced it — the client drains these to animate. */
  | { type: 'state'; view: PlayerView; events: GameEvent[] }
  | { type: 'over'; view: PlayerView; winner: PlayerId | 'draw'; goldAwarded: number }
  | { type: 'opponentLeft' }
  /** A player's emote, to both seats — the sender sees their own bubble from the same message. */
  | { type: 'emote'; from: PlayerId; emote: EmoteId }
  | { type: 'error'; message: string };

export const ServerMessageTypes = [
  'joined',
  'waiting',
  'state',
  'over',
  'opponentLeft',
  'emote',
  'error'
] as const;

/** Parses a raw frame. Returns null rather than throwing, so a bad frame is data. */
export function parseClientMessage(raw: string): ClientMessage | null {
  try {
    const result = ClientMessageSchema.safeParse(JSON.parse(raw));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export function parseServerMessage(raw: string): ServerMessage | null {
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value.type !== 'string') return null;
    if (!ServerMessageTypes.includes(value.type)) return null;
    return value as ServerMessage;
  } catch {
    return null;
  }
}
