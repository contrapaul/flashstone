import type { Card, CardClass, Effect, Trigger } from '../../types/cards';
import { HERO_POWERS } from '../data/classes';
import { STUDY_NOTE, tokenById } from '../data/tokens';
import type { CueRef, GameEvent } from './events';
import { createRng, pick, shuffle, type Rng } from './rng';
import {
  BOARD_LIMIT,
  HAND_LIMIT,
  HERO_HEALTH,
  MAX_MANA,
  HERO_POWER_COST,
  canAttack,
  canHeroAttack,
  canUseHeroPower,
  spellPowerOf,
  legalTargets,
  opponentOf,
  silence,
  snapshotMinion,
  snapshotWeapon,
  spellTargets,
  type Character,
  type MatchState,
  type MinionInstance,
  type PlayerId,
  type PlayerState
} from './state';

/** Compensation for going second. Not part of any deck — dealt at match start. */
export const COIN_CARD: Card = {
  id: '00000000-0000-4000-8000-000000000002',
  name: 'The Coin',
  cost: 0,
  type: 'Spell',
  rarity: 'Common',
  keywords: [],
  effects: [{ trigger: 'Battlecry', action: 'GainMana', value: 1 }],
  description: 'Gain 1 Mana Crystal this turn.'
};

// ── Setup ──────────────────────────────────────────────────────

function createPlayer(id: PlayerId, deck: Card[], heroClass: CardClass = 'Neutral'): PlayerState {
  return {
    id,
    health: HERO_HEALTH,
    armor: 0,
    mana: 0,
    maxMana: 0,
    deck,
    hand: [],
    board: [],
    fatigue: 0,
    weapon: null,
    heroAttacksThisTurn: 0,
    heroClass,
    heroPowerUsedThisTurn: false
  };
}

export function createMatch(
  playerDeck: Card[],
  aiDeck: Card[],
  seed = 1,
  /** Each side's class, which is what decides their hero power. */
  classes: { player?: CardClass; ai?: CardClass } = {}
): MatchState {
  const rng = createRng(seed);
  // Each copy becomes its own object. A deck resolved from the registry holds
  // the *same* object twice for a two-of, and anything that tells cards in hand
  // apart by identity — the table's keyed hand — then sees one card twice.
  const own = (deck: Card[]) => deck.map((card) => ({ ...card }));
  const state: MatchState = {
    players: {
      player: createPlayer('player', shuffle(rng, own(playerDeck)), classes.player ?? 'Neutral'),
      ai: createPlayer('ai', shuffle(rng, own(aiDeck)), classes.ai ?? 'Neutral')
    },
    current: 'player',
    turnNumber: 0,
    winner: null,
    log: [],
    seed,
    nextInstanceId: 1,
    events: []
  };

  // The player moves first; the AI gets an extra card and The Coin to compensate.
  for (let i = 0; i < 3; i++) drawCard(state, 'player');
  for (let i = 0; i < 4; i++) drawCard(state, 'ai');
  state.players.ai.hand.push(COIN_CARD);
  // Seen arriving like any card, so the hand on screen counts it.
  emit(state, { type: 'draw', owner: 'ai', deckCount: state.players.ai.deck.length });

  startTurn(state, 'player');
  return state;
}

/** Queues an animation cue. Cosmetic only — no rule depends on the queue. */
function emit(state: MatchState, event: GameEvent): void {
  state.events.push(event);
}

function refOf(target: Character): CueRef {
  return target.kind === 'hero'
    ? { kind: 'hero', owner: target.owner }
    : { kind: 'minion', instanceId: target.minion.instanceId };
}

/** Lights a minion's text before it fires, when it has any for this trigger. */
function emitTrigger(state: MatchState, minion: MinionInstance, trigger: Trigger): void {
  if (minion.card.effects.some((e) => e.trigger === trigger)) {
    emit(state, { type: 'trigger', instanceId: minion.instanceId, trigger });
  }
}

/** Each match re-derives its RNG from the seed plus turn count so replays match. */
function rngFor(state: MatchState): Rng {
  return createRng(state.seed + state.turnNumber * 7919 + state.nextInstanceId);
}

// ── Turn structure ─────────────────────────────────────────────

