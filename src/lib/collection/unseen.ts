import { writable } from 'svelte/store';
import { browser } from '$app/environment';

/**
 * Cards that came out of a pack and have not been looked at in the collection
 * yet — each wears a glowing NEW badge there until the pointer passes over it
 * (REVISIONS R10.3).
 *
 * A convenience of this browser, kept in localStorage: losing it costs a badge,
 * never a card. Unreadable storage simply means no badges.
 */
const KEY = 'flashstone.unseen';

function load(): Set<string> {
  if (!browser) return new Set();
  try {
    return new Set(JSON.parse(localStorage.getItem(KEY) ?? '[]'));
  } catch {
    return new Set();
  }
}

function createUnseen() {
  const { subscribe, update } = writable<Set<string>>(load());
  const save = (ids: Set<string>) => {
    try {
      localStorage.setItem(KEY, JSON.stringify([...ids]));
    } catch {
      // Not remembered; nothing else depends on it.
    }
    return ids;
  };
  return {
    subscribe,
    /** Cards just pulled, to be badged until seen. */
    add: (ids: string[]) => update((set) => save(new Set([...set, ...ids]))),
    /** Looked at: the badge goes. */
    seen: (id: string) =>
      update((set) => {
        if (!set.has(id)) return set;
        const next = new Set(set);
        next.delete(id);
        return save(next);
      })
  };
}

export const unseen = createUnseen();
