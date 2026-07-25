import { browser } from '$app/environment';
import type { Collection, Deck } from './deck';

// All state is client-side by design; there is no server or D1 behind this.
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

export function loadCollection(): Collection | null {
  const collection = read<Collection>(COLLECTION_KEY);
  if (!collection || !Array.isArray(collection.cards)) return null;
  return collection;
}

export function saveCollection(collection: Collection): void {
  write(COLLECTION_KEY, collection);
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