function startTurn(state: MatchState, id: PlayerId): void {
  const p = state.players[id];
  state.current = id;
  state.turnNumber++;
  p.maxMana = Math.min(MAX_MANA, p.maxMana + 1);
  p.mana = p.maxMana;
  p.heroAttacksThisTurn = 0;
  p.heroPowerUsedThisTurn = false;
  for (const minion of p.board) {
    minion.summonedThisTurn = false;
    minion.attacksThisTurn = 0;
    minion.frozen = false;
  }
  state.log.push(`— ${id} turn ${state.turnNumber} (${p.mana} mana) —`);
  emit(state, { type: 'turn', owner: id, turnNumber: state.turnNumber, mana: p.mana, maxMana: p.maxMana });
  drawCard(state, id);
  triggerBoard(state, id, 'StartOfTurn');
}

export function endTurn(state: MatchState): void {
  if (state.winner) return;
  const id = state.current;
  triggerBoard(state, id, 'EndOfTurn');
  if (state.winner) return;
  startTurn(state, opponentOf(id));
}

function triggerBoard(state: MatchState, id: PlayerId, trigger: Trigger): void {
  // Snapshot: effects can kill minions mid-loop.
  for (const minion of [...state.players[id].board]) {
    if (!state.players[id].board.includes(minion)) continue;
    emitTrigger(state, minion, trigger);
    for (const effect of minion.card.effects) {
      if (effect.trigger === trigger) resolveEffect(state, id, minion, effect);
    }
  }
  checkDeaths(state);
}

// ── Cards ──────────────────────────────────────────────────────

export function drawCard(state: MatchState, id: PlayerId): void {
  const p = state.players[id];
  const card = p.deck.shift();
  if (!card) {
    p.fatigue++;
    state.log.push(`${id} is out of cards — ${p.fatigue} fatigue damage.`);
    emit(state, { type: 'fatigue', owner: id, amount: p.fatigue });
    damageHero(state, id, p.fatigue);
    return;
  }
  if (p.hand.length >= HAND_LIMIT) {
    state.log.push(`${id}'s hand is full — ${card.name} burned.`);
    emit(state, { type: 'burn', owner: id, card, deckCount: p.deck.length });
    return;
  }
  p.hand.push(card);
  emit(state, { type: 'draw', owner: id, deckCount: p.deck.length });
}

export function canPlayCard(state: MatchState, id: PlayerId, handIndex: number): boolean {
  if (state.winner || state.current !== id) return false;
  const p = state.players[id];
  const card = p.hand[handIndex];
  if (!card) return false;
  if (card.cost > p.mana) return false;
  if (card.type === 'Minion' && p.board.length >= BOARD_LIMIT) return false;
  return true;
}

/**
 * `slot` is where on the board a dragged minion was dropped. Omitted, it joins
 * the right-hand end. Position carries no rules weight — it exists so a card
 * lands where you aimed it.
 */
export function playCard(
  state: MatchState,
  id: PlayerId,
  handIndex: number,
  slot?: number,
  chosen?: Character
): boolean {
  if (!canPlayCard(state, id, handIndex)) return false;
  const card = state.players[id].hand[handIndex];
  if (!card) return false;

  // A card that has to be aimed is refused outright without a legal target,
  // rather than fizzling — a misclick must never burn the card and the mana.
  if (needsTarget(card)) {
    if (!chosen || !isLegalChosenTarget(state, id, card, chosen)) return false;
  }

  const p = state.players[id];
  p.hand.splice(handIndex, 1);
  p.mana -= card.cost;
  state.log.push(`${id} plays ${card.name}.`);
  emit(state, {
    type: 'play',
    owner: id,
    card,
    handIndex,
    target: chosen ? refOf(chosen) : undefined,
    mana: p.mana
  });

  let summoned: MinionInstance | undefined;
  if (card.type === 'Minion') summoned = summon(state, id, card, slot);
  else if (card.type === 'Weapon') equipWeapon(state, id, card);
  if (summoned) emitTrigger(state, summoned, 'Battlecry');

  // Battlecry-triggered effects fire on play, for minions and spells alike.
  //
  // This is the whole of a spell's behaviour, which makes it a convention every
  // spell must honour: **a spell's effects must be tagged `Battlecry`**, or the
  // card does nothing when cast. Nothing here enforces it — the card set does,
  // in the generator, guarded by a test in slCards.test.ts.
  for (const effect of card.effects) {
    if (effect.trigger === 'Battlecry') {
      resolveEffect(state, id, summoned, effect, chosen, card.type === 'Spell');
    }
  }

  checkDeaths(state);
  return true;
}

