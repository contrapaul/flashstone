import type { Card, CardClass } from '../../types/cards';
import {
  attack,
  canPlayCard,
  choose,
  createMatch,
  endTurn,
  mulligan,
  heroAttack,
  playCard,
  useHeroPower
} from '../engine/engine';
import { aiMulligan, applyAiIntent, type AiIntent, type AiTurn } from '../engine/ai';
import type { GameEvent } from '../engine/events';
import { findMinion, opponentOf, type Character, type MatchState, type PlayerId } from '../engine/state';
import { viewFor } from './room';
import type { ChosenRef, EmoteId, PlayerView, TargetRef } from './protocol';
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
  playCard(handIndex: number, slot?: number, target?: ChosenRef): void;
  attack(instanceId: string, target: TargetRef): void;
  heroAttack(target: TargetRef): void;
  heroPower(target?: ChosenRef): void;
  endTurn(): void;
  /** Picks one of a waiting Discover's options. */
  choose(index: number): void;
  /** Keeps the opening hand but for these positions. */
  mulligan(replace: number[]): void;
  /** Says one of the fixed emotes. */
  emote(id: EmoteId): void;
  concede(): void;
  /** Local only — online matches restart by making a new game. */
  restart?(): void;
  destroy(): void;
}

export interface SourceHandlers {
  onView(view: PlayerView, events: GameEvent[]): void;
  onStatus(status: MatchStatus): void;
  onError(message: string): void;
  /** Someone said something — either side, yourself included. */
  onEmote?(from: PlayerId, emote: EmoteId): void;
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
 * The AI still runs in the browser, one move at a time through `aiTurn`
 * (`stepOpponent`); this only changes how the board is fed. Because the view is
 * produced by the same `viewFor` the room uses, a bug in what the opponent is
 * allowed to see would show up in single-player too — which is a good place for
 * it to show up.
 */
export class LocalSource implements MatchSource {
  private state: MatchState;
  private handlers: SourceHandlers;
  private deck: Card[];
  private foeDeck: Card[];
  private aiTurn: (state: MatchState) => AiTurn;
  private classes: { player: CardClass; ai: CardClass };
  /** The AI's turn in progress, and the decision it is about to carry out. */
  private turn: AiTurn | null = null;
  private pending: AiIntent | null = null;

  constructor(
    deck: Card[],
    foeDeck: Card[],
    handlers: SourceHandlers,
    aiTurn: (state: MatchState) => AiTurn,
    classes: { player: CardClass; ai: CardClass } = { player: 'Designer', ai: 'Manufacturer' }
  ) {
    this.deck = deck;
    this.foeDeck = foeDeck;
    this.handlers = handlers;
    this.aiTurn = aiTurn;
    this.classes = classes;
    this.state = this.open(Date.now() % 100000);
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
    // A good loser, after the killing blow has had time to land.
    if (this.state.winner === 'player' && !this.congratulated) {
      this.congratulated = true;
      this.later(() => this.handlers.onEmote?.('ai', 'nice'), 1800);
    }
  }

  playCard(handIndex: number, slot?: number, target?: ChosenRef) {
    if (!canPlayCard(this.state, 'player', handIndex)) return;
    const chosen = this.resolveChosen(target);
    if (playCard(this.state, 'player', handIndex, slot, chosen)) this.publish();
  }

  /** Turns a UI-level target into the engine's `Character`. */
  private resolveChosen(ref: ChosenRef | undefined): Character | undefined {
    if (!ref) return undefined;
    if (ref.kind === 'hero') {
      return { kind: 'hero', owner: ref.side === 'me' ? 'player' : 'ai' };
    }
    const found = findMinion(this.state, ref.instanceId);
    return found ? { kind: 'minion', owner: found.owner, minion: found.minion } : undefined;
  }

  attack(instanceId: string, target: TargetRef) {
    const engineTarget =
      target.kind === 'hero'
        ? ({ kind: 'hero' } as const)
        : ({ kind: 'minion', instanceId: target.instanceId } as const);
    if (attack(this.state, 'player', instanceId, engineTarget)) this.publish();
  }

  heroAttack(target: TargetRef) {
    const foe = opponentOf('player');
    const resolved: Character | undefined =
      target.kind === 'hero'
        ? { kind: 'hero', owner: foe }
        : (() => {
            const found = findMinion(this.state, target.instanceId);
            return found ? { kind: 'minion' as const, owner: found.owner, minion: found.minion } : undefined;
          })();
    if (resolved && heroAttack(this.state, 'player', resolved)) this.publish();
  }

  heroPower(target?: ChosenRef) {
    if (useHeroPower(this.state, 'player', this.resolveChosen(target))) this.publish();
  }

  endTurn() {
    endTurn(this.state);
    this.publish();
  }

  choose(index: number) {
    if (choose(this.state, 'player', index)) this.publish();
  }

