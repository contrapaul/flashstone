import { backUrlFor } from '../utils/art';

/**
 * Shop constants and the card-back catalogue.
 *
 * Lives here rather than in `lib/server/shop.ts` because both sides need it and
 * SvelteKit forbids a component importing from `$lib/server` — duplicating the
 * price in a Svelte file is how the two drift apart.
 */

export const CARD_BACK_COST = 300;
export const DEFAULT_BACK = 'default';

export interface CardBackDef {
  id: string;
  name: string;
  /** Hue of the generated field, used until a drawn back exists for this id. */
  hue: number;
  mark: string;
}

/**
 * The four backs.
 *
 * They are **generated** today — the hue-and-sigil design `CardBack.svelte` has
 * always drawn. Dropping `static/art/backs/<id>.webp` in replaces one with
 * Paul's art without touching this list, and adding a file with a new id adds a
 * fifth back. Same fallback discipline as card art: the shop is never empty
 * waiting on illustration.
 */
export const CARD_BACKS: CardBackDef[] = [
  { id: DEFAULT_BACK, name: 'Grimoire', hue: 266, mark: 'F' },
  { id: 'astral', name: 'Astral', hue: 205, mark: 'A' },
  { id: 'verdant', name: 'Verdant', hue: 138, mark: 'V' },
  { id: 'ember', name: 'Ember', hue: 18, mark: 'E' }
];

const BY_ID = new Map(CARD_BACKS.map((b) => [b.id, b]));

export function cardBackById(id: string): CardBackDef {
  return BY_ID.get(id) ?? CARD_BACKS[0];
}

/** Every back that exists — the catalogue, plus any drawn one not already in it. */
export function allCardBackIds(): string[] {
  return CARD_BACKS.map((b) => b.id);
}

/** True when this back has drawn art rather than the generated field. */
export function hasDrawnArt(id: string): boolean {
  return backUrlFor(id) !== null;
}