/**
 * Uses the hero power.
 *
 * Shaped like `heroAttack` on purpose: returns false for illegal use rather than
 * throwing, so a client that asks twice gets a refusal, not a crashed room.
 * Effects resolve through the **same `resolveEffect`** cards use, and count as
 * spell-powered — Spell Damage applies to hero powers, as in Hearthstone.
 */
export function useHeroPower(
  state: MatchState,
  id: PlayerId,
  chosen?: Character
): boolean {
  if (!canUseHeroPower(state, id)) return false;

  const power = HERO_POWERS[state.players[id].heroClass];
  if (!power) return false;

  // Refused before any mana is spent when it needs a target and has none, or
  // when it simply cannot do anything — the Designer with all four ideas out.
  if (power.needsTarget && (!chosen || !isLegalHeroPowerTarget(state, id, chosen))) return false;
  if (power.isUseless?.(state, id)) return false;

  const p = state.players[id];
  p.mana -= HERO_POWER_COST;
  p.heroPowerUsedThisTurn = true;
  state.log.push(`${id} uses ${power.name}.`);
  emit(state, { type: 'heroPower', owner: id, mana: p.mana });

  for (const effect of power.effects(state, id)) {
    resolveEffect(state, id, undefined, effect, chosen, true);
  }

  checkDeaths(state);
  return true;
}

export function isLegalHeroPowerTarget(
  state: MatchState,
  caster: PlayerId,
  chosen: Character
): boolean {
  return spellTargets(state, caster, 'any').some((t) =>
    t.kind === 'hero'
      ? chosen.kind === 'hero' && chosen.owner === t.owner
      : chosen.kind === 'minion' && chosen.minion.instanceId === t.minion.instanceId
  );
}

/** True when any of the card's Battlecry effects must be aimed by the player. */
export function needsTarget(card: Card): boolean {
  return card.effects.some((e) => e.trigger === 'Battlecry' && e.target === 'Chosen');
}

/** Re-checked here, not just in the UI — an online client sends whatever it likes. */
export function isLegalChosenTarget(
  state: MatchState,
  caster: PlayerId,
  card: Card,
  chosen: Character
): boolean {
  const legal = spellTargets(state, caster, card.targeting ?? 'any');
  return legal.some((t) =>
    t.kind === 'hero'
      ? chosen.kind === 'hero' && chosen.owner === t.owner
      : chosen.kind === 'minion' && chosen.minion.instanceId === t.minion.instanceId
  );
}

/** Equipping replaces whatever was held; weapons never stack. */
function equipWeapon(state: MatchState, id: PlayerId, card: Card): void {
  const p = state.players[id];
  if (p.weapon) state.log.push(`${p.weapon.card.name} is discarded.`);
  p.weapon = { card, attack: card.attack ?? 0, durability: card.durability ?? 1 };
  emit(state, { type: 'equip', owner: id, weapon: snapshotWeapon(p.weapon)! });
}

/**
 * The hero swings.
 *
 * Trades damage both ways like a minion attack, spends a point of durability,
 * and destroys the weapon at zero. Taunt applies exactly as it does to minions,
 * which is why this routes through `legalTargets` rather than reimplementing it.
 */
export function heroAttack(state: MatchState, id: PlayerId, target: Character): boolean {
  if (state.winner || state.current !== id) return false;
  const p = state.players[id];
  if (!canHeroAttack(p) || !p.weapon) return false;

  const foe = opponentOf(id);
  const legal = legalTargets(state, foe);
  const match = legal.find((t) =>
    t.kind === 'hero'
      ? target.kind === 'hero'
      : target.kind === 'minion' && t.minion.instanceId === target.minion.instanceId
  );
  if (!match) return false;

  p.heroAttacksThisTurn++;
  emit(state, {
    type: 'heroAttack',
    owner: id,
    target: match.kind === 'hero' ? { kind: 'hero', owner: foe } : refOf(match),
    durability: p.weapon.durability - 1
  });

  const damage = p.weapon.attack;
  if (match.kind === 'hero') {
    damageHero(state, foe, damage);
  } else {
    const defender = match.minion;
    damageMinion(state, defender, damage);
    // The hero takes the defender's attack back, the same as a minion trade.
    if (defender.attack > 0) damageHero(state, id, defender.attack);
  }

  p.weapon.durability--;
  if (p.weapon.durability <= 0) {
    state.log.push(`${p.weapon.card.name} breaks.`);
    p.weapon = null;
    emit(state, { type: 'weaponBreak', owner: id });
  }

  checkDeaths(state);
  return true;
}

