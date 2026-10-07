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
  conditionMet,
  conditionsMet,
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
  state.history = [];
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

describe('deck copies', () => {
  it('gives each copy of a two-of its own object', () => {
    const card = minionCard();
    const state = createMatch([card, card], [card, card], 3);
    const all = [...state.players.player.hand, ...state.players.player.deck];
    expect(all).toHaveLength(2);
    expect(all[0]).not.toBe(all[1]);
    expect(all[0]).toEqual(all[1]);
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

  it('emits a play cue before anything the card does', () => {
    const state = bareMatch();
    state.events = [];
    const card = minionCard({ cost: 0 });
    playCard(state, 'player', give(state, 'player', card));

    const types = state.events.map((e) => e.type);
    expect(types[0]).toBe('play');
    expect(types.indexOf('play')).toBeLessThan(types.indexOf('summon'));
    expect(state.events[0]).toMatchObject({ type: 'play', owner: 'player', card });
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

describe('history', () => {
  it('writes a play with what it did, and stamps the cue that starts it', () => {
    const state = bareMatch();
    state.events = [];
    const bolt: Card = {
      ...minionCard({ cost: 0 }),
      id: '33333333-3333-4333-8333-333333333333',
      name: 'Bolt',
      type: 'Spell',
      attack: undefined,
      health: undefined,
      effects: [{ trigger: 'Battlecry', action: 'DealDamage', target: 'Hero', value: 3 }]
    };
    playCard(state, 'player', give(state, 'player', bolt));

    expect(state.history).toHaveLength(1);
    expect(state.history[0]).toMatchObject({
      n: 0,
      actor: 'player',
      kind: 'play',
      cardId: bolt.id,
      name: 'Bolt',
      targets: [{ ref: { kind: 'hero', owner: 'ai' }, result: 'damage', amount: 3 }]
    });
    expect(state.events.filter((e) => e.entry !== undefined)).toEqual([
      expect.objectContaining({ type: 'play', entry: 0 })
    ]);
    expect(state.openEntry).toBeNull();
  });

  it('writes a trade as one attack: damage both ways, and the kill', () => {
    const state = bareMatch();
    playCard(state, 'player', give(state, 'player', minionCard({ cost: 0, attack: 5, health: 5, keywords: ['Charge'] })));
    state.current = 'ai';
    state.players.ai.mana = 10;
    const victim = minionCard({ cost: 0, attack: 1, health: 1, name: 'Victim', id: '44444444-4444-4444-8444-444444444444' });
    playCard(state, 'ai', give(state, 'ai', victim));
    state.current = 'player';

    const attacker = state.players.player.board[0];
    const defender = state.players.ai.board[0];
    attack(state, 'player', attacker.instanceId, { kind: 'minion', instanceId: defender.instanceId });

    const entry = state.history.at(-1)!;
    expect(entry).toMatchObject({ kind: 'attack', actor: 'player', name: 'Test Minion' });
    expect(entry.targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ref: { kind: 'minion', instanceId: defender.instanceId }, result: 'damage', amount: 5 }),
        expect.objectContaining({ ref: { kind: 'minion', instanceId: attacker.instanceId }, result: 'damage', amount: 1 }),
        expect.objectContaining({ cardId: victim.id, name: 'Victim', result: 'killed' })
      ])
    );
  });

  it('folds a Battlecry into its play, and never lists the minion as its own summon', () => {
    const state = bareMatch();
    playCard(
      state,
      'player',
      give(state, 'player', minionCard({ cost: 0, effects: [{ trigger: 'Battlecry', action: 'SummonToken', value: 1 }] }))
    );
    expect(state.history).toHaveLength(1);
    expect(state.history[0].targets.map((t) => t.result)).toEqual(['summoned']);
  });

  it('gives a turn trigger its own entry, and credits a death it causes after it closes', () => {
    const state = bareMatch();
    playCard(
      state,
      'player',
      give(
        state,
        'player',
        minionCard({ cost: 0, name: 'Ticker', effects: [{ trigger: 'EndOfTurn', action: 'DealDamage', target: 'AllEnemies', value: 1 }] })
      )
    );
    state.current = 'ai';
    state.players.ai.mana = 10;
    playCard(state, 'ai', give(state, 'ai', minionCard({ cost: 0, attack: 1, health: 1, name: 'Frail' })));
    state.current = 'player';

    endTurn(state);
    const tick = state.history.find((e) => e.kind === 'trigger')!;
    expect(tick).toMatchObject({ actor: 'player', name: 'Ticker', trigger: 'EndOfTurn' });
    expect(tick.targets).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'Frail', result: 'killed' })]));
  });

  it('stamps exactly one cue per entry', () => {
    const state = createMatch(buildDemoDeck(), buildDemoDeck(), 11);
    for (let turn = 0; turn < 30 && !state.winner; turn++) {
      const p = state.players[state.current];
      for (let i = p.hand.length - 1; i >= 0; i--) {
        if (canPlayCard(state, state.current, i) && !p.hand[i].targeting) playCard(state, state.current, i);
      }
      endTurn(state);
    }
    const stamps = state.events.filter((e) => e.entry !== undefined).map((e) => e.entry);
    expect(stamps).toEqual(state.history.map((e) => e.n));
  });
});

