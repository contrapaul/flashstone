import type { GameEvent } from '../engine/events';
import { HERO_POWER_COST, MAX_MANA } from '../engine/state';
import type { PlayerView, SerialisedMinion } from '../net/protocol';

/**
 * The board on screen, moved forward by one cue.
 *
 * The table used to draw the authoritative view the moment it arrived and then
 * replay cues over it — so a minion that died was already gone before its death
 * cue played, and a health gem dropped before the hit landed. Now the table
 * draws `shown`, and playback walks it towards the view one cue at a time.
 *
 * Cues today carry *what happened* but rarely *what it produced*, so anything
 * a cue does not say is read from `target`, the view being walked towards
 * (a summoned minion, a buff's new stats, an equipped weapon). That is an
 * approximation — a minion buffed and then damaged in the same batch shows its
 * final health a moment early — and the table snaps `shown` to the view when
 * playback ends, so no approximation outlives a drain. REVISIONS.md R1.1 has
 * cues carry their results, at which point `target` stops being needed.
 *
 * Pure: no DOM, no timers. `death` removes the minion outright — the table
 * plays the shatter first and applies the cue after it.
 */
export function applyCue(shown: PlayerView, cue: GameEvent, target: PlayerView): PlayerView {
  const sideOf = (owner: string): Side => (owner === shown.you ? 'me' : 'foe');

  switch (cue.type) {
    case 'turn': {
      const s = sideOf(cue.owner);
      const maxMana = Math.min(MAX_MANA, shown[s].maxMana + 1);
      const next = patchSide(shown, s, {
        maxMana,
        mana: maxMana,
        heroPowerUsed: false,
        board: shown[s].board.map((m) => ({ ...m, summonedThisTurn: false, attacksThisTurn: 0, frozen: false }))
      });
      return { ...next, turn: cue.owner, turnNumber: shown.turnNumber + 1 };
    }

    case 'draw': {
      const s = sideOf(cue.owner);
      const deckCount = Math.max(0, shown[s].deckCount - 1);
      if (s === 'me') return patchSide(shown, 'me', { deckCount });
      return patchSide(shown, 'foe', { deckCount, handCount: shown.foe.handCount + 1 });
    }

    case 'play': {
      const s = sideOf(cue.owner);
      const mana = Math.max(0, shown[s].mana - cue.card.cost);
      if (s === 'me') return patchSide(shown, 'me', { mana });
      return patchSide(shown, 'foe', { mana, handCount: Math.max(0, shown.foe.handCount - 1) });
    }

    case 'summon': {
      const s = sideOf(cue.owner);
      const minion = target[s].board.find((m) => m.instanceId === cue.instanceId);
      // Summoned and gone again inside one batch: nothing left to show.
      if (!minion || shown[s].board.some((m) => m.instanceId === cue.instanceId)) return shown;
      return patchSide(shown, s, { board: insertInOrder(shown[s].board, minion, target[s].board) });
    }

    case 'damage': {
      if (cue.target.kind === 'hero') {
        const s = sideOf(cue.target.owner);
        const absorbed = Math.min(shown[s].armor, cue.amount);
        return patchSide(shown, s, {
          armor: shown[s].armor - absorbed,
          health: shown[s].health - (cue.amount - absorbed)
        });
      }
      const amount = cue.amount;
      return mapMinion(shown, cue.target.instanceId, (m) => ({ ...m, health: m.health - amount }));
    }

    case 'shield':
      return mapMinion(shown, cue.instanceId, (m) => ({
        ...m,
        divineShield: false,
        keywords: m.keywords.filter((k) => k !== 'DivineShield')
      }));

    case 'death': {
      const s = sideOf(cue.owner);
      return patchSide(shown, s, { board: shown[s].board.filter((m) => m.instanceId !== cue.instanceId) });
    }

    case 'freeze':
      return mapMinion(shown, cue.instanceId, (m) => ({ ...m, frozen: true }));

    case 'silence':
      return mapMinion(shown, cue.instanceId, (m) => ({
        ...m,
        silenced: true,
        keywords: [],
        divineShield: false
      }));

    case 'buff': {
      const after = findMinion(target, cue.instanceId);
      return mapMinion(shown, cue.instanceId, (m) =>
        after
          ? {
              ...m,
              attack: after.attack,
              health: after.health,
              maxHealth: after.maxHealth,
              keywords: after.keywords,
              buffed: true
            }
          : { ...m, buffed: true }
      );
    }

    case 'equip': {
      const s = sideOf(cue.owner);
      return patchSide(shown, s, { weapon: target[s].weapon });
    }

    case 'weaponBreak':
      return patchSide(shown, sideOf(cue.owner), { weapon: null });

    case 'armor': {
      const s = sideOf(cue.owner);
      return patchSide(shown, s, { armor: target[s].armor });
    }

    case 'heroPower': {
      const s = sideOf(cue.owner);
      return patchSide(shown, s, {
        heroPowerUsed: true,
        mana: Math.max(0, shown[s].mana - HERO_POWER_COST)
      });
    }

    case 'attack':
    case 'heroAttack':
      return shown;
  }
}

type Side = 'me' | 'foe';

function patchSide<S extends Side>(view: PlayerView, side: S, patch: Partial<PlayerView[S]>): PlayerView {
  return { ...view, [side]: { ...view[side], ...patch } };
}

function findMinion(view: PlayerView, instanceId: string): SerialisedMinion | undefined {
  return (
    view.me.board.find((m) => m.instanceId === instanceId) ??
    view.foe.board.find((m) => m.instanceId === instanceId)
  );
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

/**
 * Inserts a summoned minion where it ends up relative to its neighbours.
 *
 * Its index in the final board is no use on its own: minions that die later in
 * the batch are still on screen, and minions summoned later are not yet. So it
 * goes in after the nearest minion to its left that is already shown.
 */
function insertInOrder(
  board: SerialisedMinion[],
  minion: SerialisedMinion,
  finalBoard: SerialisedMinion[]
): SerialisedMinion[] {
  const at = finalBoard.findIndex((m) => m.instanceId === minion.instanceId);
  for (let i = at - 1; i >= 0; i--) {
    const index = board.findIndex((m) => m.instanceId === finalBoard[i].instanceId);
    if (index >= 0) return [...board.slice(0, index + 1), minion, ...board.slice(index + 1)];
  }
  return [minion, ...board];
}
