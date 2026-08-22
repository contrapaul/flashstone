import type { Owned } from '$lib/collection/owned';
import { STARTER_CARD_IDS } from '$lib/data/starter';
import { deckProblems, type Deck } from '$lib/decks/deck';

/**
 * The server's view of a player's collection and decks.
 *
 * Deck legality is checked here with the **same `deckProblems` the client
 * uses** — `decks/deck.ts` is pure TypeScript with no Svelte or DOM imports, so
 * it runs unchanged server-side. A client-submitted deck is never trusted; it
 * is re-validated against what the server says the player owns.
 */

export async function loadOwned(DB: any, userId: string): Promise<Owned> {
  const { results } = await DB.prepare(
    'SELECT card_id, copies, gold FROM owned_cards WHERE user_id = ?1'
  )
    .bind(userId)
    .all();

  const owned: Owned = {};
  for (const row of results ?? []) {
    owned[row.card_id as string] = {
      copies: row.copies as 1 | 2,
      gold: row.gold as 0 | 1 | 2
    };
  }
  return owned;
}

/**
 * Grants the starter 15 at two copies each, once.
 *
 * Idempotent by construction: `INSERT OR IGNORE` against the (user, card)
 * primary key, so a double-fired signup or a re-login cannot double-grant, and
 * it will never overwrite a card the player has since turned gold.
 */
export async function grantStarterCollection(DB: any, userId: string): Promise<void> {
  const statements = STARTER_CARD_IDS.map((cardId) =>
    DB.prepare(
      'INSERT OR IGNORE INTO owned_cards (user_id, card_id, copies, gold) VALUES (?1, ?2, 2, 0)'
    ).bind(userId, cardId)
  );
  await DB.batch(statements);
}

export async function loadDecks(DB: any, userId: string): Promise<(Deck & { id: string })[]> {
  const { results } = await DB.prepare(
    'SELECT id, name, card_ids, class FROM decks WHERE user_id = ?1 ORDER BY updated_at DESC'
  )
    .bind(userId)
    .all();

  return (results ?? []).flatMap((row: any) => {
    try {
      const cardIds = JSON.parse(row.card_ids);
      if (!Array.isArray(cardIds)) return [];
      return [
        {
          id: String(row.id),
          name: String(row.name),
          cardIds: cardIds.map(String),
          class: (row.class as Deck['class']) ?? undefined
        }
      ];
    } catch {
      // A corrupt row should cost the player one deck, not the whole list.
      return [];
    }
  });
}

/** Every reason this deck cannot be saved, from the server's own records. */
export function validateDeck(deck: Deck, owned: Owned): string[] {
  const problems: string[] = [];
  if (typeof deck.name !== 'string' || deck.name.trim() === '' || deck.name.length > 60) {
    problems.push('Deck name must be 1-60 characters.');
  }
  if (!Array.isArray(deck.cardIds)) {
    problems.push('Deck is malformed.');
    return problems;
  }
  return [...problems, ...deckProblems(deck, owned)];
}
