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

/** A saved deck with the server's id for it. */
export interface DeckRecord extends Deck {
  id: string;
}

/** The id the one signed-out deck answers to, so the builder can key on it. */
export const LOCAL_DECK_ID = 'local';

export interface PlayerState {
  owned: Owned;
  /** The **active** deck — the one a match is dealt from. */
  deck: Deck | null;
  /** The server's id for `deck`, so a save updates rather than duplicates. */
  deckId: string | null;
  /** Every saved deck, most recently updated first. One, or none, signed out. */
  decks: DeckRecord[];
  /** Which of `decks` is played. Tracked apart from `deckId`, which follows
   * whichever deck the builder is editing. */
  activeId: string | null;
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
  const localDeck = loadDeck();
  const local: PlayerState = {
    owned: loadCollection() ?? starterCollection(),
    deck: localDeck,
    deckId: null,
    // Signed out there is one deck in localStorage, which is the whole story —
    // slots are an account feature, and the builder says so rather than showing
    // nine locked ones.
    decks: localDeck ? [{ id: LOCAL_DECK_ID, ...localDeck }] : [],
    activeId: localDeck ? LOCAL_DECK_ID : null,
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
  const saved: DeckRecord[] = decks?.decks ?? [];
  // The server resolves this, falling back to the most recent deck for an
  // account that has never chosen one.
  const activeId: string | null = decks?.activeId ?? saved[0]?.id ?? null;
  const active = saved.find((d) => d.id === activeId) ?? saved[0];

  return {
    owned,
    // Prune on arrival: a deck saved before a card left the set, or before
    // copies were spent, must not make the play route think it is illegal.
    deck: active
      ? pruneDeck({ name: active.name, cardIds: active.cardIds, class: active.class }, owned)
      : null,
    deckId: active?.id ?? null,
    decks: saved,
    activeId: active?.id ?? null,
    signedIn: true
  };
}

/**
 * Marks a deck as the one to play. Signed out there is only ever one, so this
 * is a no-op rather than an error.
 *
 * The local mirror follows the **active** deck, not the last one edited: it is
 * what the nav bar reads and what offline play falls back to, and with ten
 * slots those must be the deck the player says they are playing.
 */
export async function setActiveDeck(deckId: string, deck?: Deck): Promise<boolean> {
  if (deckId === LOCAL_DECK_ID) return true;
  try {
    const res = await fetch('/api/decks/active', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: deckId })
    });
    if (res.ok && deck) saveDeck(deck);
    return res.ok;
  } catch {
    return false;
  }
}

/** Deletes a deck, returning what is left and which of them is now active. */
export async function deleteDeck(
  deckId: string
): Promise<{ ok: boolean; decks: DeckRecord[]; activeId: string | null }> {
  try {
    const res = await fetch('/api/decks', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: deckId })
    });
    if (!res.ok) return { ok: false, decks: [], activeId: null };
    const body = await res.json();
    return { ok: true, decks: body.decks ?? [], activeId: body.activeId ?? null };
  } catch {
    return { ok: false, decks: [], activeId: null };
  }
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
  signedIn: boolean,
  isActive = true
): Promise<{ ok: boolean; deckId: string | null; activeId?: string | null; error?: string }> {
  // The local copy mirrors the deck the player plays, so it is still there if
  // they later play offline. Saving one of the other nine must not overwrite it.
  if (!signedIn || isActive) saveDeck(deck);
  if (!signedIn) return { ok: true, deckId: null };

  try {
    const res = await fetch('/api/decks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: deckId,
        name: deck.name,
        cardIds: deck.cardIds,
        class: deck.class
      })
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { ok: false, deckId, error: body.message ?? 'The server refused this deck.' };
    }
    const body = await res.json();
    // The server makes a player's first deck active on its own; this is how the
    // builder finds out without asking again.
    return { ok: true, deckId: body.deck?.id ?? deckId, activeId: body.activeId ?? null };
  } catch {
    return { ok: false, deckId, error: 'Could not reach the server. Saved on this device only.' };
  }
}

/** Keeps the offline copy current, so signing out does not empty the shelves. */
export function cacheOwned(owned: Owned): void {
  saveCollection(owned);
}
