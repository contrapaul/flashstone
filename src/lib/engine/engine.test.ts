import { describe, expect, it } from 'vitest';
import type { Card } from '../../types/cards';
import { buildDemoDeck } from '../data/demoDeck';
import { CardSchema } from '../../validators/card.validator';
import { DEMO_CARDS } from '../data/demoDeck';
import {
  COIN_CARD,
  attack,
  canPlayCard,
  createMatch,
  drawCard,
  endTurn,
  playCard
} from './engine';
import {
  BOARD_LIMIT,
  HERO_HEALTH,
  canAttack,
  legalTargets,
  silence,
  type MatchState
} from './state';

function minionCard(over: Partial<Card> = {}): Card {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Test Minion',
    cost: 1,
    type: 'Minion',
    rarity: 'Common',
    attack: 2,
    health: 2,
    keywords: [],
    effects: [],
    description: 'test',
    ...over
  };
}

/** An empty match with full mana and no opening hands, for isolated assertions. */
function bareMatch(): MatchState {
  const state = createMatch([], [], 1);
  state.players.player.hand = [];
  state.players.ai.hand = [];
  state.players.player.health = HERO_HEALTH;
  state.players.ai.health = HERO_HEALTH;
  state.players.player.fatigue = 0;
  state.players.ai.fatigue = 0;
  state.players.player.mana = 10;
  state.players.player.maxMana = 10;
  return state;
}

function give(state: MatchState, owner: 'player' | 'ai', card: Card) {
  state.players[owner].hand.push(card);
  return state.players[owner].hand.length - 1;
}

describe('card data', () => {
  it('validates every demo card and The Coin against the schema', () => {
    for (const card of [...DEMO_CARDS, COIN_CARD]) {
      expect(() => CardSchema.parse(card), card.name).not.toThrow();
    }
  });

  // Guards against mechanics that exist in the engine but never reach the board.
  it('gives the demo deck a card for every implemented mechanic', () => {
    const actions = DEMO_CARDS.flatMap((c) => c.effects.map((e) => e.action));
    const keywords = DEMO_CARDS.flatMap((c) => c.keywords);

    for (const action of ['Freeze', 'Silence', 'DealDamage', 'DrawCard', 'Heal', 'SummonToken']) {
      expect(actions, `no demo card uses ${action}`).toContain(action);
    }
    for (const keyword of ['Taunt', 'Charge', 'DivineShield', 'Stealth']) {
      expect(keywords, `no demo card has ${keyword}`).toContain(keyword);
    }
  });
});

describe('turn structure', () => {
  it('ramps mana by one per turn and caps at ten', () => {
    const state = createMatch(buildDemoDeck(), buildDemoDeck(), 42);
    expect(state.players.player.maxMana).toBe(1);
    for (let i = 0; i < 30; i++) endTurn(state);
    expect(state.players.player.maxMana).toBe(10);
    expect(state.players.ai.maxMana).toBe(10);
  });

  it('alternates the active player', () => {
    const state = createMatch(buildDemoDeck(), buildDemoDeck(), 7);
    expect(state.current).toBe('player');
    endTurn(state);
    expect(state.current).toBe('ai');
    endTurn(state);
    expect(state.current).toBe('player');
  });

  it('deals escalating fatigue damage on an empty deck', () => {
    const state = bareMatch();
    state.players.player.deck = [];
    drawCard(state, 'player');
    expect(state.players.player.health).toBe(HERO_HEALTH - 1);
    drawCard(state, 'player');
    expect(state.players.player.health).toBe(HERO_HEALTH - 3);
  });

  it('opens with 3 cards for the player and 4 for the AI, then the player draws', () => {
    const state = createMatch(buildDemoDeck(), buildDemoDeck(), 3);
    expect(state.players.player.hand).toHaveLength(4);
    // 4 cards plus The Coin.
    expect(state.players.ai.hand).toHaveLength(5);
    expect(state.players.ai.hand.at(-1)?.name).toBe('The Coin');
  });
});

