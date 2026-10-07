import { describe, expect, it } from 'vitest';
import { PLAYABLE_CLASSES, type Card } from '../../types/cards';
import { ALL_CARDS } from '../data/cards';
import { HERO_POWERS } from '../data/classes';
import { playAiTurn } from '../engine/ai';
import {
  attack,
  canPlayCard,
  COIN_CARD,
  createMatch,
  endTurn,
  heroAttack,
  needsTarget,
  playCard,
  useHeroPower
} from '../engine/engine';
import type { GameEvent } from '../engine/events';
import { createRng, pick, type Rng } from '../engine/rng';
import {
  canAttack,
  canHeroAttack,
  canUseHeroPower,
  legalTargets,
  spellTargets,
  type MatchState
} from '../engine/state';
import { viewFor } from '../net/room';
import type { PlayerView, SerialisedMinion } from '../net/protocol';
import { emptyView } from '../net/view';
import { applyCue, presentedDiff } from './apply';

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

    const hit = applyCue(shown, { type: 'damage', target: { kind: 'minion', instanceId: 'a' }, amount: 3, health: 0 });
    expect(ids(hit.me.board)).toEqual(['a', 'b']);
    expect(hit.me.board[0].health).toBe(0);

    const dead = applyCue(hit, { type: 'death', owner: 'player', instanceId: 'a' });
    expect(ids(dead.me.board)).toEqual(['b']);
  });

  it('takes a hero’s health and armor from the cue', () => {
    const shown = { ...emptyView(), foe: { ...emptyView().foe, health: 20, armor: 2 } };
    const next = applyCue(shown, { type: 'damage', target: { kind: 'hero', owner: 'ai' }, amount: 5, health: 17, armor: 0 });
    expect(next.foe.armor).toBe(0);
    expect(next.foe.health).toBe(17);
  });

  it('lands a summon beside its neighbour even while a dead minion is still shown', () => {
    // 'x' is waiting to shatter; the engine has already dropped it, so its
    // index for 'n' would be one short. The neighbour is what places it.
    const shown = withBoards([minion('x'), minion('a'), minion('b')], []);
    const next = applyCue(shown, { type: 'summon', owner: 'player', instanceId: 'n', minion: minion('n'), after: 'a' });
    expect(ids(next.me.board)).toEqual(['x', 'a', 'n', 'b']);

    const first = applyCue(shown, { type: 'summon', owner: 'player', instanceId: 'f', minion: minion('f'), after: null });
    expect(ids(first.me.board)).toEqual(['f', 'x', 'a', 'b']);
  });

  it('counts the opponent’s hand up on a draw and down on a play', () => {
    const shown = { ...emptyView(), foe: { ...emptyView().foe, handCount: 3, deckCount: 10 } };
    const drew = applyCue(shown, { type: 'draw', owner: 'ai', deckCount: 9 });
    expect(drew.foe.handCount).toBe(4);
    expect(drew.foe.deckCount).toBe(9);

    const played = applyCue(drew, { type: 'play', owner: 'ai', card: { cost: 2 } as Card, handIndex: 0, mana: 3 });
    expect(played.foe.handCount).toBe(3);
    expect(played.foe.mana).toBe(3);
  });

  it('pops Divine Shield without touching health', () => {
    const shown = withBoards([minion('a', { divineShield: true, keywords: ['DivineShield'] })], []);
    const next = applyCue(shown, { type: 'shield', instanceId: 'a' });
    expect(next.me.board[0]).toMatchObject({ divineShield: false, keywords: [], health: 3 });
  });
});

/**
 * The replay invariant (REVISIONS.md R1.2).
 *
 * Whole matches, played by both sides, with decks drawn at random from the
 * entire card pool so every mechanic turns up — aimed spells, hero powers,
 * weapons, silences, freezes, swaps, deathrattles. After **every intent**, the
 * cues it emitted are folded over the view from before it, and the result must
 * equal the engine's view in everything playback presents.
 *
 * This is the guard on the whole presentation layer: an engine change that
 * mutates the board without emitting what it did fails here, and the message
 * names the field, the seed and the step.
 */
