import { writable } from 'svelte/store';
import { browser } from '$app/environment';
import type { Motion, OpponentPace } from './presentation/motion';

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
  /**
   * How the table moves. Full, Fast (everything at a bit over half the time),
   * or Reduced (nothing travels or shakes; it fades). Defaults to Reduced when
   * the device asks for less motion.
   */
  motion: Motion;
  /** How long the opponent's turn takes. Measured gives a new player time to see what hit them. */
  opponentPace: OpponentPace;
  /** Loudness, 0–1: everything, then music and sounds under it. */
  volume: Volume;
}

export interface Volume {
  master: number;
  music: number;
  sfx: number;
}

export const DEFAULT_SETTINGS: Settings = {
  definitionsInGame: true,
  motion: 'full',
  opponentPace: 'measured',
  volume: { master: 0.8, music: 0.7, sfx: 0.9 }
};

const KEY = 'flashstone.settings';

function load(): Settings {
  if (!browser) return DEFAULT_SETTINGS;
  const defaults: Settings = {
    ...DEFAULT_SETTINGS,
    motion: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'reduced' : 'full'
  };
  try {
    const raw = localStorage.getItem(KEY);
    // Merged over the defaults so a setting added later has a value on an old
    // stored object, rather than arriving as undefined.
    if (!raw) return defaults;
    const stored = JSON.parse(raw);
    // Volume is nested, so it is merged a level down too.
    return { ...defaults, ...stored, volume: { ...defaults.volume, ...stored.volume } };
  } catch {
    return defaults;
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
    toggle: (key: 'definitionsInGame') =>
      update((value) => persist({ ...value, [key]: !value[key] })),
    choose: <K extends keyof Settings>(key: K, choice: Settings[K]) =>
      update((value) => persist({ ...value, [key]: choice })),
    set: (value: Settings) => set(persist(value)),
    /** Re-reads storage. Needed once on mount, since SSR loads the defaults. */
    hydrate: () => set(load())
  };
}

export const settings = createSettings();
