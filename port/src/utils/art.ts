// Deterministic card art. The same flashcard always yields the same frame,
// because everything here is a pure function of the card's own text.
//
// Keep this hash in sync with the one used for stat derivation in
// fieldMapper.ts — a card's art and its stats should come from the same seed.

import type { Rarity } from '../types/cards';

export const RARITY_COLOR: Record<Rarity, string> = {
  Common: '#b9ac93',
  Uncommon: '#5fbf6a',
  Rare: '#4a8fe0',
  Epic: '#a457e8',
  Legendary: '#f0a020'
};

const HUES = [28, 44, 262, 208, 336, 158, 12, 190];

/** FNV-1a. Stable across runs and platforms. */
export function hashText(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

/** A layered CSS background: rays + weave + a conic base, hued from the name. */
export function artFor(name: string): string {
  const h = hashText(name);
  const a = HUES[h % HUES.length];
  const b = HUES[(h >> 3) % HUES.length];
  const angle = (h >> 7) % 180;
  const spin = (h >> 5) % 360;
  return [
    `radial-gradient(120% 82% at 50% 12%, hsl(${a} 80% 62% / .5), transparent 62%)`,
    `repeating-linear-gradient(${angle}deg, rgba(255,240,210,.06) 0 2px, transparent 2px 11px)`,
    `conic-gradient(from ${spin}deg at 50% 118%, hsl(${b} 58% 32%), hsl(${a} 54% 18%) 44%, hsl(${b} 58% 28%))`
  ].join(', ');
}

/**
 * The letter stamped into the art. Uses the longest word so imported
 * flashcards don't all read "W" (What / Which / Where…).
 */
export function sigil(name: string): string {
  const longest = name
    .split(/[^A-Za-z]+/)
    .filter(Boolean)
    .sort((x, y) => y.length - x.length)[0];
  return (longest ?? name).charAt(0).toUpperCase() || '?';
}

/** Strips question boilerplate so a flashcard front reads as a card name. */
export function cardTitle(front: string): string {
  const t = front
    .replace(/\?$/, '')
    .replace(
      /^(what is|what are|what does|which|where is|where does|name the|define the|define|role of the|role of|function of the|function of)\s+/i,
      ''
    );
  return t.charAt(0).toUpperCase() + t.slice(1);
}
