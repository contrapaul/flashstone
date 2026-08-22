import { json, error, type RequestHandler } from '@sveltejs/kit';
import { db, readJson, requireUser } from '$lib/server/api';
import {
  activeDeckId,
  countDecks,
  loadDecks,
  loadOwned,
  validateDeck
} from '$lib/server/collection';
import { DECK_SIZE, MAX_DECKS } from '$lib/decks/deck';

export const GET: RequestHandler = async (event) => {
  const DB = db(event);
  const user = requireUser(event);
  return json({
    decks: await loadDecks(DB, user.id),
    // Resolved rather than stored raw: an account from before deck slots has
    // never chosen one, and falls back to its most recent deck.
    activeId: await activeDeckId(DB, user.id),
    max: MAX_DECKS
  });
};

/**
 * Saves a deck. **Never trusts the submitted list** — it is re-validated
 * against the collection the server holds, using the same rules the builder
 * shows the player.
 */
export const POST: RequestHandler = async (event) => {
  const DB = db(event);
  const user = requireUser(event);
  const body = await readJson(event);

  const deck = {
    name: String(body.name ?? '').trim(),
    cardIds: Array.isArray(body.cardIds) ? body.cardIds.map(String) : [],
    class: typeof body.class === 'string' ? (body.class as never) : undefined
  };

  // A cheap guard before touching the database at all: nothing legal is ever
  // longer than a deck, and a huge array should not reach the validator.
  if (deck.cardIds.length > DECK_SIZE) {
    error(400, `A deck holds at most ${DECK_SIZE} cards.`);
  }

  const owned = await loadOwned(DB, user.id);
  const problems = validateDeck(deck, owned);
  if (problems.length > 0) error(400, problems.join(' '));

  const id = typeof body.id === 'string' && body.id ? body.id : crypto.randomUUID();
  const now = Date.now();

  // Scoped to the owner in the WHERE clause as well as the INSERT, so a guessed
  // deck id cannot overwrite somebody else's deck.
  const existing = await DB.prepare('SELECT user_id FROM decks WHERE id = ?1').bind(id).first();
  if (existing && existing.user_id !== user.id) error(403, 'That deck is not yours.');

  // The limit is enforced here, where every other rule lives — a client that
  // never renders an eleventh slot is a convenience, not a guarantee.
  if (!existing && (await countDecks(DB, user.id)) >= MAX_DECKS) {
    error(400, `You can keep at most ${MAX_DECKS} decks. Delete one to make room.`);
  }

  await DB.prepare(
    `INSERT INTO decks (id, user_id, name, card_ids, class, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
     ON CONFLICT(id) DO UPDATE SET name = ?3, card_ids = ?4, class = ?5, updated_at = ?6`
  )
    .bind(id, user.id, deck.name, JSON.stringify(deck.cardIds), deck.class ?? null, now)
    .run();

  // A player's first deck is the one they play, without being asked. Later ones
  // are not — saving an experiment should not change what you take into a match.
  if (!existing && (await countDecks(DB, user.id)) === 1) {
    await DB.prepare('UPDATE profiles SET active_deck = ?1 WHERE user_id = ?2')
      .bind(id, user.id)
      .run();
  }

  return json({
    deck: { id, ...deck },
    isNew: !existing,
    activeId: await activeDeckId(DB, user.id)
  });
};

export const DELETE: RequestHandler = async (event) => {
  const DB = db(event);
  const user = requireUser(event);
  const body = await readJson(event);
  const id = String(body.id ?? '');
  if (!id) error(400, 'Missing deck id.');

  await DB.prepare('DELETE FROM decks WHERE id = ?1 AND user_id = ?2').bind(id, user.id).run();

  // Deleting the active deck leaves the pointer dangling. Clearing it lets the
  // fallback pick the most recent survivor, rather than the player finding
  // themselves with no deck and nothing saying why.
  await DB.prepare(
    'UPDATE profiles SET active_deck = NULL WHERE user_id = ?1 AND active_deck = ?2'
  )
    .bind(user.id, id)
    .run();

  return json({
    ok: true,
    decks: await loadDecks(DB, user.id),
    activeId: await activeDeckId(DB, user.id)
  });
};