function summon(
  state: MatchState,
  id: PlayerId,
  card: Card,
  slot?: number
): MinionInstance | undefined {
  const p = state.players[id];
  if (p.board.length >= BOARD_LIMIT) return undefined;
  const minion: MinionInstance = {
    instanceId: `m${state.nextInstanceId++}`,
    card,
    attack: card.attack ?? 0,
    health: card.health ?? 1,
    maxHealth: card.health ?? 1,
    keywords: [...card.keywords],
    divineShield: card.keywords.includes('DivineShield'),
    summonedThisTurn: true,
    attacksThisTurn: 0,
    frozen: false,
    silenced: false,
    buffed: false
  };
  const at =
    slot === undefined ? p.board.length : Math.min(Math.max(slot, 0), p.board.length);
  p.board.splice(at, 0, minion);
  emit(state, {
    type: 'summon',
    owner: id,
    instanceId: minion.instanceId,
    minion: snapshotMinion(minion),
    after: p.board[at - 1]?.instanceId ?? null
  });
  return minion;
}

// ── Combat ─────────────────────────────────────────────────────

export function attack(
  state: MatchState,
  id: PlayerId,
  attackerInstanceId: string,
  target: { kind: 'minion'; instanceId: string } | { kind: 'hero' }
): boolean {
  if (state.winner || state.current !== id) return false;

  const attacker = state.players[id].board.find((m) => m.instanceId === attackerInstanceId);
  if (!attacker || !canAttack(attacker)) return false;

  const defenderId = opponentOf(id);
  const allowed = legalTargets(state, defenderId);
  const chosen = allowed.find((c) =>
    target.kind === 'hero'
      ? c.kind === 'hero'
      : c.kind === 'minion' && c.minion.instanceId === target.instanceId
  );
  if (!chosen) return false;

  attacker.attacksThisTurn++;
  emit(state, {
    type: 'attack',
    owner: id,
    instanceId: attacker.instanceId,
    target:
      chosen.kind === 'hero'
        ? { kind: 'hero', owner: defenderId }
        : { kind: 'minion', instanceId: chosen.minion.instanceId }
  });
  emitTrigger(state, attacker, 'OnAttack');
  for (const effect of attacker.card.effects) {
    if (effect.trigger === 'OnAttack') resolveEffect(state, id, attacker, effect);
  }

  if (chosen.kind === 'hero') {
    state.log.push(`${attacker.card.name} hits ${defenderId} for ${attacker.attack}.`);
    damageHero(state, defenderId, attacker.attack);
  } else {
    const defender = chosen.minion;
    state.log.push(`${attacker.card.name} attacks ${defender.card.name}.`);
    const incoming = defender.attack;
    damageMinion(state, defender, attacker.attack);
    damageMinion(state, attacker, incoming);
  }

  checkDeaths(state);
  return true;
}

function damageMinion(state: MatchState, minion: MinionInstance, amount: number): void {
  if (amount <= 0) return;
  if (minion.divineShield) {
    minion.divineShield = false;
    minion.keywords = minion.keywords.filter((k) => k !== 'DivineShield');
    state.log.push(`${minion.card.name}'s Divine Shield absorbs the hit.`);
    emit(state, { type: 'shield', instanceId: minion.instanceId });
    return;
  }
  minion.health -= amount;
  emit(state, {
    type: 'damage',
    target: { kind: 'minion', instanceId: minion.instanceId },
    amount,
    health: minion.health
  });
}

function damageHero(state: MatchState, id: PlayerId, amount: number): void {
  if (amount <= 0) return;
  const p = state.players[id];
  // Armor soaks first and never goes negative.
  const absorbed = Math.min(p.armor, amount);
  p.armor -= absorbed;
  p.health -= amount - absorbed;
  emit(state, { type: 'damage', target: { kind: 'hero', owner: id }, amount, health: p.health, armor: p.armor });
  checkWinner(state);
}

function damageCharacter(state: MatchState, target: Character, amount: number): void {
  if (target.kind === 'hero') damageHero(state, target.owner, amount);
  else damageMinion(state, target.minion, amount);
}

