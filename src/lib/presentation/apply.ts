import type { CueRef, GameEvent } from '../engine/events';
import type { PlayerView, SerialisedMinion } from '../net/protocol';

/**
 * The board on screen, moved forward by one cue.
 *
 * The table used to draw the authoritative view the moment it arrived and then
 * replay cues over it — so a minion that died was already gone before its death
 * cue played, and a health gem dropped before the hit landed. Now the table
 * draws `shown`, and playback walks it towards the view one cue at a time.
 *
 * Every cue carries what it produced (health after a hit, the minion summoned,
 * mana after a card), so this needs nothing but the cue. `apply.test.ts` folds
 * whole matches through it and asserts it lands exactly where the engine did.
 *
 * Two things it deliberately does not track:
 *  - **your hand's contents** — a `draw` never names its card, because both
 *    players receive every cue. The table reads your hand from the view;
 *  - **who won**, and the input flags (`canHeroAttack`, `canUseHeroPower`) —
 *    nothing is clickable during playback, and the table syncs to the view
 *    when it ends.
 *
 * Pure: no DOM, no timers. `death` removes the minion outright — the table
 * plays the shatter first and applies the cue after it.
 */
export function applyCue(shown: PlayerView, cue: GameEvent): PlayerView {
  const sideOf = (owner: string): Side => (owner === shown.you ? 'me' : 'foe');

  switch (cue.type) {
    case 'turn': {
      const s = sideOf(cue.owner);
      const next = patchSide(shown, s, {
        mana: cue.mana,
        maxMana: cue.maxMana,
        heroPowerUsed: false,
        board: shown[s].board.map((m) => ({ ...m, summonedThisTurn: false, attacksThisTurn: 0, frozen: false }))
      });
      return { ...next, turn: cue.owner, turnNumber: cue.turnNumber };
    }

    case 'draw': {
      const s = sideOf(cue.owner);
      if (s === 'me') return patchSide(shown, 'me', { deckCount: cue.deckCount });
      return patchSide(shown, 'foe', { deckCount: cue.deckCount, handCount: shown.foe.handCount + 1 });
    }

    case 'burn':
      return patchSide(shown, sideOf(cue.owner), { deckCount: cue.deckCount });

    case 'play': {
      const s = sideOf(cue.owner);
      if (s === 'me') return patchSide(shown, 'me', { mana: cue.mana });
      return patchSide(shown, 'foe', { mana: cue.mana, handCount: Math.max(0, shown.foe.handCount - 1) });
    }

    case 'mana':
      return patchSide(shown, sideOf(cue.owner), { mana: cue.mana });

    case 'summon': {
      const s = sideOf(cue.owner);
      if (shown[s].board.some((m) => m.instanceId === cue.instanceId)) return shown;
      return withSpellDamage(patchSide(shown, s, { board: insertAfter(shown[s].board, cue.minion, cue.after) }));
    }

    case 'attack':
      return mapMinion(shown, cue.instanceId, (m) => ({ ...m, attacksThisTurn: m.attacksThisTurn + 1 }));

    case 'damage':
    case 'heal':
      return setHealth(shown, cue.target, cue.health, cue.type === 'damage' ? cue.armor : undefined);

    case 'shield':
      return mapMinion(shown, cue.instanceId, (m) => ({
        ...m,
        divineShield: false,
        keywords: m.keywords.filter((k) => k !== 'DivineShield')
      }));

    case 'death': {
      const s = sideOf(cue.owner);
      return withSpellDamage(
        patchSide(shown, s, { board: shown[s].board.filter((m) => m.instanceId !== cue.instanceId) })
      );
    }

    case 'freeze':
      return mapMinion(shown, cue.instanceId, (m) => ({ ...m, frozen: true }));

    case 'silence':
      return withSpellDamage(
        mapMinion(shown, cue.instanceId, (m) => ({ ...m, silenced: true, keywords: [], divineShield: false, doomed: false }))
      );

    case 'doom':
      return mapMinion(shown, cue.instanceId, (m) => ({ ...m, doomed: true }));

    case 'stage':
      return mapMinion(shown, cue.instanceId, (m) => ({ ...m, stage: cue.stage }));

    case 'buff':
      return mapMinion(shown, cue.instanceId, (m) => ({
        ...m,
        attack: cue.attack,
        health: cue.health,
        maxHealth: cue.maxHealth,
        buffed: true
      }));

    case 'keyword':
      return mapMinion(shown, cue.instanceId, (m) => ({
        ...m,
        keywords: [...cue.keywords],
        divineShield: cue.divineShield
      }));

    case 'equip':
      return patchSide(shown, sideOf(cue.owner), { weapon: { ...cue.weapon } });

    case 'heroAttack': {
      const s = sideOf(cue.owner);
      const weapon = shown[s].weapon;
      return weapon ? patchSide(shown, s, { weapon: { ...weapon, durability: cue.durability } }) : shown;
    }

    case 'weaponBreak':
      return patchSide(shown, sideOf(cue.owner), { weapon: null });

    case 'armor':
      return patchSide(shown, sideOf(cue.owner), { armor: cue.armor });

    case 'heroPower':
      return patchSide(shown, sideOf(cue.owner), { heroPowerUsed: true, mana: cue.mana });

    case 'bounce': {
      const s = sideOf(cue.owner);
      const board = shown[s].board.filter((m) => m.instanceId !== cue.instanceId);
      // Your own hand is read from the view; theirs is only ever a count.
      return withSpellDamage(patchSide(shown, s, s === 'foe' ? { board, handCount: cue.handCount } : { board }));
    }

    case 'transform':
      return withSpellDamage(mapMinion(shown, cue.instanceId, () => ({ ...cue.minion, keywords: [...cue.minion.keywords] })));

    case 'trigger':
    case 'effect':
    case 'fatigue':
      return shown;
  }
}

