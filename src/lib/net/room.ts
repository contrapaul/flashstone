import type { Card } from '../../types/cards';
import { attack, canPlayCard, createMatch, endTurn, playCard } from '../engine/engine';
import type { GameEvent } from '../engine/events';
import { findMinion, type MatchState, type MinionInstance, type PlayerId } from '../engine/state';
import type { ClientMessage, PlayerView, SerialisedMinion, TargetRef } from './protocol';

/**
 * The rules of an online match, with no sockets in sight.
 *
 * Kept apart from the Durable Object so it can be tested directly: every claim
 * about what a client may and may not do is a unit test, not a WebSocket
 * integration test that nobody runs.
 *
 * The engine is the authority. This layer decides only *whether a message is
 * allowed to reach it* — right player, right turn, well-formed — and then lets
 * `playCard` / `attack` / `endTurn` return their own verdict.
 */

export const TURN_SECONDS = 75;
/** Missing this many turns in a row concedes. */
export const MAX_MISSED_TURNS = 2;

export interface ApplyResult {
  ok: boolean;
  error?: string;
  /** Cues drained from the engine, for the client to animate. */
  events: GameEvent[];
}

export function createRoomState(playerDeck: Card[], foeDeck: Card[], seed: number): MatchState {
  return createMatch(playerDeck, foeDeck, seed);
}

/** The engine's own target shape — a hero target carries no owner; it is the defender. */
type EngineTarget = { kind: 'minion'; instanceId: string } | { kind: 'hero' };

function resolveTarget(state: MatchState, ref: TargetRef): EngineTarget | null {
  if (ref.kind === 'hero') return { kind: 'hero' };
  // A minion id that names nothing is a stale client, not an attack.
  return findMinion(state, ref.instanceId) ? { kind: 'minion', instanceId: ref.instanceId } : null;
}

/**
 * Applies one client message.
 *
 * Returns `ok: false` with a reason rather than throwing: a rejected move is an
 * ordinary event in a game where the other player might be trying it on, and a
 * throw inside a Durable Object would take the room down for both of them.
 */
export function applyMessage(
  state: MatchState,
  from: PlayerId,
  message: ClientMessage
): ApplyResult {
  const drain = (): GameEvent[] => {
    const events = [...(state.events ?? [])];
    state.events = [];
    return events;
  };

  if (state.winner) return { ok: false, error: 'The match is over.', events: [] };

  // Conceding is deliberately outside the turn check. You must be able to give
  // up while the *other* player is thinking — that is when you most want to —
  // and gating it on your own turn means a player waiting on a turn timer
  // cannot leave for over a minute.
  if (message.type === 'concede') {
    state.winner = from === 'player' ? 'ai' : 'player';
    state.log.push(`${from} concedes.`);
    return { ok: true, events: drain() };
  }

  // Everything else mutates the board, and none of it is reachable out of turn.
  // This is the whole security model for pacing.
  if (state.current !== from) {
    return { ok: false, error: 'It is not your turn.', events: [] };
  }

  switch (message.type) {
    case 'playCard': {
      if (!canPlayCard(state, from, message.handIndex)) {
        return { ok: false, error: 'You cannot play that card.', events: [] };
      }
      const played = playCard(state, from, message.handIndex, message.slot);
      return played
        ? { ok: true, events: drain() }
        : { ok: false, error: 'That play was rejected.', events: [] };
    }

    case 'attack': {
      const mine = state.players[from].board.some((m) => m.instanceId === message.instanceId);
      if (!mine) return { ok: false, error: 'That minion is not yours.', events: [] };

      const target = resolveTarget(state, message.target);
      if (!target) return { ok: false, error: 'No such target.', events: [] };

      const swung = attack(state, from, message.instanceId, target);
      return swung
        ? { ok: true, events: drain() }
        : { ok: false, error: 'That attack was rejected.', events: [] };
    }

    case 'endTurn':
      // endTurn reads state.current itself; the guard above already proved that
      // is `from`.
      endTurn(state);
      return { ok: true, events: drain() };

    default:
      return { ok: false, error: 'Unsupported message.', events: [] };
  }
}

/** Ends the turn of whoever is on the clock. Used by the turn timer. */
export function forceEndTurn(state: MatchState): GameEvent[] {
  if (state.winner) return [];
  state.log.push('Turn timed out.');
  endTurn(state);
  const events = [...(state.events ?? [])];
  state.events = [];
  return events;
}

function serialiseMinion(minion: MinionInstance): SerialisedMinion {
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

/**
 * What one player may see.
 *
 * The opponent's hand becomes a **count**. Sending the whole `MatchState` would
 * put their cards in the other browser's memory, where devtools reads them for
 * free — which would make the authoritative server pointless.
 */
export function viewFor(state: MatchState, viewer: PlayerId, turnEndsIn = 0): PlayerView {
  const me = state.players[viewer];
  const foe = state.players[viewer === 'player' ? 'ai' : 'player'];

  return {
    you: viewer,
    turn: state.current,
    turnNumber: state.turnNumber,
    winner: state.winner,
    me: {
      health: me.health,
      armor: me.armor,
      mana: me.mana,
      maxMana: me.maxMana,
      hand: me.hand,
      deckCount: me.deck.length,
      board: me.board.map(serialiseMinion)
    },
    foe: {
      health: foe.health,
      armor: foe.armor,
      mana: foe.mana,
      maxMana: foe.maxMana,
      handCount: foe.hand.length,
      deckCount: foe.deck.length,
      board: foe.board.map(serialiseMinion)
    },
    log: state.log,
    turnEndsIn
  };
}
