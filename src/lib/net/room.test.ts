import { describe, expect, it } from 'vitest';
import { resolveDeck } from '../decks/deck';
import { starterDeck } from '../data/starter';
import { buildAiDeck } from '../data/aiDeck';
import { applyMessage, createRoomState, forceEndTurn, viewFor } from './room';
import { parseClientMessage } from './protocol';
import { cardById } from '../data/cards';
import type { MatchState } from '../engine/state';

function room(): MatchState {
  return createRoomState(resolveDeck(starterDeck()), buildAiDeck(1), 12345);
}

/** Walks turns until it is `who`'s turn with at least `mana` available. */
function advanceTo(state: MatchState, who: 'player' | 'ai', mana: number) {
  for (let i = 0; i < 40; i++) {
    if (state.current === who && state.players[who].mana >= mana) return;
    applyMessage(state, state.current, { type: 'endTurn' });
  }
  throw new Error('never reached that turn');
}

describe('turn order', () => {
  it('refuses a move from the player whose turn it is not', () => {
    const state = room();
    expect(state.current).toBe('player');

    const result = applyMessage(state, 'ai', { type: 'playCard', handIndex: 0 });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/not your turn/i);
  });

  it('refuses an end-turn from the wrong player', () => {
    const state = room();
    expect(applyMessage(state, 'ai', { type: 'endTurn' }).ok).toBe(false);
    expect(state.current).toBe('player');
  });

  it('hands the turn over on endTurn', () => {
    const state = room();
    expect(applyMessage(state, 'player', { type: 'endTurn' }).ok).toBe(true);
    expect(state.current).toBe('ai');
  });
});

describe('playing a card', () => {
  it('refuses a hand index that does not exist', () => {
    const state = room();
    const result = applyMessage(state, 'player', { type: 'playCard', handIndex: 9 });
    expect(result.ok).toBe(false);
  });

  it('refuses a card the player cannot afford', () => {
    const state = room();
    // Turn 1 is one mana; the starter deck's cheapest cards cost one, so drain it.
    state.players.player.mana = 0;
    const result = applyMessage(state, 'player', { type: 'playCard', handIndex: 0 });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/cannot play/i);
  });

  it('plays a legal card and emits cues to animate', () => {
    const state = room();
    advanceTo(state, 'player', 4);
    const index = state.players.player.hand.findIndex(
      (c) => c.cost <= state.players.player.mana && c.type === 'Minion'
    );
    expect(index, 'no affordable minion in hand').toBeGreaterThanOrEqual(0);

    const before = state.players.player.board.length;
    const result = applyMessage(state, 'player', { type: 'playCard', handIndex: index });

    expect(result.ok).toBe(true);
    expect(state.players.player.board.length).toBe(before + 1);
    expect(result.events.length).toBeGreaterThan(0);
  });

  it('drains its cues, so the next move does not replay them', () => {
    const state = room();
    advanceTo(state, 'player', 4);
    const index = state.players.player.hand.findIndex((c) => c.cost <= state.players.player.mana);
    applyMessage(state, 'player', { type: 'playCard', handIndex: index });
    expect(state.events).toEqual([]);
  });
});