/**
 * The parts of a view that playback is responsible for, flattened for
 * comparison. The table warns when `shown` and the view disagree on any of
 * these after a drain; the replay test fails on it.
 */
export function presented(view: PlayerView) {
  const minion = (m: SerialisedMinion) => ({
    instanceId: m.instanceId,
    cardId: m.card.id,
    attack: m.attack,
    health: m.health,
    maxHealth: m.maxHealth,
    keywords: [...m.keywords],
    divineShield: m.divineShield,
    summonedThisTurn: m.summonedThisTurn,
    attacksThisTurn: m.attacksThisTurn,
    frozen: m.frozen,
    silenced: m.silenced,
    buffed: m.buffed,
    doomed: !!m.doomed,
    stage: m.stage ?? 0
  });
  const side = (s: PlayerView['me'] | PlayerView['foe']) => ({
    health: s.health,
    armor: s.armor,
    mana: s.mana,
    maxMana: s.maxMana,
    deckCount: s.deckCount,
    weapon: s.weapon ? { ...s.weapon } : null,
    heroPowerUsed: s.heroPowerUsed,
    spellDamage: s.spellDamage,
    board: s.board.map(minion)
  });
  return {
    turn: view.turn,
    turnNumber: view.turnNumber,
    me: side(view.me),
    foe: { ...side(view.foe), handCount: view.foe.handCount }
  };
}

/** Dotted paths where two views differ in what playback presents. Empty means agreed. */
export function presentedDiff(a: PlayerView, b: PlayerView): string[] {
  const out: string[] = [];
  const walk = (x: unknown, y: unknown, path: string) => {
    if (x !== null && y !== null && typeof x === 'object' && typeof y === 'object') {
      const keys = new Set([...Object.keys(x), ...Object.keys(y)]);
      for (const k of keys) walk((x as Record<string, unknown>)[k], (y as Record<string, unknown>)[k], `${path}.${k}`);
    } else if (x !== y) {
      out.push(`${path.slice(1)}: ${JSON.stringify(x)} → ${JSON.stringify(y)}`);
    }
  };
  walk(presented(a), presented(b), '');
  return out;
}

type Side = 'me' | 'foe';

function patchSide<S extends Side>(view: PlayerView, side: S, patch: Partial<PlayerView[S]>): PlayerView {
  return { ...view, [side]: { ...view[side], ...patch } };
}

function mapMinion(
  view: PlayerView,
  instanceId: string,
  fn: (m: SerialisedMinion) => SerialisedMinion
): PlayerView {
  for (const side of ['me', 'foe'] as const) {
    if (view[side].board.some((m) => m.instanceId === instanceId)) {
      return patchSide(view, side, {
        board: view[side].board.map((m) => (m.instanceId === instanceId ? fn(m) : m))
      });
    }
  }
  return view;
}

function setHealth(view: PlayerView, target: CueRef, health: number, armor?: number): PlayerView {
  if (target.kind === 'minion') return mapMinion(view, target.instanceId, (m) => ({ ...m, health }));
  const side: Side = target.owner === view.you ? 'me' : 'foe';
  return patchSide(view, side, armor === undefined ? { health } : { health, armor });
}

/**
 * Spell Damage is derived from the board — the sum of its unsilenced minions'
 * — exactly as `spellPowerOf` derives it in the engine, so it moves whenever
 * the board does.
 */
function withSpellDamage(view: PlayerView): PlayerView {
  const sum = (board: SerialisedMinion[]) =>
    board.reduce((total, m) => total + (m.silenced ? 0 : (m.card.spellDamage ?? 0)), 0);
  return {
    ...view,
    me: { ...view.me, spellDamage: sum(view.me.board) },
    foe: { ...view.foe, spellDamage: sum(view.foe.board) }
  };
}

/**
 * Inserts a summoned minion after the neighbour it landed beside.
 *
 * Not by index: a minion dying in the same batch is still on screen until its
 * own death cue, so the engine's index would be off by however many are
 * waiting to shatter. Its left neighbour, though, is alive and shown.
 */
function insertAfter(
  board: SerialisedMinion[],
  minion: SerialisedMinion,
  after: string | null
): SerialisedMinion[] {
  const fresh = { ...minion, keywords: [...minion.keywords] };
  if (after === null) return [fresh, ...board];
  const index = board.findIndex((m) => m.instanceId === after);
  if (index < 0) return [...board, fresh];
  return [...board.slice(0, index + 1), fresh, ...board.slice(index + 1)];
}