describe('The Coin', () => {
  it('goes to the player on the draw, not the player going first', () => {
    const state = createMatch(buildDemoDeck(), buildDemoDeck(), 11);
    expect(state.players.player.hand.some((c) => c.name === 'The Coin')).toBe(false);
    expect(state.players.ai.hand.some((c) => c.name === 'The Coin')).toBe(true);
  });

  it('grants a mana crystal for the turn and costs nothing', () => {
    const state = bareMatch();
    state.players.player.mana = 3;
    state.players.player.maxMana = 3;
    playCard(state, 'player', give(state, 'player', COIN_CARD));
    expect(state.players.player.mana).toBe(4);
    expect(state.players.player.maxMana).toBe(3);
    expect(state.players.player.board).toHaveLength(0);
  });

  it('lets the AI play a card a turn ahead of curve', () => {
    const state = bareMatch();
    state.current = 'ai';
    state.players.ai.mana = 1;
    state.players.ai.maxMana = 1;
    const twoDrop = give(state, 'ai', minionCard({ cost: 2 }));
    expect(canPlayCard(state, 'ai', twoDrop)).toBe(false);

    playCard(state, 'ai', give(state, 'ai', COIN_CARD));
    expect(canPlayCard(state, 'ai', twoDrop)).toBe(true);
    expect(playCard(state, 'ai', twoDrop)).toBe(true);
    expect(state.players.ai.mana).toBe(0);
  });

  it('does not push mana past the cap', () => {
    const state = bareMatch();
    state.players.player.mana = 10;
    state.players.player.maxMana = 10;
    playCard(state, 'player', give(state, 'player', COIN_CARD));
    expect(state.players.player.mana).toBe(10);
  });
});

describe('playing cards', () => {
  it('refuses cards that cost more than available mana', () => {
    const state = bareMatch();
    state.players.player.mana = 2;
    const i = give(state, 'player', minionCard({ cost: 5 }));
    expect(canPlayCard(state, 'player', i)).toBe(false);
    expect(playCard(state, 'player', i)).toBe(false);
  });

  it('spends mana and puts the minion on the board', () => {
    const state = bareMatch();
    const i = give(state, 'player', minionCard({ cost: 3 }));
    expect(playCard(state, 'player', i)).toBe(true);
    expect(state.players.player.mana).toBe(7);
    expect(state.players.player.board).toHaveLength(1);
    expect(state.players.player.hand).toHaveLength(0);
  });

  it('enforces the board limit', () => {
    const state = bareMatch();
    for (let n = 0; n < BOARD_LIMIT; n++) {
      const i = give(state, 'player', minionCard({ cost: 0 }));
      playCard(state, 'player', i);
    }
    expect(state.players.player.board).toHaveLength(BOARD_LIMIT);
    const extra = give(state, 'player', minionCard({ cost: 0 }));
    expect(canPlayCard(state, 'player', extra)).toBe(false);
  });

  it('fires Battlecry effects on play', () => {
    const state = bareMatch();
    state.players.player.deck = [minionCard(), minionCard()];
    const i = give(
      state,
      'player',
      minionCard({ cost: 0, effects: [{ trigger: 'Battlecry', action: 'DrawCard', value: 2 }] })
    );
    playCard(state, 'player', i);
    expect(state.players.player.hand).toHaveLength(2);
  });

  it('casts spells without putting them on the board', () => {
    const state = bareMatch();
    const spell: Card = {
      ...minionCard({ cost: 2, name: 'Bolt' }),
      type: 'Spell',
      attack: undefined,
      health: undefined,
      effects: [{ trigger: 'Battlecry', action: 'DealDamage', target: 'Hero', value: 3 }]
    };
    const i = give(state, 'player', spell);
    playCard(state, 'player', i);
    expect(state.players.player.board).toHaveLength(0);
    expect(state.players.ai.health).toBe(HERO_HEALTH - 3);
  });
});