describe('reactions', () => {
  /** A board with one friendly minion carrying `effects`, and full mana. */
  function withMinion(effects: Card['effects'], over: Partial<Card> = {}) {
    const state = bareMatch();
    playCard(state, 'player', give(state, 'player', minionCard({ cost: 0, attack: 1, health: 5, effects, ...over })));
    return { state, minion: state.players.player.board[0] };
  }

  function enemy(state: MatchState, over: Partial<Card> = {}) {
    state.current = 'ai';
    state.players.ai.mana = 10;
    playCard(state, 'ai', give(state, 'ai', minionCard({ cost: 0, attack: 1, health: 3, ...over })));
    state.current = 'player';
    return state.players.ai.board.at(-1)!;
  }

  it('fires OnDamaged when the minion survives the hit, after the action settles', () => {
    const { state, minion } = withMinion([{ trigger: 'OnDamaged', action: 'BuffAttack', target: 'Self', value: 2 }], { keywords: ['Charge'] });
    const foe = enemy(state, { attack: 1, health: 9 });
    attack(state, 'player', minion.instanceId, { kind: 'minion', instanceId: foe.instanceId });
    expect(minion.health).toBe(4);
    expect(minion.attack).toBe(3);
    // Its hit landed at the old attack: the reaction comes after the exchange.
    expect(foe.health).toBe(8);
  });

  it('does not fire OnDamaged for a minion that died of the hit', () => {
    const { state, minion } = withMinion([{ trigger: 'OnDamaged', action: 'DrawCard', value: 1 }], { health: 1, keywords: ['Charge'] });
    state.players.player.deck = [minionCard()];
    const foe = enemy(state, { attack: 5, health: 9 });
    attack(state, 'player', minion.instanceId, { kind: 'minion', instanceId: foe.instanceId });
    expect(state.players.player.hand).toHaveLength(0);
  });

  it('fires OnFriendlyDeath when another friendly minion dies, not when an enemy does', () => {
    const { state } = withMinion([{ trigger: 'OnFriendlyDeath', action: 'GainArmor', value: 2 }]);
    playCard(state, 'player', give(state, 'player', minionCard({ cost: 0, attack: 1, health: 1, keywords: ['Charge'] })));
    const doomed = state.players.player.board[1];
    const foe = enemy(state, { attack: 3, health: 9 });
    attack(state, 'player', doomed.instanceId, { kind: 'minion', instanceId: foe.instanceId });
    expect(state.players.player.armor).toBe(2);
  });

  it('fires OnFriendlySpell after a spell, and OnFriendlyPlay for another minion only', () => {
    const { state } = withMinion([
      { trigger: 'OnFriendlySpell', action: 'GainArmor', value: 1 },
      { trigger: 'OnFriendlyPlay', action: 'GainArmor', value: 10 }
    ]);
    // Playing the reactor itself did not trigger its own OnFriendlyPlay.
    expect(state.players.player.armor).toBe(0);
    const spell: Card = { ...minionCard({ cost: 0 }), type: 'Spell', attack: undefined, health: undefined, effects: [{ trigger: 'Battlecry', action: 'DrawCard', value: 0 }] };
    playCard(state, 'player', give(state, 'player', spell));
    expect(state.players.player.armor).toBe(1);
    playCard(state, 'player', give(state, 'player', minionCard({ cost: 0 })));
    expect(state.players.player.armor).toBe(11);
  });

  it('settles a loop between two minions that hurt each other', () => {
    const ping: Card['effects'] = [{ trigger: 'OnDamaged', action: 'DealDamage', target: 'RandomEnemy', value: 1 }];
    const { state, minion } = withMinion(ping, { health: 4, keywords: ['Charge'] });
    const foe = enemy(state, { attack: 1, health: 4, effects: ping });
    state.players.ai.health = 1000;
    state.players.player.health = 1000;
    attack(state, 'player', minion.instanceId, { kind: 'minion', instanceId: foe.instanceId });
    expect(state.reactions).toEqual([]);
    expect(state.winner).toBeNull();
  });

  it("stops a silenced minion's Deathrattle and turn triggers", () => {
    const { state, minion } = withMinion([
      { trigger: 'EndOfTurn', action: 'GainArmor', value: 3 },
      { trigger: 'Deathrattle', action: 'GainArmor', value: 5 }
    ]);
    silence(minion);
    endTurn(state);
    expect(state.players.player.armor).toBe(0);
    minion.health = 0;
    state.current = 'player';
    endTurn(state);
    expect(state.players.player.armor).toBe(0);
  });
});

