import { BOARD_LIMIT, maxAttacksFor } from '../engine/state';
import type { Card } from '../../types/cards';
import type { ChosenRef, PlayerView, SerialisedMinion, TargetRef } from './protocol';

/**
 * Reading a `PlayerView`.
 *
 * The table renders a view, not a `MatchState`, so the affordances it draws —
 * which cards glow, which minions can swing, what is a legal target — have to
 * be computable from a view alone.
 *
 * **None of this is authority.** It decides what to highlight; the engine (local
 * or in the room) decides what actually happens, and will refuse anything these
 * helpers get wrong. They exist so the board looks right, not so it is correct.
 */

export function isMyTurn(view: PlayerView): boolean {
  return view.turn === view.you && !view.winner;
}

/** Whether a hand card can be played right now — mana, board space, turn. */
export function canPlayFromView(view: PlayerView, handIndex: number): boolean {
  if (!isMyTurn(view)) return false;
  const card = view.me.hand[handIndex];
  if (!card) return false;
  if (card.cost > view.me.mana) return false;
  if (card.type === 'Minion' && view.me.board.length >= BOARD_LIMIT) return false;
  return true;
}

/** Mirrors `canAttack` in state.ts, against the serialised shape. */
export function canAttackFromView(minion: SerialisedMinion): boolean {
  if (minion.attack <= 0) return false;
  if (minion.frozen) return false;
  if (minion.attacksThisTurn >= maxAttacksFor(minion as never)) return false;
  if (minion.summonedThisTurn && !minion.keywords.includes('Charge')) return false;
  return true;
}

/**
 * Legal attack targets on the opponent's side — Taunt forces the issue, Stealth
 * hides. Mirrors `legalTargets` in state.ts.
 */
export function legalTargetsFromView(view: PlayerView): TargetRef[] {
  const board = view.foe.board.filter((m) => !m.keywords.includes('Stealth'));
  const taunts = board.filter((m) => m.keywords.includes('Taunt'));
  if (taunts.length > 0) {
    return taunts.map((m) => ({ kind: 'minion', instanceId: m.instanceId }) as TargetRef);
  }
  return [
    ...board.map((m) => ({ kind: 'minion', instanceId: m.instanceId }) as TargetRef),
    { kind: 'hero' } as TargetRef
  ];
}

/** Nothing affordable and nothing that can swing: the turn is spent. */
export function turnIsSpent(view: PlayerView): boolean {
  if (!isMyTurn(view)) return false;
  const canPlay = view.me.hand.some((_, i) => canPlayFromView(view, i));
  const canSwing = view.me.board.some(canAttackFromView);
  return !canPlay && !canSwing && !view.me.canHeroAttack;
}

/**
 * What an aimed card may be pointed at, as wire references.
 *
 * Mirrors `spellTargets` in state.ts: **Taunt does not restrict spells**, but
 * Stealth still hides a minion. Highlighting only — the engine re-checks.
 */
export function chosenTargetsFromView(view: PlayerView, card: Card): ChosenRef[] {
  const side = card.targeting ?? 'any';
  const out: ChosenRef[] = [];

  const add = (board: SerialisedMinion[], which: 'me' | 'foe') => {
    for (const m of board) {
      if (!m.keywords.includes('Stealth')) out.push({ kind: 'minion', instanceId: m.instanceId });
    }
    out.push({ kind: 'hero', side: which });
  };

  if (side !== 'friendly') add(view.foe.board, 'foe');
  if (side !== 'enemy') add(view.me.board, 'me');
  return out;
}

/** A view of a match that has not started, so the table has something to draw. */
export function emptyView(): PlayerView {
  const side = {
    health: 30,
    armor: 0,
    mana: 0,
    maxMana: 0,
    deckCount: 0,
    board: [],
    weapon: null
  };
  return {
    you: 'player',
    turn: 'player',
    turnNumber: 0,
    winner: null,
    me: { ...side, hand: [], canHeroAttack: false },
    foe: { ...side, handCount: 0 },
    log: [],
    turnEndsIn: 0
  };
}
