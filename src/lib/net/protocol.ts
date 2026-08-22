import { z } from 'zod';
import type { Card } from '../../types/cards';
import type { GameEvent } from '../engine/events';
import type { PlayerId } from '../engine/state';

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
  z.object({ type: z.literal('endTurn') }),
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
  };
  log: string[];
  /** Seconds left on the current turn, so both clients show the same clock. */
  turnEndsIn: number;
}

export interface SerialisedWeapon {
  name: string;
  attack: number;
  durability: number;
}

export interface SerialisedMinion {
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
  | { type: 'error'; message: string };

export const ServerMessageTypes = [
  'joined',
  'waiting',
  'state',
  'over',
  'opponentLeft',
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
