import type { PlayerId } from './state';

/**
 * Animation cues. The engine appends these as it mutates state; the UI drains
 * the queue and plays them back on a timeline, so a death can shatter before
 * it is removed from the board.
 *
 * They are cues, NOT a source of truth — replaying them does not reconstruct
 * the match. MatchState remains authoritative.
 */
export type GameEvent =
  | { type: 'draw'; owner: PlayerId }
  | { type: 'summon'; owner: PlayerId; instanceId: string }
  | { type: 'attack'; owner: PlayerId; instanceId: string }
  | { type: 'damage'; target: { kind: 'minion'; instanceId: string } | { kind: 'hero'; owner: PlayerId }; amount: number }
  | { type: 'shield'; instanceId: string }
  | { type: 'death'; owner: PlayerId; instanceId: string }
  | { type: 'freeze'; instanceId: string }
  | { type: 'silence'; instanceId: string }
  | { type: 'buff'; instanceId: string }
  | { type: 'turn'; owner: PlayerId };

/** Milliseconds the UI should hold on each cue before applying the next. */
export const EVENT_BEAT: Record<GameEvent['type'], number> = {
  draw: 420,
  summon: 480,
  attack: 230,
  damage: 260,
  shield: 260,
  death: 400,
  freeze: 300,
  silence: 300,
  buff: 260,
  turn: 1300
};
