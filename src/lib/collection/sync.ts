import { browser } from '$app/environment';
import type { Owned } from './owned';
import { starterCollection } from '../data/starter';
import { pruneDeck, type Deck } from '../decks/deck';
import { loadCollection, loadDeck, saveCollection, saveDeck } from '../decks/storage';

/**
 * One place the app asks "what does this player own, and what deck are they
 * playing" — whether or not they are signed in.
 *
 * Signed in, the server is the source of truth. Signed out, localStorage is,
 * and the starter collection is the floor: practice against the AI must work
 * with no account, so there is no state in which a player has nothing to play.
 */

export interface PlayerState {
  owned: Owned;
  deck: Deck | null;
  /** The server's id for `deck`, so a save updates rather than duplicates. */
  deckId: string | null;
  signedIn: boolean;
}

async function getJson(path: string): Promise<any | null> {
  try {
    const res = await fetch(path);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Loads the player's collection and deck.
 *
 * Falls back to local state on any server failure rather than showing an error:
 * a network blip should cost you cloud sync for the session, not the ability to
 * play. `signedIn` reports which source actually answered.
 */
export async function loadPlayer(): Promise<PlayerState> {
  const local: PlayerState = {
    owned: loadCollection() ?? starterCollection(),
    deck: loadDeck(),
    deckId: null,
    signedIn: false
  };
  if (!browser) return local;

  const profile = await getJson('/api/profile');
  if (!profile?.user) return local;

  const [collection, decks] = await Promise.all([
    getJson('/api/collection'),
    getJson('/api/decks')
  ]);
  if (!collection?.owned) return local;

  const owned: Owned = collection.owned;
  const first = decks?.decks?.[0];

  return {
    owned,
    // Prune on arrival: a deck saved before a card left the set, or before
    // copies were spent, must not make the play route think it is illegal.
    deck: first ? pruneDeck({ name: first.name, cardIds: first.cardIds }, owned) : null,
    deckId: first?.id ?? null,
    signedIn: true
  };
}

/**
 * Saves a deck to wherever it belongs.
 *
 * Returns the server's deck id when signed in, so the next save updates the
 * same row. A server rejection is surfaced, not swallowed — the builder shows
 * the same problems, so a refusal here means the two disagreed and the player
 * needs to know.
 */
export async function savePlayerDeck(
  deck: Deck,
  deckId: string | null,
  signedIn: boolean
): Promise<{ ok: boolean; deckId: string | null; error?: string }> {
  // Always keep the local copy, signed in or not — it is what makes a signed-in
  // player's deck still there if they later play offline.
  saveDeck(deck);
  if (!signedIn) return { ok: true, deckId: null };

  try {
    const res = await fetch('/api/decks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: deckId, name: deck.name, cardIds: deck.cardIds })
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { ok: false, deckId, error: body.message ?? 'The server refused this deck.' };
    }
    const body = await res.json();
    return { ok: true, deckId: body.deck?.id ?? deckId };
  } catch {
    return { ok: false, deckId, error: 'Could not reach the server. Saved on this device only.' };
  }
}

/** Keeps the offline copy current, so signing out does not empty the shelves. */
export function cacheOwned(owned: Owned): void {
  saveCollection(owned);
}