describe('return and transform', () => {
  const spell = (effects: Card['effects'], over: Partial<Card> = {}): Card => ({
    ...minionCard({ cost: 0 }),
    id: `spell-${Math.random()}`,
    type: 'Spell',
    attack: undefined,
    health: undefined,
    effects,
    ...over
  });

  it("brings a Deathrattle: Return this minion back to hand as a fresh copy", () => {
    const state = bareMatch();
    const card = minionCard({ cost: 0, health: 1, keywords: ['Charge'], effects: [{ trigger: 'Deathrattle', action: 'ReturnToHand', target: 'Self' }] });
    playCard(state, 'player', give(state, 'player', card));
    const m = state.players.player.board[0];
    state.current = 'ai';
    state.players.ai.mana = 10;
    playCard(state, 'ai', give(state, 'ai', minionCard({ cost: 0, attack: 5, health: 9 })));
    state.current = 'player';
    attack(state, 'player', m.instanceId, { kind: 'minion', instanceId: state.players.ai.board[0].instanceId });
    expect(state.players.player.board).toHaveLength(0);
    expect(state.players.player.hand.map((c) => c.id)).toEqual([card.id]);
    expect(state.players.player.hand[0]).not.toBe(card);
    expect(state.events.some((e) => e.type === 'bounce' && e.instanceId === m.instanceId)).toBe(true);
  });

  it("returns every minion to its owner's hand, and loses one when that hand is full", () => {
    const state = bareMatch();
    playCard(state, 'player', give(state, 'player', minionCard({ cost: 0 })));
    state.current = 'ai';
    state.players.ai.mana = 10;
    playCard(state, 'ai', give(state, 'ai', minionCard({ cost: 0 })));
    state.players.ai.hand = Array.from({ length: 10 }, () => minionCard());
    state.current = 'player';
    playCard(state, 'player', give(state, 'player', spell([{ trigger: 'Battlecry', action: 'ReturnToHand', target: 'AllMinions' }])));
    expect(state.players.player.board).toHaveLength(0);
    expect(state.players.ai.board).toHaveLength(0);
    expect(state.players.player.hand).toHaveLength(1);
    expect(state.players.ai.hand).toHaveLength(10);
    expect(state.events.find((e) => e.type === 'bounce' && e.owner === 'ai')).toMatchObject({ lost: true });
  });

  it('transforms a minion into a Study Note where it stands', () => {
    const state = bareMatch();
    state.current = 'ai';
    state.players.ai.mana = 10;
    playCard(state, 'ai', give(state, 'ai', minionCard({ cost: 0, attack: 8, health: 8, keywords: ['Taunt', 'DivineShield'] })));
    state.current = 'player';
    const target = state.players.ai.board[0];
    const card = spell([{ trigger: 'Battlecry', action: 'Transform', target: 'Chosen' }]);
    expect(playCard(state, 'player', give(state, 'player', card), undefined, { kind: 'minion', owner: 'ai', minion: target })).toBe(true);
    expect(state.players.ai.board[0]).toMatchObject({ instanceId: target.instanceId, attack: 1, health: 1, keywords: [], divineShield: false });
    expect(state.players.ai.board[0].card.name).toBe('Study Note');
  });

  it('never offers a hero to an effect that only works on minions', () => {
    const state = bareMatch();
    const transform = spell([{ trigger: 'Battlecry', action: 'Transform', target: 'Chosen' }]);
    const index = give(state, 'player', transform);
    expect(playCard(state, 'player', index, undefined, { kind: 'hero', owner: 'ai' })).toBe(false);
    const bolt = spell([{ trigger: 'Battlecry', action: 'DealDamage', target: 'Chosen', value: 2 }]);
    expect(playCard(state, 'player', give(state, 'player', bolt), undefined, { kind: 'hero', owner: 'ai' })).toBe(true);
  });
});