describe('replaying matches through applyCue', () => {
  /** Short decks for some matches, so fatigue is certain rather than left to the draw effects in play. */
  function randomDeck(rng: Rng, size = 30): Card[] {
    return Array.from({ length: size }, () => pick(rng, ALL_CARDS)!);
  }

  /** One intent per call; returns false when the player has nothing left to do. */
  function playerStep(state: MatchState, rng: Rng): boolean {
    const p = state.players.player;

    if (canUseHeroPower(state, 'player') && rng.next() < 0.5) {
      const power = HERO_POWERS[p.heroClass];
      const target = power?.needsTarget ? pick(rng, spellTargets(state, 'player', 'any')) : undefined;
      if (useHeroPower(state, 'player', target)) return true;
    }

    for (let i = 0; i < p.hand.length; i++) {
      const card = p.hand[i];
      if (!canPlayCard(state, 'player', i)) continue;
      const target = needsTarget(card) ? pick(rng, spellTargets(state, 'player', card.targeting ?? 'any')) : undefined;
      const slot = Math.floor(rng.next() * (p.board.length + 1));
      if (playCard(state, 'player', i, slot, target)) return true;
    }

    if (canHeroAttack(p)) {
      const target = pick(rng, legalTargets(state, 'ai'));
      if (target && heroAttack(state, 'player', target)) return true;
    }

    for (const m of p.board) {
      if (!canAttack(m)) continue;
      const target = pick(rng, legalTargets(state, 'ai'));
      if (!target) continue;
      const ref = target.kind === 'hero' ? ({ kind: 'hero' } as const) : { kind: 'minion' as const, instanceId: target.minion.instanceId };
      if (attack(state, 'player', m.instanceId, ref)) return true;
    }
    return false;
  }

  /**
   * Every cue type, as a record so the compiler insists on it: a new cue
   * cannot be added without this test also requiring the matches to produce it.
   */
  const EVERY_CUE: Record<GameEvent['type'], true> = {
    draw: true, play: true, summon: true, attack: true, damage: true, heal: true, shield: true,
    death: true, freeze: true, silence: true, buff: true, keyword: true, turn: true, mana: true,
    equip: true, heroAttack: true, weaponBreak: true, armor: true, heroPower: true, trigger: true,
    effect: true, burn: true, fatigue: true, bounce: true, transform: true, doom: true
  };
  const seen = new Set<string>();

  function check(state: MatchState, act: () => void, where: string) {
    const before = viewFor(state, 'player');
    state.events = [];
    act();
    const cues: GameEvent[] = [...state.events];
    for (const cue of cues) seen.add(cue.type);
    const folded = cues.reduce(applyCue, before);
    expect(presentedDiff(folded, viewFor(state, 'player')), where).toEqual([]);
  }

  it('lands exactly where the engine does, after every intent of 200 matches', () => {
    let intents = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const rng = createRng(seed * 7919);
      // The Coin is the only source of mid-turn mana. The AI always spends
      // what it unlocks, which would hide a missing cue; the test player plays
      // it whenever it is drawn, so its result is what the step is checked on.
      const size = seed % 10 === 0 ? 12 : 30;
      const state = createMatch([...randomDeck(rng, size), COIN_CARD], randomDeck(rng, size), seed, {
        player: PLAYABLE_CLASSES[seed % 4],
        ai: PLAYABLE_CLASSES[(seed + 1) % 4]
      });
      state.events = [];

      for (let turn = 0; turn < 60 && !state.winner; turn++) {
        if (state.current === 'ai') {
          check(state, () => playAiTurn(state), `seed ${seed}, turn ${turn} (ai)`);
          intents++;
          continue;
        }
        for (let step = 0; step < 20 && !state.winner; step++) {
          let acted = false;
          check(state, () => (acted = playerStep(state, rng)), `seed ${seed}, turn ${turn}, step ${step}`);
          intents++;
          if (!acted) break;
        }
        if (!state.winner) check(state, () => endTurn(state), `seed ${seed}, turn ${turn} (end)`);
      }
    }
    // A guard on the guard: the matches must actually have been played, and
    // must have exercised every kind of cue — or a missing emit could hide in
    // a mechanic that simply never came up.
    expect(intents).toBeGreaterThan(5000);
    expect([...seen].sort()).toEqual(Object.keys(EVERY_CUE).sort());
  });
});
