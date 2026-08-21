import type { Card } from '../../types/cards';
import { attack, canPlayCard, createMatch, endTurn, playCard } from '../engine/engine';
import type { GameEvent } from '../engine/events';
import type { MatchState, PlayerId } from '../engine/state';
import { viewFor } from './room';
import type { PlayerView, TargetRef } from './protocol';
import { connectToMatch, type OnlineConnection } from './client';

/**
 * Where a match comes from.
 *
 * The table renders a `PlayerView` and emits intents. Two things can satisfy
 * that: the local engine, and a Durable Object at the other end of a socket.
 * **The board must never branch on which** — that is the whole point of this
 * file, and the reason `viewFor` is a pure function rather than something the
 * room does on its way out.
 */

export interface MatchSource {
  playCard(handIndex: number, slot?: number, target?: TargetRef): void;
  attack(instanceId: string, target: TargetRef): void;
  endTurn(): void;
  concede(): void;
  /** Local only — online matches restart by making a new game. */
  restart?(): void;
  destroy(): void;
}

export interface SourceHandlers {
  onView(view: PlayerView, events: GameEvent[]): void;
  onStatus(status: MatchStatus): void;
  onError(message: string): void;
}

export interface MatchStatus {
  kind: 'waiting' | 'playing' | 'over' | 'disconnected' | 'opponentLeft';
  opponent?: { username: string; cardBack: string } | null;
  goldAwarded?: number;
}

// ── Local ────────────────────────────────────────────────────

/**
 * The single-player match, wrapped to look exactly like a remote one.
 *
 * The AI still runs in the browser and still takes its turn through
 * `playAiTurn`; this only changes how the board is fed. Because the view is
 * produced by the same `viewFor` the room uses, a bug in what the opponent is
 * allowed to see would show up in single-player too — which is a good place for
 * it to show up.
 */
export class LocalSource implements MatchSource {
  private state: MatchState;
  private handlers: SourceHandlers;
  private deck: Card[];
  private foeDeck: Card[];
  private takeAiTurn: (state: MatchState) => void;

  constructor(
    deck: Card[],
    foeDeck: Card[],
    handlers: SourceHandlers,
    takeAiTurn: (state: MatchState) => void
  ) {
    this.deck = deck;
    this.foeDeck = foeDeck;
    this.handlers = handlers;
    this.takeAiTurn = takeAiTurn;
    this.state = createMatch(deck, foeDeck, Date.now() % 100000);
    this.publish();
  }

  get raw(): MatchState {
    return this.state;
  }

  private drain(): GameEvent[] {
    const events = [...(this.state.events ?? [])];
    this.state.events = [];
    return events;
  }

  private publish(events: GameEvent[] = this.drain()) {
    this.handlers.onView(viewFor(this.state, 'player'), events);
    if (this.state.winner) this.handlers.onStatus({ kind: 'over' });
  }

  playCard(handIndex: number, slot?: number) {
    if (!canPlayCard(this.state, 'player', handIndex)) return;
    if (playCard(this.state, 'player', handIndex, slot)) this.publish();
  }

  attack(instanceId: string, target: TargetRef) {
    const engineTarget =
      target.kind === 'hero'
        ? ({ kind: 'hero' } as const)
        : ({ kind: 'minion', instanceId: target.instanceId } as const);
    if (attack(this.state, 'player', instanceId, engineTarget)) this.publish();
  }

  endTurn() {
    endTurn(this.state);
    this.publish();
  }

  /** Runs the AI's turn. Called by the route once playback has caught up. */
  runOpponent() {
    if (this.state.winner || this.state.current !== 'ai') return;
    this.takeAiTurn(this.state);
    this.publish();
  }

  concede() {
    this.state.winner = 'ai';
    this.publish();
  }

  restart() {
    this.state = createMatch(this.deck, this.foeDeck, Date.now() % 100000);
    this.handlers.onStatus({ kind: 'playing' });
    this.publish();
  }

  destroy() {
    // Nothing to release: the local match is plain objects.
  }
}

// ── Remote ───────────────────────────────────────────────────

/** An online match. Every intent is a message; nothing is decided here. */
export class RemoteSource implements MatchSource {
  private connection: OnlineConnection;

  constructor(gameId: string, handlers: SourceHandlers) {
    this.connection = connectToMatch(gameId, {
      onState: (view, events) => handlers.onView(view, events),
      onJoined: (_you, opponent) => handlers.onStatus({ kind: 'playing', opponent }),
      onWaiting: () => handlers.onStatus({ kind: 'waiting' }),
      onOver: (view, _winner, goldAwarded) => {
        handlers.onView(view, []);
        handlers.onStatus({ kind: 'over', goldAwarded });
      },
      onOpponentLeft: () => handlers.onStatus({ kind: 'opponentLeft' }),
      onError: (message) => handlers.onError(message),
      onDisconnected: () => handlers.onStatus({ kind: 'disconnected' })
    });
  }

  playCard(handIndex: number, slot?: number, target?: TargetRef) {
    this.connection.send({ type: 'playCard', handIndex, slot, target });
  }

  attack(instanceId: string, target: TargetRef) {
    this.connection.send({ type: 'attack', instanceId, target });
  }

  endTurn() {
    this.connection.send({ type: 'endTurn' });
  }

  concede() {
    this.connection.send({ type: 'concede' });
  }

  destroy() {
    this.connection.close();
  }
}

/** The side the viewer plays, for code that still needs a PlayerId. */
export function viewerSide(view: PlayerView): PlayerId {
  return view.you;
}
