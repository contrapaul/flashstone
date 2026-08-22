import { describe, expect, it } from 'vitest';
import { buildDemoDeck } from '../data/demoDeck';
import { DESIGN_IDEAS } from '../data/tokens';
import { createMatch, endTurn, useHeroPower } from './engine';
import { HERO_POWER_COST, canUseHeroPower, spellPowerOf, type MatchState } from './state';
import type { CardClass } from '../../types/cards';

function match(heroClass: CardClass, mana = 10): MatchState {
  const state = createMatch(buildDemoDeck(), buildDemoDeck(), 7, { player: heroClass });
  state.players.player.mana = mana;
  state.players.player.maxMana = 10;
  return state;
}

const enemyHero = { kind: 'hero', owner: 'ai' } as const;

describe('using a hero power at all', () => {
  it('costs 2 mana', () => {
    const state = match('Engineer');
    useHeroPower(state, 'player');
    expect(state.players.player.mana).toBe(10 - HERO_POWER_COST);
  });

  it('is refused under 2 mana, and spends nothing', () => {
    const state = match('Engineer', 1);
    expect(useHeroPower(state, 'player')).toBe(false);
    expect(state.players.player.mana).toBe(1);
    expect(state.players.player.armor).toBe(0);
  });

  it('is refused twice in one turn', () => {
    const state = match('Engineer');
    expect(useHeroPower(state, 'player')).toBe(true);
    expect(canUseHeroPower(state, 'player')).toBe(false);
    expect(useHeroPower(state, 'player')).toBe(false);
    expect(state.players.player.armor).toBe(2);
  });

  it('is available again next turn', () => {
    const state = match('Engineer');
    useHeroPower(state, 'player');
    endTurn(state);
    endTurn(state);
    state.players.player.mana = 10;
    expect(canUseHeroPower(state, 'player')).toBe(true);
  });

  it('is refused on the other player’s turn', () => {
    const state = match('Engineer');
    endTurn(state);
    expect(useHeroPower(state, 'player')).toBe(false);
  });

  it('does nothing for a Neutral hero', () => {
    const state = match('Neutral');
    expect(useHeroPower(state, 'player')).toBe(false);
  });

  it('emits a cue, so it can be animated', () => {
    const state = match('Engineer');
    state.events = [];
    useHeroPower(state, 'player');
    expect(state.events.some((e) => e.type === 'heroPower')).toBe(true);
  });
});

describe('Engineer — Make it Stronger', () => {
  it('grants 2 armor', () => {
    const state = match('Engineer');
    useHeroPower(state, 'player');
    expect(state.players.player.armor).toBe(2);
  });

  // Armor had no source at all before this, so the absorb path in damageHero
  // had never actually been exercised by anything.
  it('is spent before health, and health only takes the overflow', () => {
    // Consumer, so the hero can be damaged on demand: Pay on Credit deals 2 to
    // its own hero, which is exactly the shape needed to watch armor absorb.
    const state = match('Consumer');
    state.players.player.armor = 3;
    const health = state.players.player.health;

    useHeroPower(state, 'player');

    expect(state.players.player.armor).toBe(1);
    expect(state.players.player.health).toBe(health);
  });

  it('never goes negative, and the rest lands on health', () => {
    const state = match('Consumer');
    state.players.player.armor = 1;
    const health = state.players.player.health;

    useHeroPower(state, 'player');

    expect(state.players.player.armor).toBe(0);
    expect(state.players.player.health).toBe(health - 1);
  });
});

describe('Consumer — Pay on Credit', () => {
  it('draws a card and damages its own hero, never the opponent', () => {
    const state = match('Consumer');
    const hand = state.players.player.hand.length;
    const mine = state.players.player.health;
    const theirs = state.players.ai.health;

    useHeroPower(state, 'player');

    expect(state.players.player.hand.length).toBe(hand + 1);
    expect(state.players.player.health).toBe(mine - 2);
    expect(state.players.ai.health).toBe(theirs);
  });

  it('can kill you, and the match ends correctly', () => {
    const state = match('Consumer');
    state.players.player.health = 2;
    useHeroPower(state, 'player');
    expect(state.players.player.health).toBeLessThanOrEqual(0);
    expect(state.winner).toBe('ai');
  });
});

