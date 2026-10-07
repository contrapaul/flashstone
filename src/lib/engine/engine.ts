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
  aimsAtMinions,
  findMinion,
  spellPowerOf,
  legalTargets,
  opponentOf,
  silence,
  snapshotMinion,
  snapshotWeapon,
  spellTargets,
  type Character,
  type HistoryEntry,
  type HistoryTarget,
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
    heroPowerUsedThisTurn: false,
    graveyard: []
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
    history: [],
    openEntry: null,
    stamp: null,
    lastHit: {},
    reactions: [],
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
  // The first cue of a new history entry carries its number.
  if (state.stamp !== null) {
    event = { ...event, entry: state.stamp };
    state.stamp = null;
  }
  state.events.push(event);
  record(state, event);
}

// ── History ────────────────────────────────────────────────────

/**
 * Opens a history entry for an action, unless one is already open — in which
 * case this action is part of it (a Battlecry's damage, a Deathrattle's
 * summon) and returns false, so the caller knows not to close it.
 */
function openEntry(
  state: MatchState,
  entry: Omit<HistoryEntry, 'n' | 'turn' | 'targets'>
): boolean {
  if (state.openEntry !== null) return false;
  const n = state.history.length;
  state.history.push({ ...entry, n, turn: state.turnNumber, targets: [] });
  state.openEntry = n;
  state.stamp = n;
  return true;
}

function closeEntry(state: MatchState, opened: boolean): void {
  if (!opened) return;
  state.openEntry = null;
  state.stamp = null;
}

/** Adds a result to an entry, merging repeats of the same result on the same thing. */
function note(state: MatchState, index: number | null, target: Omit<HistoryTarget, 'name' | 'cardId'>, card?: Card): void {
  if (index === null) return;
  const entry = state.history[index];
  if (!entry) return;
  const same = (t: HistoryTarget) =>
    t.result === target.result &&
    (t.ref.kind === 'hero'
      ? target.ref.kind === 'hero' && t.ref.owner === target.ref.owner
      : target.ref.kind === 'minion' && t.ref.instanceId === target.ref.instanceId);
  const existing = entry.targets.find(same);
  if (existing) {
    if (target.amount !== undefined) existing.amount = (existing.amount ?? 0) + target.amount;
    return;
  }
  const ref = target.ref;
  const minion = ref.kind === 'minion' ? findMinion(state, ref.instanceId)?.minion : undefined;
  const shown = card ?? minion?.card;
  entry.targets.push({
    ...target,
    cardId: target.ref.kind === 'minion' ? shown?.id : undefined,
    name: target.ref.kind === 'minion' ? (shown?.name ?? 'Minion') : 'Hero'
  });
}

/** Folds what a cue did into the entry being written. */
function record(state: MatchState, event: GameEvent): void {
  const index = state.openEntry;
  if (index === null) return;
  switch (event.type) {
    case 'damage':
      if (event.target.kind === 'minion') state.lastHit[event.target.instanceId] = index;
      return note(state, index, { ref: event.target, result: 'damage', amount: event.amount });
    case 'heal':
      return note(state, index, { ref: event.target, result: 'heal', amount: event.amount });
    case 'shield':
      return note(state, index, { ref: { kind: 'minion', instanceId: event.instanceId }, result: 'shielded' });
    case 'freeze':
      return note(state, index, { ref: { kind: 'minion', instanceId: event.instanceId }, result: 'frozen' });
    case 'silence':
      return note(state, index, { ref: { kind: 'minion', instanceId: event.instanceId }, result: 'silenced' });
    case 'buff':
    case 'keyword':
      return note(state, index, { ref: { kind: 'minion', instanceId: event.instanceId }, result: 'buff' });
    case 'armor':
      return note(state, index, { ref: { kind: 'hero', owner: event.owner }, result: 'armor' });
    case 'summon':
      // The minion a card *is* is not something it did.
      if (event.minion.card.id === state.history[index]?.cardId) return;
      return note(state, index, { ref: { kind: 'minion', instanceId: event.instanceId }, result: 'summoned' }, event.minion.card);
  }
}

function refOf(target: Character): CueRef {
  return target.kind === 'hero'
    ? { kind: 'hero', owner: target.owner }
    : { kind: 'minion', instanceId: target.minion.instanceId };
}