describe('the graveyard', () => {
  it('resummons the most recent friendly minions that died, fresh', () => {
    const state = bareMatch();
    const first = minionCard({ cost: 0, name: 'First', health: 1, keywords: ['Charge'] });
    const second = minionCard({ cost: 0, name: 'Second', health: 1, keywords: ['Charge'] });
    playCard(state, 'player', give(state, 'player', first));
    playCard(state, 'player', give(state, 'player', second));
    state.current = 'ai';
    state.players.ai.mana = 10;
    playCard(state, 'ai', give(state, 'ai', minionCard({ cost: 0, attack: 5, health: 30 })));
    state.current = 'player';
    const wall = state.players.ai.board[0].instanceId;
    for (const m of [...state.players.player.board]) attack(state, 'player', m.instanceId, { kind: 'minion', instanceId: wall });
    expect(state.players.player.board).toHaveLength(0);
    expect(state.players.player.graveyard.map((c) => c.name)).toEqual(['First', 'Second']);

    const circular: Card = { ...minionCard({ cost: 0 }), type: 'Spell', attack: undefined, health: undefined, effects: [{ trigger: 'Battlecry', action: 'Resummon', value: 3 }] };
    playCard(state, 'player', give(state, 'player', circular));
    expect(state.players.player.board.map((m) => [m.card.name, m.health])).toEqual([['Second', 1], ['First', 1]]);
  });
});

describe('planned obsolescence', () => {
  function doomEnemy() {
    const state = bareMatch();
    state.current = 'ai';
    state.players.ai.mana = 10;
    playCard(state, 'ai', give(state, 'ai', minionCard({ cost: 0, name: 'Gadget', attack: 3, health: 3 })));
    state.current = 'player';
    const target = state.players.ai.board[0];
    const doom: Card = {
      ...minionCard({ cost: 0 }), id: 'doom', name: 'Doom', type: 'Spell', attack: undefined, health: undefined, targeting: 'enemy',
      effects: [{ trigger: 'Battlecry', action: 'DestroyLater', target: 'Chosen' }]
    };
    state.history = [];
    playCard(state, 'player', give(state, 'player', doom), undefined, { kind: 'minion', owner: 'ai', minion: target });
    return { state, target };
  }

  it("destroys the minion at the end of the opponent's next turn, and credits the card", () => {
    const { state, target } = doomEnemy();
    endTurn(state); // the player's turn ends: the opponent's turn begins, and the minion lives through it
    expect(state.players.ai.board).toContain(target);
    endTurn(state); // ...until it ends
    expect(state.players.ai.board).not.toContain(target);
    expect(state.history[0].targets).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'Gadget', result: 'doomed' }), expect.objectContaining({ name: 'Gadget', result: 'killed' })])
    );
  });

  it('is lifted by silence', () => {
    const { state, target } = doomEnemy();
    silence(target);
    endTurn(state);
    endTurn(state);
    expect(state.players.ai.board).toContain(target);
  });
});