describe('Manufacturer — Robotic Arm', () => {
  it('is refused without a target, and spends nothing', () => {
    const state = match('Manufacturer');
    expect(useHeroPower(state, 'player')).toBe(false);
    expect(state.players.player.mana).toBe(10);
    expect(state.players.player.heroPowerUsedThisTurn).toBe(false);
  });

  it('deals 1 damage to the chosen target', () => {
    const state = match('Manufacturer');
    const before = state.players.ai.health;
    expect(useHeroPower(state, 'player', enemyHero)).toBe(true);
    expect(state.players.ai.health).toBe(before - 1);
  });
});

describe('Designer — Summon a Design Idea', () => {
  it('summons an idea', () => {
    const state = match('Designer');
    expect(useHeroPower(state, 'player')).toBe(true);
    expect(state.players.player.board).toHaveLength(1);
    expect(DESIGN_IDEAS.map((i) => i.id)).toContain(state.players.player.board[0].card.id);
  });

  it('never repeats one already on the board', () => {
    const state = match('Designer');
    const seen = new Set<string>();
    for (let turn = 0; turn < 4; turn++) {
      state.players.player.mana = 10;
      state.players.player.heroPowerUsedThisTurn = false;
      expect(useHeroPower(state, 'player'), `use ${turn + 1}`).toBe(true);
      const ids = state.players.player.board.map((m) => m.card.id);
      expect(new Set(ids).size, 'duplicate idea summoned').toBe(ids.length);
      ids.forEach((id) => seen.add(id));
    }
    expect(seen.size).toBe(4);
  });

  it('is refused once all four are out, and spends nothing', () => {
    const state = match('Designer');
    for (let turn = 0; turn < 4; turn++) {
      state.players.player.mana = 10;
      state.players.player.heroPowerUsedThisTurn = false;
      useHeroPower(state, 'player');
    }
    state.players.player.mana = 10;
    state.players.player.heroPowerUsedThisTurn = false;

    expect(useHeroPower(state, 'player')).toBe(false);
    expect(state.players.player.mana).toBe(10);
    expect(state.players.player.board).toHaveLength(4);
  });

  it('gives Reinforced Frame Taunt and Rechargeable Battery its heal', () => {
    const frame = DESIGN_IDEAS.find((i) => i.name === 'Reinforced Frame')!;
    const battery = DESIGN_IDEAS.find((i) => i.name === 'Rechargeable Battery')!;
    expect(frame.keywords).toContain('Taunt');
    expect([frame.attack, frame.health]).toEqual([0, 2]);
    expect(battery.effects[0]).toMatchObject({ trigger: 'EndOfTurn', action: 'Heal', target: 'AllFriendly' });
  });
});

describe('Spell Damage', () => {
  const cpu = DESIGN_IDEAS.find((i) => i.name === 'Overclocked CPU')!;

  function withCpu(heroClass: CardClass, count = 1) {
    const state = match(heroClass);
    for (let i = 0; i < count; i++) {
      state.players.player.board.push({
        instanceId: `cpu${i}`,
        card: cpu,
        attack: 0,
        health: 2,
        maxHealth: 2,
        keywords: [],
        divineShield: false,
        summonedThisTurn: false,
        attacksThisTurn: 0,
        frozen: false,
        silenced: false,
        buffed: false
      });
    }
    return state;
  }

  it('sums across the board', () => {
    expect(spellPowerOf(withCpu('Manufacturer', 2).players.player)).toBe(2);
  });

  it('is stripped by silence', () => {
    const state = withCpu('Manufacturer');
    state.players.player.board[0].silenced = true;
    expect(spellPowerOf(state.players.player)).toBe(0);
  });

  it('boosts a hero power', () => {
    const state = withCpu('Manufacturer');
    const before = state.players.ai.health;
    useHeroPower(state, 'player', enemyHero);
    // 1 base + 1 spell damage.
    expect(state.players.ai.health).toBe(before - 2);
  });

  it('boosts by 2 with two on the board', () => {
    const state = withCpu('Manufacturer', 2);
    const before = state.players.ai.health;
    useHeroPower(state, 'player', enemyHero);
    expect(state.players.ai.health).toBe(before - 3);
  });
});
