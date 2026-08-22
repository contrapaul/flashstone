import { describe, expect, it } from 'vitest';
import { buildDemoDeck } from '../data/demoDeck';
import { createMatch, endTurn } from './engine';
import { playAiTurn } from './ai';
import type { CardClass } from '../../types/cards';
import type { MatchState } from './state';

function aiMatch(heroClass: CardClass): MatchState {
  const state = createMatch(buildDemoDeck(), buildDemoDeck(), 3, { ai: heroClass });
  endTurn(state); // hand the turn to the AI
  return state;
}

/** Runs `turns` AI turns, handing the turn back each time. */
function runTurns(state: MatchState, turns: number) {
  for (let i = 0; i < turns && !state.winner; i++) {
    state.players.ai.mana = 10;
    state.players.ai.maxMana = 10;
    playAiTurn(state);
    if (!state.winner) endTurn(state);
  }
}

describe('the AI and its hero power', () => {
  it('uses Make it Stronger and accumulates armor', () => {
    const state = aiMatch('Engineer');
    runTurns(state, 3);
    expect(state.players.ai.armor).toBeGreaterThan(0);
  });

  it('uses Summon a Design Idea, and never duplicates one', () => {
    const state = aiMatch('Designer');
    runTurns(state, 4);
    const ideas = state.players.ai.board.filter((m) => m.card.id.startsWith('token-'));
    expect(ideas.length).toBeGreaterThan(0);
    expect(new Set(ideas.map((m) => m.card.id)).size).toBe(ideas.length);
  });

  it('aims Robotic Arm and damages the player', () => {
    const state = aiMatch('Manufacturer');
    const before = state.players.player.health;
    runTurns(state, 2);
    expect(state.players.player.health).toBeLessThan(before);
  });

  // The one that matters: an AI that taps greedily kills itself.
  it('never taps itself to death with Pay on Credit', () => {
    const state = aiMatch('Consumer');
    runTurns(state, 40);
    // It may still lose to the board, but never to its own hero power.
    if (state.winner === 'player') {
      expect(state.players.ai.health, 'AI died — check it was not self-inflicted').toBeLessThanOrEqual(0);
    }
    expect(state.players.ai.health).toBeGreaterThan(0);
  });

  it('holds the power when it cannot afford it', () => {
    const state = aiMatch('Engineer');
    state.players.ai.mana = 1;
    state.players.ai.maxMana = 1;
    playAiTurn(state);
    expect(state.players.ai.armor).toBe(0);
  });
});