describe('staged text', () => {
  it('fires one stage per trigger, in order, and comes round again', () => {
    const state = bareMatch();
    playCard(state, 'player', give(state, 'player', minionCard({
      cost: 0,
      effects: [
        { trigger: 'StartOfTurn', action: 'GainArmor', value: 1, stage: 0 },
        { trigger: 'StartOfTurn', action: 'GainArmor', value: 10, stage: 1 }
      ]
    })));
    const minion = state.players.player.board[0];
    // A deck, so fatigue does not eat the armor being counted.
    state.players.player.deck = Array.from({ length: 10 }, () => minionCard());
    state.players.ai.deck = Array.from({ length: 10 }, () => minionCard());
    const yourNextTurn = () => {
      endTurn(state);
      endTurn(state);
    };
    yourNextTurn();
    expect([state.players.player.armor, minion.stage]).toEqual([1, 1]);
    yourNextTurn();
    expect([state.players.player.armor, minion.stage]).toEqual([11, 0]);
    yourNextTurn();
    expect([state.players.player.armor, minion.stage]).toEqual([12, 1]);
  });
});

describe('auras', () => {
  const aura = (effect: Partial<Card['effects'][number]>): Card['effects'] => [
    { trigger: 'Passive', action: 'BuffAttack', target: 'OtherFriendly', value: 1, ...effect } as Card['effects'][number]
  ];

  it('gives the other minions the bonus while the source is there, and takes it back', () => {
    const state = bareMatch();
    playCard(state, 'player', give(state, 'player', minionCard({ cost: 0, attack: 2 })));
    const other = state.players.player.board[0];
    playCard(state, 'player', give(state, 'player', minionCard({ cost: 0, attack: 1, health: 1, effects: aura({}) })));
    const source = state.players.player.board[1];
    expect([other.attack, source.attack]).toEqual([3, 1]);
    // A minion played after the aura gets it too.
    playCard(state, 'player', give(state, 'player', minionCard({ cost: 0, attack: 5 })));
    expect(state.players.player.board[2].attack).toBe(6);
    silence(source);
    endTurn(state);
    expect(other.attack).toBe(2);
  });

  it("raises Health on the opponent's turn only, and never kills when it lapses", () => {
    const state = bareMatch();
    state.players.player.deck = Array.from({ length: 5 }, () => minionCard());
    state.players.ai.deck = Array.from({ length: 5 }, () => minionCard());
    playCard(state, 'player', give(state, 'player', minionCard({
      cost: 0, attack: 2, health: 3, effects: aura({ action: 'BuffHealth', target: 'Self', value: 3, condition: 'opponents_turn' })
    })));
    const wall = state.players.player.board[0];
    expect([wall.health, wall.maxHealth]).toEqual([3, 3]);
    endTurn(state);
    expect([wall.health, wall.maxHealth]).toEqual([6, 6]);
    wall.health = 2; // hurt badly on their turn
    endTurn(state);
    expect([wall.health, wall.maxHealth]).toEqual([2, 3]);
    expect(state.players.player.board).toContain(wall);
  });
});

describe('conditions', () => {
  const armorIfTaunt = minionCard({ cost: 0, effects: [{ trigger: 'Battlecry', action: 'GainArmor', value: 4, requires: 'controlTaunt' }] });

  it('skips conditional text when the condition does not hold', () => {
    const state = bareMatch();
    playCard(state, 'player', give(state, 'player', armorIfTaunt));
    expect(state.players.player.armor).toBe(0);
  });

  it('resolves it when it does — and the hand can tell in advance', () => {
    const state = bareMatch();
    playCard(state, 'player', give(state, 'player', minionCard({ cost: 0, keywords: ['Taunt'] })));
    expect(conditionsMet(armorIfTaunt, state.players.player)).toBe(true);
    playCard(state, 'player', give(state, 'player', armorIfTaunt));
    expect(state.players.player.armor).toBe(4);
  });

  it('knows a damaged hero, and a card with no conditions never glows', () => {
    const hurt = { board: [], health: 29 };
    expect(conditionMet('heroDamaged', hurt)).toBe(true);
    expect(conditionMet('heroDamaged', { board: [], health: 30 })).toBe(false);
    expect(conditionsMet(minionCard(), hurt)).toBe(false);
  });
});
