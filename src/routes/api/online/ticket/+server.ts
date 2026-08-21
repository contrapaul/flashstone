import { json, error, type RequestHandler } from '@sveltejs/kit';
import { db, env as platformEnv, readJson, requireUser } from '$lib/server/api';
import { signTicket } from '$lib/net/ticket';
import { loadOwned, loadDecks } from '$lib/server/collection';
import { isLegal } from '$lib/decks/deck';

/**
 * Mints a short-lived ticket for the realtime Worker.
 *
 * The realtime Worker is a different origin and never sees the session cookie —
 * this is the bridge. The ticket is signed with a secret both projects hold and
 * lives for sixty seconds, long enough to open a socket and no longer.
 *
 * Deck legality is checked **here**, before a player can even join a lobby, so
 * "you have no legal deck" is an error on a page rather than a socket that
 * opens and immediately dies.
 */
export const POST: RequestHandler = async (event) => {
  const DB = db(event);
  const user = requireUser(event);
  const secret = platformEnv(event).TICKET_SECRET;

  if (!secret) {
    error(503, 'Online play is not configured on this server.');
  }

  const body = await readJson(event);
  // 'lobby' is the sentinel for lobby operations, which are not tied to a game.
  const gameId = String(body.gameId ?? 'lobby');

  const [owned, decks] = await Promise.all([loadOwned(DB, user.id), loadDecks(DB, user.id)]);
  const deck = decks[0];
  if (!deck || !isLegal({ name: deck.name, cardIds: deck.cardIds }, owned)) {
    error(400, 'You need a legal 30-card deck before playing online. Build one in Collection.');
  }

  const profile = await DB.prepare('SELECT card_back FROM profiles WHERE user_id = ?1')
    .bind(user.id)
    .first();

  const ticket = await signTicket(secret, {
    userId: user.id,
    username: user.username,
    gameId,
    cardBack: (profile?.card_back as string) ?? 'default'
  });

  return json({ ticket, realtimeUrl: platformEnv(event).REALTIME_URL ?? 'http://localhost:8787' });
};
