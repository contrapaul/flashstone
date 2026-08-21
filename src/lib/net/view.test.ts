import { describe, expect, it } from 'vitest';
import { resolveDeck } from '../decks/deck';
import { starterDeck } from '../data/starter';
import { buildAiDeck } from '../data/aiDeck';
import { applyMessage, createRoomState, viewFor } from './room';
import {
  canAttackFromView,
  canPlayFromView,
  emptyView,
  isMyTurn,
  legalTargetsFromView,
  turnIsSpent
} from './view';
import type { SerialisedMinion } from './protocol';

function view(side: 'player' | 'ai' = 'player') {
  const state = createRoomState(resolveDeck(starterDeck()), buildAiDeck(1), 999);
  return { state, v: viewFor(state, side) };
}

function minion(over: Partial<SerialisedMinion> = {}): SerialisedMinion {
  return {
    instanceId: 'm1',
    card: { id: 'x', name: 'X', cost: 1, type: 'Minion', rarity: 'Common', keywords: [], effects: [], description: '' },
    attack: 2,
    health: 2,
    maxHealth: 2,
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

describe('whose turn it is', () => {
  it('is mine when the turn matches my side', () => {
    const { v } = view('player');
    expect(isMyTurn(v)).toBe(true);
  });

  it('is not mine from the other seat', () => {
    const { v } = view('ai');
    expect(isMyTurn(v)).toBe(false);
  });

  it('is nobody’s once there is a winner', () => {
    const { state } = view();
    applyMessage(state, 'player', { type: 'concede' });
    expect(isMyTurn(viewFor(state, 'ai'))).toBe(false);
  });
});

describe('what can be played', () => {
  it('refuses a card that costs more than the mana available', () => {
    const { v } = view();
    const expensive = v.me.hand.findIndex((c) => c.cost > v.me.mana);
    if (expensive >= 0) expect(canPlayFromView(v, expensive)).toBe(false);
  });

  it('refuses an index that is not in hand', () => {
    const { v } = view();
    expect(canPlayFromView(v, 99)).toBe(false);
  });

  it('refuses a minion when the board is full', () => {
    const { v } = view();
    const full = { ...v, me: { ...v.me, mana: 10, board: Array(7).fill(minion()) } };
    const minionIndex = full.me.hand.findIndex((c) => c.type === 'Minion');
    if (minionIndex >= 0) expect(canPlayFromView(full, minionIndex)).toBe(false);
  });

  it('allows a spell when the board is full', () => {
    const { v } = view();
    const full = { ...v, me: { ...v.me, mana: 10, board: Array(7).fill(minion()) } };
    const spellIndex = full.me.hand.findIndex((c) => c.type === 'Spell');
    if (spellIndex >= 0) expect(canPlayFromView(full, spellIndex)).toBe(true);
  });
});

describe('what can attack', () => {
  it('refuses a minion with summoning sickness', () => {
    expect(canAttackFromView(minion({ summonedThisTurn: true }))).toBe(false);
  });

  it('allows one with Charge', () => {
    expect(canAttackFromView(minion({ summonedThisTurn: true, keywords: ['Charge'] }))).toBe(true);
  });

  it('refuses a frozen minion', () => {
    expect(canAttackFromView(minion({ frozen: true }))).toBe(false);
  });

  it('refuses one that has already swung', () => {
    expect(canAttackFromView(minion({ attacksThisTurn: 1 }))).toBe(false);
  });

  it('allows a Windfury minion a second swing', () => {
    expect(canAttackFromView(minion({ attacksThisTurn: 1, keywords: ['Windfury'] }))).toBe(true);
  });

  it('refuses a minion with no attack', () => {
    expect(canAttackFromView(minion({ attack: 0 }))).toBe(false);
  });
});

describe('legal targets', () => {
  it('offers the hero when the board is empty', () => {
    const { v } = view();
    expect(legalTargetsFromView(v)).toEqual([{ kind: 'hero' }]);
  });

  it('forces Taunt', () => {
    const { v } = view();
    const withTaunt = {
      ...v,
      foe: {
        ...v.foe,
        board: [minion({ instanceId: 'a' }), minion({ instanceId: 'b', keywords: ['Taunt'] })]
      }
    };
    expect(legalTargetsFromView(withTaunt)).toEqual([{ kind: 'minion', instanceId: 'b' }]);
  });

  it('hides Stealth, even when it has Taunt', () => {
    const { v } = view();
    const stealthed = {
      ...v,
      foe: { ...v.foe, board: [minion({ instanceId: 's', keywords: ['Taunt', 'Stealth'] })] }
    };
    expect(legalTargetsFromView(stealthed)).toEqual([{ kind: 'hero' }]);
  });
});

describe('a spent turn', () => {
  it('is spent with no mana and nothing that can swing', () => {
    const { v } = view();
    expect(turnIsSpent({ ...v, me: { ...v.me, mana: 0, board: [] } })).toBe(true);
  });

  it('is not spent while something can attack', () => {
    const { v } = view();
    expect(turnIsSpent({ ...v, me: { ...v.me, mana: 0, board: [minion()] } })).toBe(false);
  });
});

describe('the empty view', () => {
  it('is safe to render before a match starts', () => {
    const v = emptyView();
    expect(v.me.hand).toEqual([]);
    expect(v.foe.handCount).toBe(0);
    expect(isMyTurn(v)).toBe(true);
    expect(turnIsSpent(v)).toBe(true);
  });
});