describe('combat', () => {
  it('gives minions summoning sickness unless they have Charge', () => {
    const state = bareMatch();
    playCard(state, 'player', give(state, 'player', minionCard({ cost: 0 })));
    playCard(state, 'player', give(state, 'player', minionCard({ cost: 0, keywords: ['Charge'] })));
    const [plain, charger] = state.players.player.board;
    expect(canAttack(plain)).toBe(false);
    expect(canAttack(charger)).toBe(true);
  });

  it('lets a minion attack the turn after it lands', () => {
    const state = bareMatch();
    playCard(state, 'player', give(state, 'player', minionCard({ cost: 0, attack: 3 })));
    endTurn(state);
    endTurn(state);
    // Empty decks mean both heroes take fatigue in between, so measure the delta.
    const before = state.players.ai.health;
    const minion = state.players.player.board[0];
    expect(attack(state, 'player', minion.instanceId, { kind: 'hero' })).toBe(true);
    expect(state.players.ai.health).toBe(before - 3);
  });

  it('allows only one attack per turn, or two with Windfury', () => {
    const state = bareMatch();
    playCard(state, 'player', give(state, 'player', minionCard({ cost: 0, keywords: ['Charge'] })));
    playCard(
      state,
      'player',
      give(state, 'player', minionCard({ cost: 0, keywords: ['Charge', 'Windfury'] }))
    );
    const [plain, windfury] = state.players.player.board;

    expect(attack(state, 'player', plain.instanceId, { kind: 'hero' })).toBe(true);
    expect(attack(state, 'player', plain.instanceId, { kind: 'hero' })).toBe(false);

    expect(attack(state, 'player', windfury.instanceId, { kind: 'hero' })).toBe(true);
    expect(attack(state, 'player', windfury.instanceId, { kind: 'hero' })).toBe(true);
    expect(attack(state, 'player', windfury.instanceId, { kind: 'hero' })).toBe(false);
  });

  it('forces attacks through Taunt minions', () => {
    const state = bareMatch();
    playCard(state, 'player', give(state, 'player', minionCard({ cost: 0, keywords: ['Charge'] })));
    state.current = 'ai';
    state.players.ai.mana = 10;
    playCard(state, 'ai', give(state, 'ai', minionCard({ cost: 0, keywords: ['Taunt'] })));
    playCard(state, 'ai', give(state, 'ai', minionCard({ cost: 0, name: 'Squishy' })));
    state.current = 'player';

    const targets = legalTargets(state, 'ai');
    expect(targets).toHaveLength(1);
    expect(targets[0].kind).toBe('minion');

    const attacker = state.players.player.board[0];
    expect(attack(state, 'player', attacker.instanceId, { kind: 'hero' })).toBe(false);
    expect(state.players.ai.health).toBe(HERO_HEALTH);
  });

  it('trades damage both ways and clears dead minions', () => {
    const state = bareMatch();
    playCard(
      state,
      'player',
      give(state, 'player', minionCard({ cost: 0, attack: 3, health: 3, keywords: ['Charge'] }))
    );
    state.current = 'ai';
    state.players.ai.mana = 10;
    playCard(state, 'ai', give(state, 'ai', minionCard({ cost: 0, attack: 2, health: 3 })));
    state.current = 'player';

    const attacker = state.players.player.board[0];
    const defender = state.players.ai.board[0];
    attack(state, 'player', attacker.instanceId, {
      kind: 'minion',
      instanceId: defender.instanceId
    });

    // Defender takes 3 and dies; attacker takes 2 back and survives at 1.
    expect(state.players.ai.board).toHaveLength(0);
    expect(state.players.player.board).toHaveLength(1);
    expect(state.players.player.board[0].health).toBe(1);
  });

  it('absorbs one hit with Divine Shield', () => {
    const state = bareMatch();
    playCard(
      state,
      'player',
      give(
        state,
        'player',
        minionCard({ cost: 0, attack: 1, health: 1, keywords: ['Charge', 'DivineShield'] })
      )
    );
    state.current = 'ai';
    state.players.ai.mana = 10;
    playCard(state, 'ai', give(state, 'ai', minionCard({ cost: 0, attack: 5, health: 5 })));
    state.current = 'player';

    const attacker = state.players.player.board[0];
    attack(state, 'player', attacker.instanceId, {
      kind: 'minion',
      instanceId: state.players.ai.board[0].instanceId
    });

    expect(state.players.player.board).toHaveLength(1);
    expect(state.players.player.board[0].health).toBe(1);
    expect(state.players.player.board[0].divineShield).toBe(false);
  });
});

