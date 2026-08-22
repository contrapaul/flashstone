import { attack, canPlayCard, endTurn, heroAttack, needsTarget, playCard } from './engine';
import {
  canAttack,
  canHeroAttack,
  legalTargets,
  opponentOf,
  spellTargets,
  type Character,
  type MatchState,
  type MinionInstance
} from './state';
import type { Card } from '../../types/cards';

/**
 * Heuristic opponent: spend the curve, clear Taunts, take free trades,
 * otherwise hit face. Deliberately simple — it should be beatable.
 */
export function playAiTurn(state: MatchState): void {
  if (state.winner || state.current !== 'ai') return;
  spendMana(state);
  swing(state);
  if (!state.winner) endTurn(state);
}

function spendMana(state: MatchState): void {
  const hand = () => state.players.ai.hand;

  // The Coin is only worth it when it unlocks something right now.
  const coinIndex = hand().findIndex((c) => c.name === 'The Coin');
  if (coinIndex >= 0) {
    const mana = state.players.ai.mana;
    const unlocks = hand().some((c) => c.name !== 'The Coin' && c.cost === mana + 1);
    if (unlocks) playCard(state, 'ai', coinIndex);
  }

  // Greedily play the most expensive affordable card until nothing fits.
  let played = true;
  while (played && !state.winner) {
    played = false;
    let best = -1;
    let bestCost = -1;
    hand().forEach((card, i) => {
      if (card.name === 'The Coin') return;
      if (!canPlayCard(state, 'ai', i)) return;
      if (card.cost > bestCost) {
        bestCost = card.cost;
        best = i;
      }
    });
    if (best >= 0) {
      const card = hand()[best];
      // A card that must be aimed needs a target chosen before it is played, or
      // the engine refuses it and the loop spins on the same card forever.
      const chosen = needsTarget(card) ? chooseSpellTarget(state, card) : undefined;
      played = needsTarget(card) && !chosen ? false : playCard(state, 'ai', best, undefined, chosen);
      // Nothing legal to aim at: drop the card from consideration this turn by
      // treating the pass as spent, rather than looping.
      if (!played) break;
    }
  }
}

/**
 * Where the AI points a targeted spell.
 *
 * Crude on purpose, and matched to the effect rather than the card: damage goes
 * at the biggest thing it kills outright (else the enemy hero), removal at the
 * biggest enemy minion, and anything helpful at its own strongest minion.
 */
function chooseSpellTarget(state: MatchState, card: Card): Character | undefined {
  const side = card.targeting ?? 'any';
  const legal = spellTargets(state, 'ai', side);
  if (legal.length === 0) return undefined;

  const effect = card.effects.find((e) => e.target === 'Chosen');
  const action = effect?.action ?? 'DealDamage';
  const value = effect?.value ?? 0;

  const enemyMinions = legal.flatMap((t) =>
    t.kind === 'minion' && t.owner === 'player' ? [t] : []
  );
  const ownMinions = legal.flatMap((t) => (t.kind === 'minion' && t.owner === 'ai' ? [t] : []));
  const enemyHero = legal.find((t) => t.kind === 'hero' && t.owner === 'player');
  const ownHero = legal.find((t) => t.kind === 'hero' && t.owner === 'ai');

  const HELPFUL = ['Heal', 'BuffAttack', 'BuffHealth', 'GainKeyword'];
  if (HELPFUL.includes(action)) {
    if (action === 'Heal') {
      // Healing is only worth a card when there is damage to undo.
      const hurt = ownMinions.find((t) => t.minion.health < t.minion.maxHealth);
      if (hurt) return hurt;
      const hero = state.players.ai;
      return hero.health < 25 ? ownHero : (ownMinions[0] ?? ownHero);
    }
    const biggest = [...ownMinions].sort((a, b) => b.minion.attack - a.minion.attack)[0];
    return biggest ?? ownHero ?? legal[0];
  }

  if (action === 'Destroy' || action === 'Silence') {
    const biggest = [...enemyMinions].sort((a, b) => b.minion.attack - a.minion.attack)[0];
    return biggest ?? (side === 'enemy' ? undefined : enemyHero);
  }

  // Damage: prefer a minion this kills outright, biggest first; else the face.
  const killable = enemyMinions
    .filter((t) => value >= t.minion.health)
    .sort((a, b) => b.minion.attack - a.minion.attack)[0];
  return killable ?? enemyHero ?? enemyMinions[0];
}

function swing(state: MatchState): void {
  const foe = opponentOf('ai');

  // The hero swings first, while the board is still cluttered: the weapon is
  // the one attack that does not risk losing a minion, so spending it on a
  // Taunt before the minions trade is usually the better order.
  swingWeapon(state, foe);

  // Keep going while any minion still has an attack left.
  let acted = true;
  while (acted && !state.winner) {
    acted = false;
    const attacker = state.players.ai.board.find(canAttack);
    if (!attacker) break;

    const targets = legalTargets(state, foe);
    const heroTarget = targets.find((t) => t.kind === 'hero');
    const minionTargets = targets.flatMap((t) => (t.kind === 'minion' ? [t.minion] : []));

    // Go face if this turn's remaining damage is lethal and nothing blocks.
    if (heroTarget) {
      const available = state.players.ai.board.filter(canAttack);
      const damage = available.reduce((sum, m) => sum + m.attack, 0);
      if (damage >= state.players[foe].health) {
        acted = attack(state, 'ai', attacker.instanceId, { kind: 'hero' });
        continue;
      }
    }

    const target = chooseTarget(attacker, minionTargets, heroTarget !== undefined);
    if (!target) break;
    acted = attack(state, 'ai', attacker.instanceId, target);
  }
}

function swingWeapon(state: MatchState, foe: 'player' | 'ai'): void {
  if (!canHeroAttack(state.players.ai)) return;
  const weapon = state.players.ai.weapon;
  if (!weapon) return;

  const targets = legalTargets(state, foe);
  const minions = targets.flatMap((t) => (t.kind === 'minion' ? [t.minion] : []));
  const hero = targets.find((t) => t.kind === 'hero');

  // A kill the hero survives is worth the durability and the face damage is not.
  const freeKill = minions
    .filter((m) => weapon.attack >= m.health && m.attack < state.players.ai.health)
    .sort((a, b) => b.attack - a.attack)[0];

  const target: Character | undefined = freeKill
    ? { kind: 'minion', owner: foe, minion: freeKill }
    : hero
      ? { kind: 'hero', owner: foe }
      : minions[0]
        ? { kind: 'minion', owner: foe, minion: minions[0] }
        : undefined;

  if (target) heroAttack(state, 'ai', target);
}

function chooseTarget(
  attacker: MinionInstance,
  minions: MinionInstance[],
  heroAvailable: boolean
): { kind: 'minion'; instanceId: string } | { kind: 'hero' } | undefined {
  const kills = minions.filter((m) => attacker.attack >= m.health);

  // A kill that the attacker survives is always worth taking.
  const freeKill = kills.find((m) => m.attack < attacker.health);
  if (freeKill) return { kind: 'minion', instanceId: freeKill.instanceId };

  if (heroAvailable) return { kind: 'hero' };

  // Taunts are in the way: kill one if possible, else chip the weakest.
  if (kills.length > 0) return { kind: 'minion', instanceId: kills[0].instanceId };
  const weakest = [...minions].sort((a, b) => a.health - b.health)[0];
  return weakest ? { kind: 'minion', instanceId: weakest.instanceId } : undefined;
}
