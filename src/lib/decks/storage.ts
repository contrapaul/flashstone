import { browser } from '$app/environment';
import type { Owned } from '../collection/owned';
import type { Deck } from './deck';

// Client-side storage. From Phase 3 the server is the source of truth for a
// signed-in player; this remains the store for signed-out practice.
const COLLECTION_KEY = 'flashstone.collection';
const DECK_KEY = 'flashstone.deck';

function read<T>(key: string): T | null {
  if (!browser) return null;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    // Corrupt or unreadable storage shouldn't take the app down.
    return null;
  }
}

function write(key: string, value: unknown): void {
  if (!browser) return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota exceeded or storage disabled — the app still works for this session.
  }
}

export function loadCollection(): Owned | null {
  const owned = read<Owned>(COLLECTION_KEY);
  // Guards against the pre-v0.3 shape, which stored `{ name, cards: Card[] }`.
  // Anything that isn't a plain id → counts map is discarded rather than
  // half-read; the caller falls back to the starter collection.
  if (!owned || typeof owned !== 'object' || Array.isArray(owned)) return null;
  if ('cards' in owned) return null;
  return owned;
}

export function saveCollection(owned: Owned): void {
  write(COLLECTION_KEY, owned);
}

export function loadDeck(): Deck | null {
  const deck = read<Deck>(DECK_KEY);
  if (!deck || !Array.isArray(deck.cardIds)) return null;
  return deck;
}

export function saveDeck(deck: Deck): void {
  write(DECK_KEY, deck);
}

export function clearAll(): void {
  if (!browser) return;
  localStorage.removeItem(COLLECTION_KEY);
  localStorage.removeItem(DECK_KEY);
}