/**
 * A minion's text for one trigger — none at all once it is silenced. Every
 * trigger is read through this, so silence stops a Deathrattle or a turn
 * trigger exactly as it stops a keyword.
 */
function effectsFor(minion: MinionInstance, trigger: Trigger): Effect[] {
  if (minion.silenced) return [];
  const stage = minion.stage ?? 0;
  return minion.card.effects.filter((e) => e.trigger === trigger && (e.stage === undefined || e.stage === stage));
}

/** After staged text fires, the next stage comes round. */
function advanceStage(state: MatchState, minion: MinionInstance, trigger: Trigger): void {
  const stages = minion.card.effects.filter((e) => e.trigger === trigger && e.stage !== undefined);
  if (stages.length === 0 || minion.silenced) return;
  const count = Math.max(...stages.map((e) => e.stage ?? 0)) + 1;
  minion.stage = ((minion.stage ?? 0) + 1) % count;
  emit(state, { type: 'stage', instanceId: minion.instanceId, stage: minion.stage });
}

/** Lights a minion's text before it fires, when it has any for this trigger. */
function emitTrigger(state: MatchState, minion: MinionInstance, trigger: Trigger): void {
  if (effectsFor(minion, trigger).length > 0) {
    emit(state, { type: 'trigger', instanceId: minion.instanceId, trigger });
  }
}

/** Queues a reaction for every minion on a side with text for this trigger (but `except` one). */
function react(state: MatchState, owner: PlayerId, trigger: Trigger, except?: MinionInstance): void {
  for (const minion of state.players[owner].board) {
    if (minion !== except && effectsFor(minion, trigger).length > 0) {
      state.reactions.push({ owner, instanceId: minion.instanceId, trigger });
    }
  }
}

/** Fires the oldest queued reaction, if its minion is still there to make it. */
function fireReaction(state: MatchState): void {
  const next = state.reactions.shift();
  if (!next) return;
  const minion = state.players[next.owner].board.find((m) => m.instanceId === next.instanceId);
  if (!minion || minion.health <= 0) return;
  emitTrigger(state, minion, next.trigger);
  for (const effect of effectsFor(minion, next.trigger)) resolveEffect(state, next.owner, minion, effect);
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
  // Whose turn it is decides some auras ("during your opponent's turn").
  refreshAuras(state);
  drawCard(state, id);
  triggerBoard(state, id, 'StartOfTurn');
}

export function endTurn(state: MatchState): void {
  if (state.winner) return;
  const id = state.current;
  triggerBoard(state, id, 'EndOfTurn');
  if (state.winner) return;
  expireDoomed(state);
  if (state.winner) return;
  startTurn(state, opponentOf(id));
}

/** Minions whose time is up at the end of this turn. The card that marked them gets the kill. */
function expireDoomed(state: MatchState): void {
  let any = false;
  for (const owner of ['player', 'ai'] as PlayerId[]) {
    for (const minion of state.players[owner].board) {
      if (minion.doomAt === state.turnNumber) {
        minion.health = 0;
        any = true;
      }
    }
  }
  if (any) checkDeaths(state);
}

