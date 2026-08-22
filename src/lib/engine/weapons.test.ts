import { describe, expect, it } from 'vitest';
import { cardById } from '../data/cards';
import { buildDemoDeck } from '../data/demoDeck';
import {
  createMatch,
  endTurn,
  heroAttack,
  isLegalChosenTarget,
  needsTarget,
  playCard
} from './engine';
import { canHeroAttack, spellTargets, type MatchState } from './state';
import type { Card } from '../../types/cards';

function match(): MatchState {
  const state = createMatch(buildDemoDeck(), buildDemoDeck(), 42);
  state.players.player.mana = 10;
  state.players.player.maxMana = 10;
  return state;
}

/** Puts a card in hand and plays it, returning whether the play was accepted. */
function play(state: MatchState, card: Card, chosen?: Parameters<typeof playCard>[4]) {
  state.players.player.hand.push(card);
  return playCard(state, 'player', state.players.player.hand.length - 1, undefined, chosen);
}

function summonFor(state: MatchState, side: 'player' | 'ai') {
  const minion = buildDemoDeck().find((c) => c.type === 'Minion')!;
  state.players[side].hand.push(minion);
  const before = state.current;
  state.current = side;
  state.players[side].mana = 10;
  playCard(state, side, state.players[side].hand.length - 1);
  state.current = before;
  return state.players[side].board[state.players[side].board.length - 1];
}

const blade = () => ({ ...cardById('drafting-blade')! });
const fireball = () => ({ ...cardById('fireball')! });

describe('equipping a weapon', () => {
  it('arms the hero', () => {
    const state = match();
    expect(play(state, blade())).toBe(true);
    expect(state.players.player.weapon?.attack).toBe(2);
    expect(state.players.player.weapon?.durability).toBe(2);
  });

  it('replaces rather than stacks', () => {
    const state = match();
    play(state, blade());
    play(state, { ...cardById('bench-hammer')! });
    expect(state.players.player.weapon?.card.name).toBe('Bench Hammer');
    expect(state.players.player.weapon?.attack).toBe(3);
  });

  it('emits a cue, so it can be animated', () => {
    const state = match();
    state.events = [];
    play(state, blade());
    expect(state.events.some((e) => e.type === 'equip')).toBe(true);
  });
});

describe('the hero attacking', () => {
  it('cannot swing unarmed', () => {
    const state = match();
    expect(canHeroAttack(state.players.player)).toBe(false);
    expect(heroAttack(state, 'player', { kind: 'hero', owner: 'ai' })).toBe(false);
  });

  it('hits the enemy hero for the weapon’s attack', () => {
    const state = match();
    play(state, blade());
    const before = state.players.ai.health;
    expect(heroAttack(state, 'player', { kind: 'hero', owner: 'ai' })).toBe(true);
    expect(state.players.ai.health).toBe(before - 2);
  });

  it('only swings once per turn', () => {
    const state = match();
    play(state, blade());
    heroAttack(state, 'player', { kind: 'hero', owner: 'ai' });
    expect(canHeroAttack(state.players.player)).toBe(false);
    expect(heroAttack(state, 'player', { kind: 'hero', owner: 'ai' })).toBe(false);
  });

  it('can swing again next turn', () => {
    const state = match();
    play(state, blade());
    heroAttack(state, 'player', { kind: 'hero', owner: 'ai' });
    endTurn(state);
    endTurn(state);
    expect(canHeroAttack(state.players.player)).toBe(true);
  });

  // The trade is the point: swinging into a minion hurts.
  it('takes the defender’s attack back', () => {
    const state = match();
    play(state, blade());
    const defender = summonFor(state, 'ai');
    const heroBefore = state.players.player.health;

    heroAttack(state, 'player', { kind: 'minion', owner: 'ai', minion: defender });
    expect(state.players.player.health).toBe(heroBefore - defender.card.attack!);
  });

  it('spends durability and breaks at zero', () => {
    const state = match();
    play(state, blade());
    heroAttack(state, 'player', { kind: 'hero', owner: 'ai' });
    expect(state.players.player.weapon?.durability).toBe(1);

    endTurn(state);
    endTurn(state);
    heroAttack(state, 'player', { kind: 'hero', owner: 'ai' });
    expect(state.players.player.weapon).toBeNull();
    expect(state.events.some((e) => e.type === 'weaponBreak')).toBe(true);
  });

  it('is blocked by Taunt, exactly like a minion attack', () => {
    const state = match();
    play(state, blade());
    const taunt = summonFor(state, 'ai');
    taunt.keywords = ['Taunt'];
    expect(heroAttack(state, 'player', { kind: 'hero', owner: 'ai' })).toBe(false);
    expect(heroAttack(state, 'player', { kind: 'minion', owner: 'ai', minion: taunt })).toBe(true);
  });

  it('cannot swing on the opponent’s turn', () => {
    const state = match();
    play(state, blade());
    endTurn(state);
    expect(heroAttack(state, 'player', { kind: 'hero', owner: 'ai' })).toBe(false);
  });
});