describe('effects', () => {
  it('fires Deathrattle when the minion dies', () => {
    const state = bareMatch();
    state.players.player.deck = [minionCard(), minionCard()];
    playCard(
      state,
      'player',
      give(
        state,
        'player',
        minionCard({
          cost: 0,
          attack: 1,
          health: 1,
          keywords: ['Charge'],
          effects: [{ trigger: 'Deathrattle', action: 'DrawCard', value: 2 }]
        })
      )
    );
    state.current = 'ai';
    state.players.ai.mana = 10;
    playCard(state, 'ai', give(state, 'ai', minionCard({ cost: 0, attack: 5, health: 5 })));
    state.current = 'player';

    attack(state, 'player', state.players.player.board[0].instanceId, {
      kind: 'minion',
      instanceId: state.players.ai.board[0].instanceId
    });

    expect(state.players.player.board).toHaveLength(0);
    expect(state.players.player.hand).toHaveLength(2);
  });

  it('applies StartOfTurn effects each turn', () => {
    const state = bareMatch();
    playCard(
      state,
      'player',
      give(
        state,
        'player',
        minionCard({
          cost: 0,
          attack: 1,
          effects: [{ trigger: 'StartOfTurn', action: 'BuffAttack', target: 'Self', value: 1 }]
        })
      )
    );
    expect(state.players.player.board[0].attack).toBe(1);
    endTurn(state);
    endTurn(state);
    expect(state.players.player.board[0].attack).toBe(2);
  });

  it('hits every enemy with AllEnemies', () => {
    const state = bareMatch();
    state.current = 'ai';
    state.players.ai.mana = 10;
    playCard(state, 'ai', give(state, 'ai', minionCard({ cost: 0, health: 5 })));
    playCard(state, 'ai', give(state, 'ai', minionCard({ cost: 0, health: 5 })));
    state.current = 'player';

    const sweep: Card = {
      ...minionCard({ cost: 0, name: 'Sweep' }),
      type: 'Spell',
      attack: undefined,
      health: undefined,
      effects: [{ trigger: 'Battlecry', action: 'DealDamage', target: 'AllEnemies', value: 2 }]
    };
    playCard(state, 'player', give(state, 'player', sweep));

    expect(state.players.ai.health).toBe(HERO_HEALTH - 2);
    expect(state.players.ai.board.every((m) => m.health === 3)).toBe(true);
  });

  it('heals the caster and never above the starting total', () => {
    const state = bareMatch();
    state.players.player.health = 28;
    const heal: Card = {
      ...minionCard({ cost: 0, name: 'Mend' }),
      type: 'Spell',
      attack: undefined,
      health: undefined,
      effects: [{ trigger: 'Battlecry', action: 'Heal', target: 'Hero', value: 6 }]
    };
    playCard(state, 'player', give(state, 'player', heal));
    expect(state.players.player.health).toBe(HERO_HEALTH);
  });
});

describe('win conditions', () => {
  it('declares a winner when a hero hits zero', () => {
    const state = bareMatch();
    state.players.ai.health = 2;
    playCard(
      state,
      'player',
      give(state, 'player', minionCard({ cost: 0, attack: 5, keywords: ['Charge'] }))
    );
    attack(state, 'player', state.players.player.board[0].instanceId, { kind: 'hero' });
    expect(state.winner).toBe('player');
  });

  it('blocks further actions once the match is over', () => {
    const state = bareMatch();
    state.winner = 'player';
    const i = give(state, 'player', minionCard({ cost: 0 }));
    expect(canPlayCard(state, 'player', i)).toBe(false);
  });
});