function checkDeaths(state: MatchState): void {
  // Deathrattles can kill further minions, so settle the board repeatedly.
  let settled = false;
  while (!settled) {
    settled = true;
    for (const owner of ['player', 'ai'] as PlayerId[]) {
      const board = state.players[owner].board;
      const dead = board.filter((m) => m.health <= 0);
      if (dead.length === 0) continue;
      settled = false;
      state.players[owner].board = board.filter((m) => m.health > 0);
      for (const minion of dead) {
        state.log.push(`${minion.card.name} dies.`);
        // The flare comes first, while the minion is still there to flare.
        emitTrigger(state, minion, 'Deathrattle');
        emit(state, { type: 'death', owner, instanceId: minion.instanceId });
        for (const effect of minion.card.effects) {
          if (effect.trigger === 'Deathrattle') resolveEffect(state, owner, minion, effect);
        }
      }
    }
  }
  checkWinner(state);
}

function checkWinner(state: MatchState): void {
  if (state.winner) return;
  const playerDead = state.players.player.health <= 0;
  const aiDead = state.players.ai.health <= 0;
  if (playerDead && aiDead) state.winner = 'draw';
  else if (playerDead) state.winner = 'ai';
  else if (aiDead) state.winner = 'player';
  if (state.winner) state.log.push(`Game over — ${state.winner}.`);
}

// ── Effects ────────────────────────────────────────────────────

const HELPFUL = new Set(['Heal', 'BuffAttack', 'BuffHealth', 'GainKeyword']);

/**
 * `source` is the minion the effect came from, or undefined for spells.
 * Targets resolve automatically — no manual targeting in v0.1.
 */
function resolveTargets(
  state: MatchState,
  owner: PlayerId,
  source: MinionInstance | undefined,
  effect: Effect,
  rng: Rng
): Character[] {
  const foe = opponentOf(owner);
  const enemyBoard = state.players[foe].board;
  const friendlyBoard = state.players[owner].board;

  switch (effect.target) {
    case 'Self':
      return source
        ? [{ kind: 'minion', owner, minion: source }]
        : [{ kind: 'hero', owner }];

    // Helpful effects aimed at "Hero" mean your own; harmful ones mean theirs.
    case 'Hero':
      return [{ kind: 'hero', owner: HELPFUL.has(effect.action) ? owner : foe }];

    case 'AllFriendly':
      return friendlyBoard.map((minion) => ({ kind: 'minion' as const, owner, minion }));

    case 'SelfHero':
      return [{ kind: 'hero' as const, owner }];

    case 'AllEnemies':
      return [
        ...enemyBoard.map((minion) => ({ kind: 'minion' as const, owner: foe, minion })),
        { kind: 'hero' as const, owner: foe }
      ];

    default: {
      const pool = randomPool(state, owner, source, effect);
      const c = pool ? pick(rng, pool) : undefined;
      return c ? [c] : [];
    }
  }
}

/**
 * What a random target is drawn from, or null when the target is not random.
 *
 * Separate so the `effect` cue can name the candidates — the table flickers
 * across them before landing on the one chosen, which is the whole drama of a
 * random effect. The draw itself is one `pick` from this list, as it always was.
 */
function randomPool(
  state: MatchState,
  owner: PlayerId,
  source: MinionInstance | undefined,
  effect: Effect
): Character[] | null {
  const foe = opponentOf(owner);
  const enemyBoard = state.players[foe].board;
  const friendlyBoard = state.players[owner].board;
  const enemies = enemyBoard.map((minion) => ({ kind: 'minion' as const, owner: foe, minion }));

  switch (effect.target) {
    case 'EnemyMinion':
      return enemies;
    case 'FriendlyMinion': {
      const others = friendlyBoard.filter((m) => m !== source);
      return (others.length > 0 ? others : friendlyBoard).map((minion) => ({ kind: 'minion' as const, owner, minion }));
    }
    case 'RandomEnemy':
      return [...enemies, { kind: 'hero' as const, owner: foe }];
    default:
      return null;
  }
}

