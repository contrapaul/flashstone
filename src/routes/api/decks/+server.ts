import { json, error, type RequestHandler } from '@sveltejs/kit';
import { db, readJson, requireUser } from '$lib/server/api';
import { loadDecks, loadOwned, validateDeck } from '$lib/server/collection';
import { DECK_SIZE } from '$lib/decks/deck';

export const GET: RequestHandler = async (event) => {
  const user = requireUser(event);
  return json({ decks: await loadDecks(db(event), user.id) });
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
    cardIds: Array.isArray(body.cardIds) ? body.cardIds.map(String) : []
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

  await DB.prepare(
    `INSERT INTO decks (id, user_id, name, card_ids, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)
     ON CONFLICT(id) DO UPDATE SET name = ?3, card_ids = ?4, updated_at = ?5`
  )
    .bind(id, user.id, deck.name, JSON.stringify(deck.cardIds), now)
    .run();

  return json({ deck: { id, ...deck }, isNew: !existing });
};

export const DELETE: RequestHandler = async (event) => {
  const DB = db(event);
  const user = requireUser(event);
  const body = await readJson(event);
  const id = String(body.id ?? '');
  if (!id) error(400, 'Missing deck id.');

  await DB.prepare('DELETE FROM decks WHERE id = ?1 AND user_id = ?2').bind(id, user.id).run();
  return json({ ok: true });
};