describe('attacking', () => {
  it("refuses an attack with a minion that is not yours", () => {
    const state = room();
    advanceTo(state, 'ai', 4);
    const index = state.players.ai.hand.findIndex((c) => c.cost <= state.players.ai.mana && c.type === 'Minion');
    applyMessage(state, 'ai', { type: 'playCard', handIndex: index });
    const foeMinion = state.players.ai.board[0];
    expect(foeMinion).toBeDefined();

    applyMessage(state, 'ai', { type: 'endTurn' });

    // The player tries to swing the opponent's minion.
    const result = applyMessage(state, 'player', {
      type: 'attack',
      instanceId: foeMinion.instanceId,
      target: { kind: 'hero' }
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/not yours/i);
  });

  it('refuses an attack on a minion that does not exist', () => {
    const state = room();
    const result = applyMessage(state, 'player', {
      type: 'attack',
      instanceId: 'm999',
      target: { kind: 'minion', instanceId: 'm998' }
    });
    expect(result.ok).toBe(false);
  });
});

describe('weapons and aimed spells over the wire', () => {
  const equip = (state: MatchState) => {
    state.players.player.hand.push({ ...cardById('drafting-blade')! });
    state.players.player.mana = 10;
    applyMessage(state, 'player', {
      type: 'playCard',
      handIndex: state.players.player.hand.length - 1
    });
  };

  it('lets an armed hero swing', () => {
    const state = room();
    equip(state);
    const before = state.players.ai.health;
    const result = applyMessage(state, 'player', { type: 'heroAttack', target: { kind: 'hero' } });
    expect(result.ok).toBe(true);
    expect(state.players.ai.health).toBe(before - 2);
  });

  it('refuses a hero swing with no weapon', () => {
    const state = room();
    const result = applyMessage(state, 'player', { type: 'heroAttack', target: { kind: 'hero' } });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/cannot attack/i);
  });

  it('refuses a hero swing on the other player’s turn', () => {
    const state = room();
    equip(state);
    applyMessage(state, 'player', { type: 'endTurn' });
    const result = applyMessage(state, 'player', { type: 'heroAttack', target: { kind: 'hero' } });
    expect(result.ok).toBe(false);
  });

  // The client's idea of a legal target is never trusted.
  it('refuses an aimed spell with no target', () => {
    const state = room();
    state.players.player.mana = 10;
    state.players.player.hand.push({ ...cardById('fireball')! });
    const result = applyMessage(state, 'player', {
      type: 'playCard',
      handIndex: state.players.player.hand.length - 1
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/legal target/i);
  });

  it('refuses an aimed spell pointed at a minion that does not exist', () => {
    const state = room();
    state.players.player.mana = 10;
    state.players.player.hand.push({ ...cardById('fireball')! });
    const result = applyMessage(state, 'player', {
      type: 'playCard',
      handIndex: state.players.player.hand.length - 1,
      target: { kind: 'minion', instanceId: 'm999' }
    });
    expect(result.ok).toBe(false);
  });

  it('resolves an aimed spell against the chosen hero', () => {
    const state = room();
    state.players.player.mana = 10;
    state.players.player.hand.push({ ...cardById('fireball')! });
    const before = state.players.ai.health;
    const result = applyMessage(state, 'player', {
      type: 'playCard',
      handIndex: state.players.player.hand.length - 1,
      target: { kind: 'hero', side: 'foe' }
    });
    expect(result.ok).toBe(true);
    expect(state.players.ai.health).toBe(before - 6);
  });

  it('reports the weapon in both views, and only arms its owner', () => {
    const state = room();
    equip(state);
    const mine = viewFor(state, 'player');
    const theirs = viewFor(state, 'ai');

    expect(mine.me.weapon?.attack).toBe(2);
    expect(mine.me.canHeroAttack).toBe(true);
    expect(theirs.foe.weapon?.attack).toBe(2);
    expect(theirs.me.canHeroAttack).toBe(false);
  });
});

describe('conceding', () => {
  it('hands the win to the other player', () => {
    const state = room();
    expect(applyMessage(state, 'player', { type: 'concede' }).ok).toBe(true);
    expect(state.winner).toBe('ai');
  });

  // Conceding on the opponent's turn is the case that matters: a player waiting
  // out a turn timer must be able to leave.
  it('works on the other player’s turn', () => {
    const state = room();
    expect(state.current).toBe('player');
    const result = applyMessage(state, 'ai', { type: 'concede' });
    expect(result.ok).toBe(true);
    expect(state.winner).toBe('player');
  });

  it('refuses every move once the match is over', () => {
    const state = room();
    applyMessage(state, 'player', { type: 'concede' });
    const result = applyMessage(state, 'ai', { type: 'endTurn' });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/over/i);
  });
});

describe('the turn timer', () => {
  it('ends the turn of whoever is on the clock', () => {
    const state = room();
    expect(state.current).toBe('player');
    forceEndTurn(state);
    expect(state.current).toBe('ai');
    expect(state.log.join(' ')).toMatch(/timed out/i);
  });

  it('does nothing once the match is over', () => {
    const state = room();
    applyMessage(state, 'player', { type: 'concede' });
    expect(forceEndTurn(state)).toEqual([]);
  });
});

describe('what a player is allowed to see', () => {
  it("never sends the opponent's hand", () => {
    const state = room();
    const view = viewFor(state, 'player');

    expect(view.foe).not.toHaveProperty('hand');
    expect(view.foe.handCount).toBe(state.players.ai.hand.length);
    // The one that matters: no card object from the opponent's hand anywhere.
    const serialised = JSON.stringify(view);
    for (const card of state.players.ai.hand) {
      expect(serialised, `leaked ${card.name}`).not.toContain(`"${card.id}"`);
    }
  });

  it("never sends either player's deck contents", () => {
    const state = room();
    const view = viewFor(state, 'player');
    expect(view.me).not.toHaveProperty('deck');
    expect(view.foe).not.toHaveProperty('deck');
    expect(view.me.deckCount).toBe(state.players.player.deck.length);
  });

  it('does send your own hand', () => {
    const state = room();
    const view = viewFor(state, 'player');
    expect(view.me.hand).toHaveLength(state.players.player.hand.length);
  });

  it('labels the viewer correctly from both sides', () => {
    const state = room();
    expect(viewFor(state, 'player').you).toBe('player');
    expect(viewFor(state, 'ai').you).toBe('ai');
  });
});

describe('parsing what arrives on the wire', () => {
  it('accepts a well-formed intent', () => {
    expect(parseClientMessage('{"type":"endTurn"}')).toEqual({ type: 'endTurn' });
  });

  it('rejects malformed JSON without throwing', () => {
    expect(parseClientMessage('not json')).toBeNull();
  });

  it('rejects an unknown message type', () => {
    expect(parseClientMessage('{"type":"giveMeGold"}')).toBeNull();
  });

  it('rejects an out-of-range hand index', () => {
    expect(parseClientMessage('{"type":"playCard","handIndex":999}')).toBeNull();
    expect(parseClientMessage('{"type":"playCard","handIndex":-1}')).toBeNull();
  });

  it('rejects a malformed target', () => {
    expect(
      parseClientMessage('{"type":"attack","instanceId":"m1","target":{"kind":"wat"}}')
    ).toBeNull();
  });

  it('rejects an absurdly long instance id', () => {
    const long = 'm'.repeat(500);
    expect(parseClientMessage(`{"type":"attack","instanceId":"${long}","target":{"kind":"hero"}}`)).toBeNull();
  });
});