describe('spells you aim', () => {
  it('knows which cards need a target', () => {
    expect(needsTarget(fireball())).toBe(true);
    expect(needsTarget(cardById('second-draft')!)).toBe(false);
    expect(needsTarget(blade())).toBe(false);
  });

  // Refused, not fizzled: a misclick must never burn the card and the mana.
  it('refuses to play without a target, keeping the card and the mana', () => {
    const state = match();
    const mana = state.players.player.mana;
    const hand = state.players.player.hand.length;

    state.players.player.hand.push(fireball());
    expect(playCard(state, 'player', state.players.player.hand.length - 1)).toBe(false);
    expect(state.players.player.mana).toBe(mana);
    expect(state.players.player.hand.length).toBe(hand + 1);
  });

  it('resolves against the chosen target', () => {
    const state = match();
    const before = state.players.ai.health;
    expect(play(state, fireball(), { kind: 'hero', owner: 'ai' })).toBe(true);
    expect(state.players.ai.health).toBe(before - 6);
  });

  it('can aim at a minion', () => {
    const state = match();
    const target = summonFor(state, 'ai');
    play(state, fireball(), { kind: 'minion', owner: 'ai', minion: target });
    expect(state.players.ai.board).not.toContain(target);
  });

  it('refuses a target on the wrong side', () => {
    const state = match();
    const mine = summonFor(state, 'player');
    // Dismantle is enemy-only.
    const card = { ...cardById('dismantle')! };
    expect(play(state, card, { kind: 'minion', owner: 'player', minion: mine })).toBe(false);
    expect(state.players.player.board).toContain(mine);
  });

  it('refuses a Stealth minion as a target', () => {
    const state = match();
    const hidden = summonFor(state, 'ai');
    hidden.keywords = ['Stealth'];
    expect(isLegalChosenTarget(state, 'player', fireball(), { kind: 'minion', owner: 'ai', minion: hidden })).toBe(false);
  });
});

describe('spellTargets', () => {
  // The interesting rule: a Taunt wall stops attacks but not a fireball.
  it('is not restricted by Taunt', () => {
    const state = match();
    const taunt = summonFor(state, 'ai');
    taunt.keywords = ['Taunt'];
    const targets = spellTargets(state, 'player');
    expect(targets.some((t) => t.kind === 'hero' && t.owner === 'ai')).toBe(true);
  });

  it('still hides Stealth', () => {
    const state = match();
    const hidden = summonFor(state, 'ai');
    hidden.keywords = ['Stealth'];
    const targets = spellTargets(state, 'player');
    expect(targets.some((t) => t.kind === 'minion' && t.minion === hidden)).toBe(false);
  });

  it('narrows to one side when the card says so', () => {
    const state = match();
    summonFor(state, 'ai');
    summonFor(state, 'player');
    const enemy = spellTargets(state, 'player', 'enemy');
    const friendly = spellTargets(state, 'player', 'friendly');
    expect(enemy.every((t) => (t.kind === 'hero' ? t.owner : t.owner) === 'ai')).toBe(true);
    expect(friendly.every((t) => (t.kind === 'hero' ? t.owner : t.owner) === 'player')).toBe(true);
  });
});

describe('SwapStats', () => {
  it('swaps a minion’s attack and health', () => {
    const state = match();
    const target = summonFor(state, 'ai');
    const [attack, health] = [target.attack, target.health];
    expect(attack).not.toBe(health);

    play(state, { ...cardById('inversion')! }, { kind: 'minion', owner: 'ai', minion: target });
    expect(target.attack).toBe(health);
    expect(target.health).toBe(attack);
    // maxHealth follows, or the minion reads as damaged the instant it swaps.
    expect(target.health).toBe(target.maxHealth);
  });
});
