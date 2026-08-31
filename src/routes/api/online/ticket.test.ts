import { describe, expect, it } from 'vitest';
import { POST } from './ticket/+server';
import { STARTER_CARD_IDS, starterDeck } from '$lib/data/starter';
import { verifyTicket } from '$lib/net/ticket';

/**
 * The deck gate in front of online play.
 *
 * This exists because the gate once rejected **every** deck: it rebuilt the
 * saved deck as `{ name, cardIds }` before checking it, which dropped `class`,
 * and `deckProblems` requires a playable class. The deck was legal, the check
 * was not, and the player was told to go and build the deck they already had.
 */

const SECRET = 'test-secret';

/**
 * Just the four reads the ticket route makes. Smaller than the deck fake in
 * `api/decks` on purpose — this route writes nothing, so there is no state to
 * model beyond the row it is handed.
 */
function fakeDb(deck: { id: string; name: string; cardIds: string[]; class: string | null } | null) {
  const statement = (sql: string, args: any[] = []): any => ({
    bind: (...next: any[]) => statement(sql, next),

    async first() {
      if (sql.includes('SELECT active_deck FROM profiles')) {
        return { active_deck: deck?.id ?? null };
      }
      if (sql.includes('SELECT id FROM decks WHERE id = ?1')) {
        return deck && deck.id === args[0] ? { id: deck.id } : null;
      }
      if (sql.includes('ORDER BY updated_at DESC LIMIT 1')) {
        return deck ? { id: deck.id } : null;
      }
      if (sql.includes('SELECT card_back FROM profiles')) return { card_back: 'astral' };
      return null;
    },

    async all() {
      if (sql.includes('SELECT card_id, copies, gold')) {
        return { results: STARTER_CARD_IDS.map((card_id) => ({ card_id, copies: 2, gold: 0 })) };
      }
      if (sql.includes('SELECT id, name, card_ids, class FROM decks')) {
        return {
          results: deck
            ? [
                {
                  id: deck.id,
                  name: deck.name,
                  card_ids: JSON.stringify(deck.cardIds),
                  class: deck.class
                }
              ]
            : []
        };
      }
      return { results: [] };
    }
  });

  return { prepare: (sql: string) => statement(sql) };
}

function event(db: any, body: unknown = {}) {
  return {
    platform: { env: { DB: db, TICKET_SECRET: SECRET, REALTIME_URL: 'http://localhost:8787' } },
    locals: { user: { id: 'u1', username: 'p', email: 'p@x', email_verified: 1 } },
    request: { json: async () => body }
  } as any;
}

/** The status of the HttpError a route throws, or 0 if it does not throw. */
async function statusOf(work: () => unknown): Promise<number> {
  try {
    await work();
    return 0;
  } catch (e: any) {
    return e?.status ?? -1;
  }
}

const saved = (over: Partial<{ class: string | null }> = {}) => {
  const base = starterDeck();
  return {
    id: 'd1',
    name: base.name,
    cardIds: base.cardIds,
    class: base.class ?? null,
    ...over
  };
};

describe('the online deck gate', () => {
  it('mints a ticket for a legal deck', async () => {
    const res = await POST(event(fakeDb(saved()), { gameId: 'g1' }));
    const body = await res.json();

    expect(body.ticket).toBeTruthy();
    const decoded = await verifyTicket(SECRET, body.ticket);
    expect(decoded?.userId).toBe('u1');
    expect(decoded?.gameId).toBe('g1');
  });

  it('does not lose the deck class on the way to the legality check', async () => {
    // The regression itself: a deck whose only distinguishing feature is that
    // it has a class must pass. Before the fix this threw 400.
    expect(await statusOf(() => POST(event(fakeDb(saved()), {})))).toBe(0);
  });

  it('still refuses a deck with no class', async () => {
    expect(await statusOf(() => POST(event(fakeDb(saved({ class: null })), {})))).toBe(400);
  });

  it('still refuses a player with no deck at all', async () => {
    expect(await statusOf(() => POST(event(fakeDb(null), {})))).toBe(400);
  });
});