describe('board placement', () => {
  function boardNames(state: MatchState) {
    return state.players.player.board.map((m) => m.card.name);
  }

  function seedBoard(state: MatchState, names: string[]) {
    for (const name of names) {
      playCard(state, 'player', give(state, 'player', minionCard({ cost: 0, name })));
    }
  }

  it('appends when no slot is given', () => {
    const state = bareMatch();
    seedBoard(state, ['A', 'B']);
    playCard(state, 'player', give(state, 'player', minionCard({ cost: 0, name: 'C' })));
    expect(boardNames(state)).toEqual(['A', 'B', 'C']);
  });

  it('drops a minion into the slot it was aimed at', () => {
    const state = bareMatch();
    seedBoard(state, ['A', 'B', 'C']);

    const i = give(state, 'player', minionCard({ cost: 0, name: 'New' }));
    playCard(state, 'player', i, 1);
    expect(boardNames(state)).toEqual(['A', 'New', 'B', 'C']);
  });

  it('places at the far left with slot 0', () => {
    const state = bareMatch();
    seedBoard(state, ['A', 'B']);
    playCard(state, 'player', give(state, 'player', minionCard({ cost: 0, name: 'New' })), 0);
    expect(boardNames(state)).toEqual(['New', 'A', 'B']);
  });

  it('clamps a slot beyond the board instead of leaving a hole', () => {
    const state = bareMatch();
    seedBoard(state, ['A']);
    playCard(state, 'player', give(state, 'player', minionCard({ cost: 0, name: 'Far' })), 99);
    playCard(state, 'player', give(state, 'player', minionCard({ cost: 0, name: 'Neg' })), -5);
    expect(boardNames(state)).toEqual(['Neg', 'A', 'Far']);
  });

  it('leaves tokens and AI summons appending as before', () => {
    const state = bareMatch();
    seedBoard(state, ['A']);
    playCard(
      state,
      'player',
      give(
        state,
        'player',
        minionCard({
          cost: 0,
          name: 'Summoner',
          effects: [{ trigger: 'Battlecry', action: 'SummonToken', value: 1 }]
        })
      )
    );
    expect(boardNames(state)).toEqual(['A', 'Summoner', 'Study Note']);
  });
});

describe('freeze', () => {
  it('stops a minion attacking', () => {
    const state = bareMatch();
    playCard(state, 'player', give(state, 'player', minionCard({ cost: 0, keywords: ['Charge'] })));
    const minion = state.players.player.board[0];
    expect(canAttack(minion)).toBe(true);

    minion.frozen = true;
    expect(canAttack(minion)).toBe(false);
    expect(attack(state, 'player', minion.instanceId, { kind: 'hero' })).toBe(false);
  });

  it('thaws at the start of its controller next turn', () => {
    const state = bareMatch();
    playCard(state, 'player', give(state, 'player', minionCard({ cost: 0, keywords: ['Charge'] })));
    state.players.player.board[0].frozen = true;

    endTurn(state); // opponent's turn — still frozen
    expect(state.players.player.board[0].frozen).toBe(true);

    endTurn(state); // back to us — thawed
    expect(state.players.player.board[0].frozen).toBe(false);
    expect(canAttack(state.players.player.board[0])).toBe(true);
  });

  it('is applied by the Freeze action', () => {
    const state = bareMatch();
    state.current = 'ai';
    state.players.ai.mana = 10;
    playCard(state, 'ai', give(state, 'ai', minionCard({ cost: 0 })));
    state.current = 'player';

    const chill: Card = {
      ...minionCard({ cost: 0, name: 'Chill' }),
      type: 'Spell',
      attack: undefined,
      health: undefined,
      effects: [{ trigger: 'Battlecry', action: 'Freeze', target: 'EnemyMinion' }]
    };
    playCard(state, 'player', give(state, 'player', chill));
    expect(state.players.ai.board[0].frozen).toBe(true);
  });
});

describe('silence', () => {
  it('strips keywords and Divine Shield, and flags the minion', () => {
    const state = bareMatch();
    playCard(
      state,
      'player',
      give(state, 'player', minionCard({ cost: 0, keywords: ['Taunt', 'DivineShield'] }))
    );
    const minion = state.players.player.board[0];
    expect(minion.divineShield).toBe(true);

    silence(minion);
    expect(minion.keywords).toEqual([]);
    expect(minion.divineShield).toBe(false);
    expect(minion.silenced).toBe(true);
  });

  it('stops a silenced Taunt compelling attackers', () => {
    const state = bareMatch();
    state.current = 'ai';
    state.players.ai.mana = 10;
    playCard(state, 'ai', give(state, 'ai', minionCard({ cost: 0, keywords: ['Taunt'] })));
    state.current = 'player';

    expect(legalTargets(state, 'ai').every((t) => t.kind === 'minion')).toBe(true);
    silence(state.players.ai.board[0]);
    expect(legalTargets(state, 'ai').some((t) => t.kind === 'hero')).toBe(true);
  });
});

