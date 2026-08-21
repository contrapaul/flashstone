import { writable } from 'svelte/store';
import { browser } from '$app/environment';

/**
 * Player settings, persisted to localStorage.
 *
 * Deliberately separate from the collection and deck stores: settings are a
 * property of this browser, not of the account, and stay client-side even once
 * the server owns everything else.
 */

export interface Settings {
  /**
   * Show a term's definition beside a card while inspecting it, during a match.
   *
   * On by default — the game is a study aid first. Turning it off is for a
   * player who has learned the material and wants the board to read faster. It
   * never affects the collection or review mode, where definitions always show,
   * and it never puts the definition on the card face.
   */
  definitionsInGame: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  definitionsInGame: true
};

const KEY = 'flashstone.settings';

function load(): Settings {
  if (!browser) return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(KEY);
    // Merged over the defaults so a setting added later has a value on an old
    // stored object, rather than arriving as undefined.
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function createSettings() {
  const { subscribe, update, set } = writable<Settings>(load());

  function persist(value: Settings): Settings {
    if (browser) {
      try {
        localStorage.setItem(KEY, JSON.stringify(value));
      } catch {
        // Storage disabled or full — the setting still applies this session.
      }
    }
    return value;
  }

  return {
    subscribe,
    toggle: (key: keyof Settings) =>
      update((value) => persist({ ...value, [key]: !value[key] })),
    set: (value: Settings) => set(persist(value)),
    /** Re-reads storage. Needed once on mount, since SSR loads the defaults. */
    hydrate: () => set(load())
  };
}

export const settings = createSettings();
