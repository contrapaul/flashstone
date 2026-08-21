import type { Card } from '../../types/cards';

/**
 * Hand-authored cards, added by hand and merged into the registry alongside the
 * SL set. This is the injection point for new cards: nothing here is generated,
 * and nothing regenerates it.
 *
 * Ids must be slugs (`^[a-z0-9]+(-[a-z0-9]+)*$`) and must not collide with an SL
 * term's id — `cards.ts` throws at module load if one does, rather than letting
 * a card silently shadow another.
 *
 * Phase 1B's basic spells and weapons land here.
 */
export const CUSTOM_CARDS: Card[] = [];