describe('stealth', () => {
  it('keeps a minion out of the target list', () => {
    const state = bareMatch();
    state.current = 'ai';
    state.players.ai.mana = 10;
    playCard(state, 'ai', give(state, 'ai', minionCard({ cost: 0, keywords: ['Stealth'] })));
    state.current = 'player';

    const targets = legalTargets(state, 'ai');
    expect(targets.every((t) => t.kind === 'hero')).toBe(true);
  });

  it('does not compel attackers even when it also has Taunt', () => {
    const state = bareMatch();
    state.current = 'ai';
    state.players.ai.mana = 10;
    playCard(
      state,
      'ai',
      give(state, 'ai', minionCard({ cost: 0, keywords: ['Taunt', 'Stealth'] }))
    );
    playCard(state, 'ai', give(state, 'ai', minionCard({ cost: 0, name: 'Visible' })));
    state.current = 'player';

    const targets = legalTargets(state, 'ai');
    const names = targets.flatMap((t) => (t.kind === 'minion' ? [t.minion.card.name] : ['hero']));
    expect(names).toContain('Visible');
    expect(names).toContain('hero');
    expect(names).not.toContain('Test Minion');
  });
});

describe('armor', () => {
  function bolt(): Card {
    return {
      ...minionCard({ cost: 0, name: 'Bolt' }),
      type: 'Spell',
      attack: undefined,
      health: undefined,
      effects: [{ trigger: 'Battlecry', action: 'DealDamage', target: 'Hero', value: 3 }]
    };
  }

  it('absorbs before health', () => {
    const state = bareMatch();
    state.players.ai.armor = 5;
    playCard(state, 'player', give(state, 'player', bolt()));
    expect(state.players.ai.armor).toBe(2);
    expect(state.players.ai.health).toBe(HERO_HEALTH);
  });

  it('spills over once spent, and never goes negative', () => {
    const state = bareMatch();
    state.players.ai.armor = 2;
    playCard(state, 'player', give(state, 'player', bolt()));
    expect(state.players.ai.armor).toBe(0);
    expect(state.players.ai.health).toBe(HERO_HEALTH - 1);
  });
});

describe('event queue', () => {
  it('starts every match with an events array', () => {
    const state = createMatch(buildDemoDeck(), buildDemoDeck(), 5);
    expect(Array.isArray(state.events)).toBe(true);
  });

  it('emits a summon cue when a minion lands', () => {
    const state = bareMatch();
    state.events = [];
    playCard(state, 'player', give(state, 'player', minionCard({ cost: 0 })));

    const summons = state.events.filter((e) => e.type === 'summon');
    expect(summons).toHaveLength(1);
    expect(summons[0]).toMatchObject({
      type: 'summon',
      owner: 'player',
      instanceId: state.players.player.board[0].instanceId
    });
  });

  it('emits attack, damage and death cues for a lethal trade', () => {
    const state = bareMatch();
    playCard(
      state,
      'player',
      give(state, 'player', minionCard({ cost: 0, attack: 5, health: 5, keywords: ['Charge'] }))
    );
    state.current = 'ai';
    state.players.ai.mana = 10;
    playCard(state, 'ai', give(state, 'ai', minionCard({ cost: 0, attack: 1, health: 1 })));
    state.current = 'player';

    state.events = [];
    attack(state, 'player', state.players.player.board[0].instanceId, {
      kind: 'minion',
      instanceId: state.players.ai.board[0].instanceId
    });

    const types = state.events.map((e) => e.type);
    expect(types).toContain('attack');
    expect(types).toContain('damage');
    expect(types).toContain('death');
    expect(types.indexOf('attack')).toBeLessThan(types.indexOf('death'));
  });

  it('emits a shield cue instead of damage when Divine Shield soaks a hit', () => {
    const state = bareMatch();
    playCard(
      state,
      'player',
      give(
        state,
        'player',
        minionCard({ cost: 0, attack: 1, health: 4, keywords: ['Charge', 'DivineShield'] })
      )
    );
    state.current = 'ai';
    state.players.ai.mana = 10;
    playCard(state, 'ai', give(state, 'ai', minionCard({ cost: 0, attack: 3, health: 9 })));
    state.current = 'player';

    state.events = [];
    attack(state, 'player', state.players.player.board[0].instanceId, {
      kind: 'minion',
      instanceId: state.players.ai.board[0].instanceId
    });

    const attackerId = state.players.player.board[0].instanceId;
    expect(state.events).toContainEqual({ type: 'shield', instanceId: attackerId });
    expect(state.players.player.board[0].health).toBe(4);
  });
});
