import { describe, expect, it } from 'vitest';
import type { Card } from '../../types/cards';
import { buildAiDeck } from '../data/aiDeck';
import { playAiTurn } from '../engine/ai';
import { attack, createMatch, endTurn, needsTarget, playCard } from '../engine/engine';
import type { GameEvent } from '../engine/events';
import { canAttack, legalTargets, type MatchState } from '../engine/state';
import { viewFor } from '../net/room';
import type { PlayerView, SerialisedMinion } from '../net/protocol';
import { emptyView } from '../net/view';
import { applyCue } from './apply';

function minion(instanceId: string, over: Partial<SerialisedMinion> = {}): SerialisedMinion {
  return {
    instanceId,
    card: { id: instanceId, name: instanceId, cost: 1, type: 'Minion', rarity: 'Common', keywords: [], effects: [], description: '' } as Card,
    attack: 2,
    health: 3,
    maxHealth: 3,
    keywords: [],
    divineShield: false,
    summonedThisTurn: false,
    attacksThisTurn: 0,
    frozen: false,
    silenced: false,
    buffed: false,
    ...over
  };
}

function withBoards(me: SerialisedMinion[], foe: SerialisedMinion[]): PlayerView {
  const view = emptyView();
  return { ...view, me: { ...view.me, board: me }, foe: { ...view.foe, board: foe } };
}

const ids = (board: SerialisedMinion[]) => board.map((m) => m.instanceId);

describe('applyCue', () => {
  it('keeps a dying minion on screen until its own death cue', () => {
    const shown = withBoards([minion('a'), minion('b')], []);
    const target = withBoards([minion('b')], []);

    const hit = applyCue(shown, { type: 'damage', target: { kind: 'minion', instanceId: 'a' }, amount: 3 }, target);
    expect(ids(hit.me.board)).toEqual(['a', 'b']);
    expect(hit.me.board[0].health).toBe(0);

    const dead = applyCue(hit, { type: 'death', owner: 'player', instanceId: 'a' }, target);
    expect(ids(dead.me.board)).toEqual(['b']);
  });

  it('lets armor soak hero damage first', () => {
    const shown = { ...emptyView(), foe: { ...emptyView().foe, health: 20, armor: 2 } };
    const next = applyCue(shown, { type: 'damage', target: { kind: 'hero', owner: 'ai' }, amount: 5 }, shown);
    expect(next.foe.armor).toBe(0);
    expect(next.foe.health).toBe(17);
  });

  it('inserts a summon after its nearest shown neighbour, not at its final index', () => {
    // 'x' dies later in the batch, so it is still on screen when 'n' lands.
    const shown = withBoards([minion('x'), minion('a'), minion('b')], []);
    const target = withBoards([minion('a'), minion('n'), minion('b')], []);
    const next = applyCue(shown, { type: 'summon', owner: 'player', instanceId: 'n' }, target);
    expect(ids(next.me.board)).toEqual(['x', 'a', 'n', 'b']);
  });

  it('counts the opponent’s hand up on a draw and down on a play', () => {
    const shown = { ...emptyView(), foe: { ...emptyView().foe, handCount: 3, deckCount: 10 } };
    const drew = applyCue(shown, { type: 'draw', owner: 'ai' }, shown);
    expect(drew.foe.handCount).toBe(4);
    expect(drew.foe.deckCount).toBe(9);

    const card = { cost: 2 } as Card;
    const played = applyCue({ ...drew, foe: { ...drew.foe, mana: 5 } }, { type: 'play', owner: 'ai', card, handIndex: 0 }, shown);
    expect(played.foe.handCount).toBe(3);
    expect(played.foe.mana).toBe(3);
  });

  it('pops Divine Shield without touching health', () => {
    const shown = withBoards([minion('a', { divineShield: true, keywords: ['DivineShield'] })], []);
    const next = applyCue(shown, { type: 'shield', instanceId: 'a' }, shown);
    expect(next.me.board[0]).toMatchObject({ divineShield: false, keywords: [], health: 3 });
  });
});

/**
 * The client-only presented view, walked through real matches.
 *
 * Folding a batch's cues over the view before it must land on the same boards
 * as the view after it. Stats are not compared — heals and keyword gains emit
 * no cue yet (REVISIONS.md R1.1), and the table snaps to the view at the end of
 * every drain for exactly that reason — but **which minions are on the board,
 * in what order**, is what a player sees first, and that must never drift.
 */
describe('applyCue over whole matches', () => {
  function playerTurn(state: MatchState) {
    const p = state.players.player;
    for (let i = p.hand.length - 1; i >= 0; i--) {
      const card = p.hand[i];
      if (card && !needsTarget(card)) playCard(state, 'player', i);
    }
    for (const m of [...p.board]) {
      if (state.winner || !canAttack(m)) continue;
      const target = legalTargets(state, 'ai')[0];
      if (!target) continue;
      attack(
        state,
        'player',
        m.instanceId,
        target.kind === 'hero' ? { kind: 'hero' } : { kind: 'minion', instanceId: target.minion.instanceId }
      );
    }
    if (!state.winner) endTurn(state);
  }

  function batch(state: MatchState, act: (s: MatchState) => void) {
    const before = viewFor(state, 'player');
    state.events = [];
    act(state);
    const cues: GameEvent[] = [...state.events];
    const after = viewFor(state, 'player');
    return { before, cues, after };
  }

  it('lands on the same boards as the engine, batch after batch', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const deck = buildAiDeck(seed);
      const state = createMatch(deck, buildAiDeck(seed + 1000), seed, { player: 'Designer', ai: 'Manufacturer' });

      for (let turn = 0; turn < 40 && !state.winner; turn++) {
        const step = batch(state, state.current === 'player' ? playerTurn : playAiTurn);
        const folded = step.cues.reduce((view, cue) => applyCue(view, cue, step.after), structuredClone(step.before));

        expect(ids(folded.me.board), `seed ${seed}, turn ${turn}`).toEqual(ids(step.after.me.board));
        expect(ids(folded.foe.board), `seed ${seed}, turn ${turn}`).toEqual(ids(step.after.foe.board));
        expect(folded.foe.handCount, `seed ${seed}, turn ${turn}`).toBe(step.after.foe.handCount);
        expect(folded.me.weapon?.name ?? null).toBe(step.after.me.weapon?.name ?? null);
      }
    }
  });
});