function resolveEffect(
  state: MatchState,
  owner: PlayerId,
  source: MinionInstance | undefined,
  effect: Effect,
  chosen?: Character,
  /**
   * True when this effect came from a **spell or a hero power**.
   *
   * Spell Damage applies to exactly those and nothing else — not a minion's
   * Battlecry, not a Deathrattle, not a weapon. Passing this explicitly rather
   * than inferring it from `source === undefined` is deliberate: the inference
   * happens to be right today and would silently break the first time anything
   * else resolves an effect without a source.
   */
  spellPowered = false
): void {
  const rng = rngFor(state);
  const bonus = spellPowered && effect.action === 'DealDamage' ? spellPowerOf(state.players[owner]) : 0;
  const value = (effect.value ?? 1) + bonus;

  // These act on the owner directly and need no target.
  if (effect.action === 'DrawCard') {
    for (let i = 0; i < value; i++) drawCard(state, owner);
    return;
  }
  if (effect.action === 'SummonToken') {
    // `condition` names a specific token; without one it is the generic 1/1, so
    // every card written before tokens existed behaves exactly as it did.
    const token = (effect.condition && tokenById(effect.condition)) || STUDY_NOTE;
    for (let i = 0; i < value; i++) summon(state, owner, token);
    return;
  }

  if (effect.action === 'GainArmor') {
    state.players[owner].armor += value;
    emit(state, { type: 'armor', owner, armor: state.players[owner].armor });
    return;
  }
  if (effect.action === 'GainMana') {
    const p = state.players[owner];
    p.mana = Math.min(MAX_MANA, p.mana + value);
    emit(state, { type: 'mana', owner, mana: p.mana });
    return;
  }

  // A `Chosen` effect resolves against what the player aimed at; everything else
  // is picked by the engine. playCard has already refused the card if the target
  // is missing or illegal, so this can never silently do nothing.
  const targets =
    effect.target === 'Chosen'
      ? chosen
        ? [chosen]
        : []
      : resolveTargets(state, owner, source, effect, rng);

  if (targets.length > 0) {
    const pool = effect.target === 'Chosen' ? null : randomPool(state, owner, source, effect);
    emit(state, {
      type: 'effect',
      owner,
      source: source ? { kind: 'minion', instanceId: source.instanceId } : null,
      action: effect.action,
      targets: targets.map(refOf),
      aim: effect.target === 'Chosen' ? 'chosen' : pool ? 'random' : 'auto',
      candidates: pool && pool.length > 1 ? pool.map(refOf) : undefined
    });
  }

  for (const target of targets) {
    switch (effect.action) {
      case 'DealDamage':
        damageCharacter(state, target, value);
        break;

      case 'Heal': {
        const holder = target.kind === 'hero' ? state.players[target.owner] : target.minion;
        const cap = target.kind === 'hero' ? HERO_HEALTH : target.minion.maxHealth;
        const before = holder.health;
        holder.health = Math.min(cap, holder.health + value);
        if (holder.health > before) {
          emit(state, { type: 'heal', target: refOf(target), amount: holder.health - before, health: holder.health });
        }
        break;
      }

      case 'BuffAttack':
        if (target.kind === 'minion') {
          target.minion.attack += value;
          target.minion.buffed = true;
          emitBuff(state, target.minion);
        }
        break;

      case 'BuffHealth':
        if (target.kind === 'minion') {
          target.minion.maxHealth += value;
          target.minion.health += value;
          target.minion.buffed = true;
          emitBuff(state, target.minion);
        }
        break;

      case 'Freeze':
        if (target.kind === 'minion') {
          target.minion.frozen = true;
          emit(state, { type: 'freeze', instanceId: target.minion.instanceId });
        }
        break;

      case 'Silence':
        if (target.kind === 'minion') {
          silence(target.minion);
          emit(state, { type: 'silence', instanceId: target.minion.instanceId });
        }
        break;

      case 'Destroy':
        if (target.kind === 'minion') target.minion.health = 0;
        break;

      case 'SwapStats':
        if (target.kind === 'minion') {
          const m = target.minion;
          const wasAttack = m.attack;
          m.attack = m.health;
          m.health = wasAttack;
          // maxHealth follows, or the minion reads as damaged the moment it swaps.
          m.maxHealth = Math.max(wasAttack, 1);
          m.buffed = true;
          emitBuff(state, m);
        }
        break;

      case 'GainKeyword': {
        // v0.3 gave Effect a real `keyword` field. Older cards carried it on
        // `condition`, so that is still read as a fallback.
        if (target.kind !== 'minion') break;
        const keyword = effect.keyword ?? effect.condition ?? 'Taunt';
        if (!target.minion.keywords.includes(keyword)) {
          target.minion.keywords.push(keyword);
          if (keyword === 'DivineShield') target.minion.divineShield = true;
          emit(state, {
            type: 'keyword',
            instanceId: target.minion.instanceId,
            keywords: [...target.minion.keywords],
            divineShield: target.minion.divineShield
          });
        }
        break;
      }
    }
  }
}

function emitBuff(state: MatchState, minion: MinionInstance): void {
  emit(state, {
    type: 'buff',
    instanceId: minion.instanceId,
    attack: minion.attack,
    health: minion.health,
    maxHealth: minion.maxHealth
  });
}