  mulligan(replace: number[]) {
    if (!mulligan(this.state, 'player', replace)) return;
    this.publish();
    // The match has begun: the AI says hello, unless you already did and it answered.
    const state = this.state;
    if (!this.answered) {
      this.later(() => {
        if (this.state !== state || this.answered) return;
        this.answered = true;
        this.handlers.onEmote?.('ai', 'hello');
      }, 1600);
    }
  }

  /**
   * Your emote, and the AI's manners: it greets you as the match begins (or
   * answers your Hello, if you got there first), and says "Nice design!" when
   * you beat it.
   */
  emote(id: EmoteId) {
    this.handlers.onEmote?.('player', id);
    if (id === 'hello' && !this.answered) {
      this.answered = true;
      this.later(() => this.handlers.onEmote?.('ai', 'hello'), 1200);
    }
  }

  private answered = false;
  private congratulated = false;
  /** Lines the AI has used this match: each is said at most once. */
  private said = new Set<EmoteId>();

  /**
   * The AI's personality, in a few lines said once a match each: thinking
   * aloud over its first big card, announcing a Legendary, and owning up when
   * it is losing.
   */
  private once(id: EmoteId, ms: number) {
    if (this.said.has(id)) return;
    this.said.add(id);
    this.later(() => this.handlers.onEmote?.('ai', id), ms);
  }

  private remark(played: Card | undefined) {
    if (played?.rarity === 'Legendary') this.once('incoming', 400);
    if (!this.state.winner && this.state.players.ai.health <= 10) this.once('oops', 900);
  }
  private timers: ReturnType<typeof setTimeout>[] = [];

  private later(fn: () => void, ms: number) {
    this.timers.push(setTimeout(fn, ms));
  }

  /** A new match opens on the mulligan; the AI settles its hand at once. */
  private open(seed: number): MatchState {
    const state = createMatch(this.deck, this.foeDeck, seed, this.classes, { mulligan: true });
    mulligan(state, 'ai', aiMulligan(state));
    this.answered = false;
    this.congratulated = false;
    this.said = new Set();
    return state;
  }

  /**
   * What the AI will do next, or null when it is not its turn.
   *
   * Exposed so the route can think for as long as the move deserves — a big
   * minion is worth a longer pause than ending the turn.
   */
  nextOpponentIntent(): AiIntent | null {
    if (this.state.winner || this.state.current !== 'ai') {
      this.turn = null;
      this.pending = null;
      return null;
    }
    if (!this.turn) {
      this.turn = this.aiTurn(this.state);
      const step = this.turn.next();
      this.pending = step.done ? null : step.value;
    }
    // Thinking aloud, over its first big card, while the route lets it think.
    const next = this.pending;
    const card = next?.kind === 'play' ? this.state.players.ai.hand[next.handIndex] : undefined;
    if (card && card.cost >= 5 && card.rarity !== 'Legendary') this.once('hmm', 0);
    return this.pending;
  }

  /**
   * Carries out the AI's next decision, and publishes it.
   *
   * One move per call, so each lands on the table and plays out before the
   * next is made — the opponent's turn as a sequence you can follow, rather
   * than one batch of everything at once. Returns false once its turn is over.
   */
  stepOpponent(): boolean {
    const intent = this.nextOpponentIntent();
    if (!intent || !this.turn) return false;
    const card = intent.kind === 'play' ? this.state.players.ai.hand[intent.handIndex] : undefined;
    const step = this.turn.next(applyAiIntent(this.state, intent));
    this.remark(card);
    this.pending = step.done ? null : step.value;
    if (step.done) this.turn = null;
    this.publish();
    return true;
  }

  concede() {
    this.state.winner = 'ai';
    this.publish();
  }

  restart() {
    this.turn = null;
    this.pending = null;
    this.state = this.open(Date.now() % 100000);
    this.handlers.onStatus({ kind: 'playing' });
    this.publish();
  }

  destroy() {
    for (const timer of this.timers) clearTimeout(timer);
    this.timers = [];
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
      onEmote: (from, emote) => handlers.onEmote?.(from, emote),
      onError: (message) => handlers.onError(message),
      onDisconnected: () => handlers.onStatus({ kind: 'disconnected' })
    });
  }

  playCard(handIndex: number, slot?: number, target?: ChosenRef) {
    this.connection.send({ type: 'playCard', handIndex, slot, target });
  }

  attack(instanceId: string, target: TargetRef) {
    this.connection.send({ type: 'attack', instanceId, target });
  }

  heroAttack(target: TargetRef) {
    this.connection.send({ type: 'heroAttack', target });
  }

  heroPower(target?: ChosenRef) {
    this.connection.send({ type: 'heroPower', target });
  }

  endTurn() {
    this.connection.send({ type: 'endTurn' });
  }

  choose(index: number) {
    this.connection.send({ type: 'choose', index });
  }

  mulligan(replace: number[]) {
    this.connection.send({ type: 'mulligan', replace });
  }

  emote(id: EmoteId) {
    this.connection.send({ type: 'emote', emote: id });
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
