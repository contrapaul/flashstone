import { describe, expect, it } from 'vitest';
import { DELETE, GET, POST } from './+server';
import { POST as SET_ACTIVE } from './active/+server';
import { MAX_DECKS } from '$lib/decks/deck';
import { STARTER_CARD_IDS, starterDeck } from '$lib/data/starter';

/**
 * The deck-slot rules, exercised through the route handlers themselves.
 *
 * The limit and the active-deck pointer are only meaningful as HTTP behaviour —
 * "the eleventh save is refused", "deleting the deck you play falls back" — so
 * the fake here models the three tables involved rather than mocking the
 * functions that read them.
 */
function fakeDb() {
  const decks = new Map<string, { user_id: string; name: string; card_ids: string; class: string | null; updated_at: number }>();
  const profiles = new Map<string, string | null>([['u1', null]]);
  let clock = 1000;

  const statement = (sql: string, args: any[] = []): any => ({
    sql,
    args,
    bind: (...next: any[]) => statement(sql, next),

    async first() {
      if (sql.includes('SELECT card_id, copies, gold')) return null;
      if (sql.includes('SELECT user_id FROM decks WHERE id = ?1')) {
        const row = decks.get(args[0]);
        return row ? { user_id: row.user_id } : null;
      }
      if (sql.includes('SELECT COUNT(*) AS n FROM decks')) {
        return { n: [...decks.values()].filter((d) => d.user_id === args[0]).length };
      }
      if (sql.includes('SELECT active_deck FROM profiles')) {
        return { active_deck: profiles.get(args[0]) ?? null };
      }
      if (sql.includes('SELECT id FROM decks WHERE id = ?1 AND user_id = ?2')) {
        const row = decks.get(args[0]);
        return row && row.user_id === args[1] ? { id: args[0] } : null;
      }
      if (sql.includes('ORDER BY updated_at DESC LIMIT 1')) {
        const mine = [...decks.entries()]
          .filter(([, d]) => d.user_id === args[0])
          .sort((a, b) => b[1].updated_at - a[1].updated_at);
        return mine.length ? { id: mine[0][0] } : null;
      }
      return null;
    },

    async all() {
      if (sql.includes('SELECT card_id, copies, gold')) {
        return {
          results: STARTER_CARD_IDS.map((card_id) => ({ card_id, copies: 2, gold: 0 }))
        };
      }
      if (sql.includes('SELECT id, name, card_ids, class FROM decks')) {
        return {
          results: [...decks.entries()]
            .filter(([, d]) => d.user_id === args[0])
            .sort((a, b) => b[1].updated_at - a[1].updated_at)
            .map(([id, d]) => ({ id, name: d.name, card_ids: d.card_ids, class: d.class }))
        };
      }
      return { results: [] };
    },

    async run() {
      if (sql.includes('INSERT INTO decks')) {
        const [id, user_id, name, card_ids, cls] = args;
        decks.set(id, { user_id, name, card_ids, class: cls, updated_at: clock++ });
      } else if (sql.includes('DELETE FROM decks')) {
        const row = decks.get(args[0]);
        if (row && row.user_id === args[1]) decks.delete(args[0]);
      } else if (sql.includes('UPDATE profiles SET active_deck = NULL')) {
        if (profiles.get(args[0]) === args[1]) profiles.set(args[0], null);
      } else if (sql.includes('UPDATE profiles SET active_deck = ?1')) {
        profiles.set(args[1], args[0]);
      }
      return { meta: { changes: 1 } };
    }
  });

  return {
    prepare: (sql: string) => statement(sql),
    _decks: () => [...decks.keys()],
    _active: () => profiles.get('u1') ?? null
  };
}

function event(db: any, body: unknown = {}) {
  return {
    platform: { env: { DB: db } },
    locals: { user: { id: 'u1', username: 'p', email: 'p@x', email_verified: 1 } },
    request: { json: async () => body }
  } as any;
}

const deckBody = (name: string, id?: string) => ({ ...starterDeck(), name, id });

async function save(db: any, name: string, id?: string) {
  const res = await POST(event(db, deckBody(name, id)));
  return res.json();
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

describe('the deck limit', () => {
  it('accepts ten decks and refuses the eleventh', async () => {
    const db = fakeDb();
    for (let i = 1; i <= MAX_DECKS; i++) await save(db, `Deck ${i}`);
    expect(db._decks()).toHaveLength(MAX_DECKS);

    expect(await statusOf(() => POST(event(db, deckBody('One too many'))))).toBe(400);
    expect(db._decks()).toHaveLength(MAX_DECKS);
  });

  it('frees a slot when a deck is deleted', async () => {
    const db = fakeDb();
    for (let i = 1; i <= MAX_DECKS; i++) await save(db, `Deck ${i}`);

    await DELETE(event(db, { id: db._decks()[0] }));
    const saved = await save(db, 'Room at last');

    expect(saved.deck.name).toBe('Room at last');
    expect(db._decks()).toHaveLength(MAX_DECKS);
  });

  // Re-saving an existing deck is an edit, not a new slot.
  it('does not count a re-save against the limit', async () => {
    const db = fakeDb();
    for (let i = 1; i <= MAX_DECKS; i++) await save(db, `Deck ${i}`);

    const id = db._decks()[3];
    const again = await save(db, 'Renamed', id);

    expect(again.deck.id).toBe(id);
    expect(db._decks()).toHaveLength(MAX_DECKS);
  });
});

describe('which deck is played', () => {
  it('makes the first deck active without being asked', async () => {
    const db = fakeDb();
    const first = await save(db, 'Only deck');
    expect(db._active()).toBe(first.deck.id);
  });

  // Saving an experiment must not change what you take into a match.
  it('leaves the active deck alone when a later one is saved', async () => {
    const db = fakeDb();
    const first = await save(db, 'The one I play');
    await save(db, 'An experiment');

    expect(db._active()).toBe(first.deck.id);
  });

  it('changes on request, and only to a deck you own', async () => {
    const db = fakeDb();
    await save(db, 'First');
    const second = await save(db, 'Second');

    await SET_ACTIVE(event(db, { id: second.deck.id }));
    expect(db._active()).toBe(second.deck.id);

    expect(await statusOf(() => SET_ACTIVE(event(db, { id: 'someone-elses-deck' })))).toBe(404);
    expect(db._active()).toBe(second.deck.id);
  });

  it('falls back to the most recent deck when the active one is deleted', async () => {
    const db = fakeDb();
    const first = await save(db, 'First');
    const second = await save(db, 'Second');

    await SET_ACTIVE(event(db, { id: first.deck.id }));
    const after = await (await DELETE(event(db, { id: first.deck.id }))).json();

    expect(db._active()).toBeNull();
    // The pointer is cleared, but the player still has a deck to play.
    expect(after.activeId).toBe(second.deck.id);
  });

  it('reports the active deck alongside the list', async () => {
    const db = fakeDb();
    await save(db, 'First');
    const second = await save(db, 'Second');
    await SET_ACTIVE(event(db, { id: second.deck.id }));

    const body = await (await GET(event(db))).json();
    expect(body.decks).toHaveLength(2);
    expect(body.activeId).toBe(second.deck.id);
    expect(body.max).toBe(MAX_DECKS);
  });
});
