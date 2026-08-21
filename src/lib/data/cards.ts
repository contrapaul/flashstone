import type { Card } from '../../types/cards';
import { SL_CARDS } from './slCards';
import { CUSTOM_CARDS } from './customCards';

/**
 * The card registry — the one place the rest of the app asks what cards exist.
 *
 * **Nothing outside this module may import `slCards.ts` or `customCards.ts`.**
 * That is what keeps adding a card to a single file edit: the collection, the
 * deck builder, pack generation and completion checks all read from here.
 *
 * Completion is derived from `ALL_CARDS` at call time and never cached, so the
 * set can grow without stranding a player at "collection complete".
 */

function indexUnique(cards: Card[]): Map<string, Card> {
  const byId = new Map<string, Card>();
  for (const card of cards) {
    const clash = byId.get(card.id);
    if (clash) {
      throw new Error(
        `Duplicate card id "${card.id}" — "${clash.name}" and "${card.name}". ` +
          'Card ids must be unique across slCards.ts and customCards.ts.'
      );
    }
    byId.set(card.id, card);
  }
  return byId;
}

export const ALL_CARDS: Card[] = [...SL_CARDS, ...CUSTOM_CARDS];

const BY_ID = indexUnique(ALL_CARDS);

export function cardById(id: string): Card | undefined {
  return BY_ID.get(id);
}

/** Every card id in the set. The denominator for "collection complete". */
export function allCardIds(): string[] {
  return ALL_CARDS.map((c) => c.id);
}
