import type { Card, CardType, Effect, Keyword } from '../../types/cards';
import { hashText } from '../../utils/art';
import { abilityForHash, describeEffects, templateForHash } from './templates';
import { SL_TERMS, type SlTerm } from './slTerms';

/**
 * The SL card set — one card per syllabus term.
 *
 * `slTerms.ts` is generated from `slcards.txt` and must not be hand-edited.
 * **This file is the opposite**: it is where the mechanical layer is applied, and
 * where hand-tuning goes. Nothing regenerates it.
 *
 * Everything a card does is a pure function of its id, so a card plays the same
 * way forever — which is the point, since you are trying to memorise it. The
 * same hash drives the card's art (`utils/art.ts` uses the same FNV-1a), so a
 * card's look and its statline share a seed.
 *
 * To retune one card, add an entry to OVERRIDES below. Overrides live here
 * rather than in the generated file precisely so that regenerating the terms
 * never erases them.
 */

/** Roughly this share of the set are Spells rather than Minions. */
const SPELL_SHARE = 0.15;

/**
 * Hand-tuned cards. Anything set here wins over the derived value.
 *
 * Keyed by card id — the slug in `slTerms.ts`. Setting `type: 'Spell'` also
 * clears attack, health and keywords, so a Minion can be turned into a Spell
 * with one line.
 *
 * @example
 * const OVERRIDES = {
 *   ergonomics: { cost: 3, attack: 3, health: 4, rarity: 'Rare', keywords: ['Taunt'] }
 * };
 */
const OVERRIDES: Record<string, Partial<Card>> = {};

/**
 * A salted hash, so the Minion/Spell roll cannot correlate with the statline.
 * `templateForHash` spends the `>>> 8` and `>>> 16` slices of the plain hash;
 * salting the input sidesteps the question entirely.
 */
function typeFor(id: string): CardType {
  return (hashText(`${id}:type`) % 1000) / 1000 < SPELL_SHARE ? 'Spell' : 'Minion';
}

/**
 * Drops abilities that would do nothing.
 *
 * The pools are bound blind to the statline, so a Taunt template could draw
 * "Battlecry: Give this minion Taunt" — an effect that changes nothing, and
 * whose text repeats a keyword CardPreview already prints on its own line.
 * Such a card simply comes out vanilla, which is a fine outcome.
 */
function usefulEffects(effects: Effect[], keywords: Keyword[]): Effect[] {
  return effects.filter(
    (effect) =>
      !(
        effect.action === 'GainKeyword' &&
        effect.target === 'Self' &&
        keywords.includes(effect.keyword ?? 'Taunt')
      )
  );
}

function buildCard(term: SlTerm): Card {
  const hash = hashText(term.id);
  const template = templateForHash(hash);
  const type = typeFor(term.id);
  const keywords = type === 'Minion' ? [...template.keywords] : [];
  const effects = usefulEffects(abilityForHash(hash, template.rarity, type, template.cost), keywords);

  // Statlines are copied inline rather than referenced, so retuning one card
  // through OVERRIDES cannot disturb every other card sharing its template.
  const base: Card = {
    id: term.id,
    name: term.term,
    cost: template.cost,
    type,
    rarity: template.rarity,
    keywords,
    effects,
    description: describeEffects(effects, type),
    definition: term.definition,
    sections: [...term.sections],
    tags: [...term.sections],
    templateId: template.id
  };
  if (type === 'Minion') {
    base.attack = template.attack;
    base.health = template.health;
  }
  if (term.hl) base.hl = true;

  return applyOverride(base, OVERRIDES[term.id]);
}

function applyOverride(card: Card, override: Partial<Card> | undefined): Card {
  if (!override) return card;
  const merged: Card = { ...card, ...override };

  // A Spell has no body. Enforced here so an override only has to say the type.
  if (merged.type !== 'Minion') {
    delete merged.attack;
    delete merged.health;
    merged.keywords = [];
  }
  // Text is regenerated unless the override supplies its own, so hand-tuned
  // effects can never disagree with the text printed on the card.
  if (override.effects && override.description === undefined) {
    merged.description = describeEffects(merged.effects, merged.type);
  }
  return merged;
}

export const SL_CARDS: Card[] = SL_TERMS.map(buildCard);