function triggerBoard(state: MatchState, id: PlayerId, trigger: Trigger): void {
  // Snapshot: effects can kill minions mid-loop.
  for (const minion of [...state.players[id].board]) {
    if (!state.players[id].board.includes(minion)) continue;
    const effects = effectsFor(minion, trigger);
    const opened = effects.length > 0 && openEntry(state, { actor: id, kind: 'trigger', cardId: minion.card.id, name: minion.card.name, trigger });
    emitTrigger(state, minion, trigger);
    for (const effect of effects) resolveEffect(state, id, minion, effect);
    advanceStage(state, minion, trigger);
    closeEntry(state, opened);
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
    const opened = openEntry(state, { actor: id, kind: 'fatigue', name: 'Fatigue', amount: p.fatigue });
    emit(state, { type: 'fatigue', owner: id, amount: p.fatigue });
    damageHero(state, id, p.fatigue);
    closeEntry(state, opened);
    return;
  }
  if (p.hand.length >= HAND_LIMIT) {
    state.log.push(`${id}'s hand is full — ${card.name} burned.`);
    const opened = openEntry(state, { actor: id, kind: 'burn', cardId: card.id, name: card.name, cardType: card.type });
    emit(state, { type: 'burn', owner: id, card, deckCount: p.deck.length });
    closeEntry(state, opened);
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
  const opened = openEntry(state, { actor: id, kind: 'play', cardId: card.id, name: card.name, cardType: card.type });
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
  if (card.type === 'Spell') react(state, id, 'OnFriendlySpell');
  if (summoned) react(state, id, 'OnFriendlyPlay', summoned);

  checkDeaths(state);
  closeEntry(state, opened);
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
  const opened = openEntry(state, { actor: id, kind: 'heroPower', name: power.name, heroClass: p.heroClass });
  emit(state, { type: 'heroPower', owner: id, mana: p.mana });

  for (const effect of power.effects(state, id)) {
    resolveEffect(state, id, undefined, effect, chosen, true);
  }

  checkDeaths(state);
  closeEntry(state, opened);
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
  const legal = spellTargets(state, caster, card.targeting ?? 'any', aimsAtMinions(card));
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
  const opened = openEntry(state, { actor: id, kind: 'attack', cardId: p.weapon.card.id, name: p.weapon.card.name, cardType: 'Weapon' });
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
  closeEntry(state, opened);
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
  const opened = openEntry(state, { actor: id, kind: 'attack', cardId: attacker.card.id, name: attacker.card.name, cardType: 'Minion' });
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
  for (const effect of effectsFor(attacker, 'OnAttack')) resolveEffect(state, id, attacker, effect);

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
  closeEntry(state, opened);
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
  // Whether it survived is decided when the reaction fires, after the action settles.
  const owner = findMinion(state, minion.instanceId)?.owner;
  if (owner && effectsFor(minion, 'OnDamaged').length > 0) {
    state.reactions.push({ owner, instanceId: minion.instanceId, trigger: 'OnDamaged' });
  }
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

// ── Auras ──────────────────────────────────────────────────────

/** What every minion's aura bonus should be now, from the Passive text in play. */
function auraBonus(state: MatchState, owner: PlayerId, minion: MinionInstance) {
  const bonus = { attack: 0, health: 0 };
  for (const source of state.players[owner].board) {
    for (const effect of effectsFor(source, 'Passive')) {
      if (effect.condition === 'opponents_turn' && state.current === owner) continue;
      const covers =
        effect.target === 'AllFriendly' ||
        (effect.target === 'OtherFriendly' && source !== minion) ||
        ((effect.target ?? 'Self') === 'Self' && source === minion);
      if (!covers) continue;
      if (effect.action === 'BuffAttack') bonus.attack += effect.value ?? 1;
      if (effect.action === 'BuffHealth') bonus.health += effect.value ?? 1;
    }
  }
  return bonus;
}

/**
 * Brings every minion's aura bonus up to date — a derived layer over its stats,
 * not a buff: it is taken off again when its source leaves, is silenced, or its
 * condition lapses. Losing Health this way lowers the most it can have, and
 * never kills: what it has is only cut to the new most.
 */
function refreshAuras(state: MatchState): void {
  for (const owner of ['player', 'ai'] as PlayerId[]) {
    for (const minion of state.players[owner].board) {
      const want = auraBonus(state, owner, minion);
      const had = minion.aura ?? { attack: 0, health: 0 };
      const dA = want.attack - had.attack;
      const dH = want.health - had.health;
      if (dA === 0 && dH === 0) continue;
      minion.attack = Math.max(0, minion.attack + dA);
      minion.maxHealth += dH;
      minion.health = dH > 0 ? minion.health + dH : Math.min(minion.health, minion.maxHealth);
      minion.aura = want;
      minion.buffed = true;
      emitBuff(state, minion);
    }
  }
}

/** Enough for any real chain of reactions; a loop between two minions stops here. */
const MAX_REACTIONS = 100;

function checkDeaths(state: MatchState): void {
  // Deathrattles and reactions can kill further minions, so settle the board
  // repeatedly: deaths first, then one reaction, then deaths again.
  let settled = false;
  let reactions = 0;
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
        state.players[owner].graveyard.push(minion.card);
        // Credited to the action still being written or, for a death settled
        // after a turn's triggers, to the trigger that last hit it.
        note(state, state.openEntry ?? state.lastHit[minion.instanceId] ?? null, { ref: { kind: 'minion', instanceId: minion.instanceId }, result: 'killed' }, minion.card);
        delete state.lastHit[minion.instanceId];
        // The flare comes first, while the minion is still there to flare.
        emitTrigger(state, minion, 'Deathrattle');
        emit(state, { type: 'death', owner, instanceId: minion.instanceId });
        for (const effect of effectsFor(minion, 'Deathrattle')) resolveEffect(state, owner, minion, effect);
        react(state, owner, 'OnFriendlyDeath');
      }
    }
    if (settled && state.reactions.length > 0 && !state.winner) {
      settled = false;
      if (++reactions > MAX_REACTIONS) state.reactions = [];
      else fireReaction(state);
    }
  }
  state.reactions = [];
  refreshAuras(state);
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

    case 'AllMinions':
      return [
        ...friendlyBoard.map((minion) => ({ kind: 'minion' as const, owner, minion })),
        ...enemyBoard.map((minion) => ({ kind: 'minion' as const, owner: foe, minion }))
      ];

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

  if (effect.action === 'Resummon') {
    // The most recent first, as far as the board has room.
    const fallen = state.players[owner].graveyard.slice(-value).reverse();
    for (const card of fallen) summon(state, owner, card);
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
        if (target.kind === 'minion') {
          target.minion.health = 0;
          if (state.openEntry !== null) state.lastHit[target.minion.instanceId] = state.openEntry;
        }
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

      case 'ReturnToHand':
        if (target.kind === 'minion') returnToHand(state, target.owner, target.minion);
        break;

      case 'DestroyLater':
        if (target.kind === 'minion') {
          // Cast on your turn, so the opponent's next turn is the one after this.
          target.minion.doomAt = state.turnNumber + 1;
          if (state.openEntry !== null) state.lastHit[target.minion.instanceId] = state.openEntry;
          note(state, state.openEntry, { ref: { kind: 'minion', instanceId: target.minion.instanceId }, result: 'doomed' });
          emit(state, { type: 'doom', instanceId: target.minion.instanceId });
        }
        break;

      case 'Transform':
        if (target.kind === 'minion') transform(state, target.minion, (effect.condition && tokenById(effect.condition)) || STUDY_NOTE);
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

/**
 * Back to its owner's hand, as the card it was — fresh, its buffs and damage
 * gone. A copy, so two Study Notes coming back are two cards, not one twice.
 * With the hand full it is lost, as in Hearthstone. Works on a minion already
 * dead, too: Shape Memory Material's Deathrattle returns it from the grave.
 */
function returnToHand(state: MatchState, owner: PlayerId, minion: MinionInstance): void {
  const p = state.players[owner];
  note(state, state.openEntry, { ref: { kind: 'minion', instanceId: minion.instanceId }, result: 'returned' }, minion.card);
  const at = p.board.indexOf(minion);
  if (at >= 0) p.board.splice(at, 1);
  const lost = p.hand.length >= HAND_LIMIT;
  if (!lost) p.hand.push({ ...minion.card });
  state.log.push(`${minion.card.name} returns to ${owner}'s hand${lost ? ', which is full' : ''}.`);
  emit(state, { type: 'bounce', owner, instanceId: minion.instanceId, handCount: p.hand.length, lost });
}

/** Becomes `into` where it stands: a new minion in all but its place on the board. */
function transform(state: MatchState, minion: MinionInstance, into: Card): void {
  note(state, state.openEntry, { ref: { kind: 'minion', instanceId: minion.instanceId }, result: 'transformed' }, minion.card);
  state.log.push(`${minion.card.name} becomes ${into.name}.`);
  minion.card = into;
  minion.attack = into.attack ?? 0;
  minion.health = minion.maxHealth = into.health ?? 1;
  minion.keywords = [...into.keywords];
  minion.divineShield = into.keywords.includes('DivineShield');
  minion.frozen = false;
  minion.silenced = false;
  minion.buffed = false;
  minion.summonedThisTurn = true;
  delete minion.doomAt;
  delete minion.stage;
  delete minion.aura;
  emit(state, { type: 'transform', instanceId: minion.instanceId, minion: snapshotMinion(minion) });
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
