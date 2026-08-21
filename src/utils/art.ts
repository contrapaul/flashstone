// Card art.
//
// Two layers, in order of preference:
//
//  1. **Drawn art** — a file under `static/art/`. Dropping a file in is the
//     entire act of adding art: the manifests below are built from the
//     filesystem at build time, so there is no registry to update. See
//     `static/art/README.md` for the sizes and formats to draw to.
//  2. **Generated art** — the deterministic CSS gradient below, used whenever
//     there is no file. It means every card renders from day one, and it never
//     goes away: art arriving is always an upgrade, never a prerequisite.
//
// The generated layer is a pure function of the card's own text. Keep its hash
// in sync with the one used for stat derivation in fieldMapper.ts — a card's
// art and its stats should come from the same seed.

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


// ── Drawn art ─────────────────────────────────────────────────

/**
 * Filenames only — the modules are never imported, so the images are not pulled
 * into the JS bundle. They are already served from `static/` at their own URL;
 * all we need from Vite is which ones exist.
 */
const CARD_ART = import.meta.glob('/static/art/cards/*.{webp,png}');
const BACK_ART = import.meta.glob('/static/art/backs/*.{webp,png}');
const UI_ART = import.meta.glob('/static/art/ui/*.{webp,png,svg}');

/** `/static/art/cards/foo.webp` → `foo`. */
function indexByStem(modules: Record<string, unknown>): Map<string, string> {
  const byStem = new Map<string, string>();
  for (const path of Object.keys(modules)) {
    const file = path.slice(path.lastIndexOf('/') + 1);
    const stem = file.slice(0, file.lastIndexOf('.'));
    // `static/` is the web root at runtime, so strip it from the served URL.
    byStem.set(stem, path.replace('/static', ''));
  }
  return byStem;
}

const CARD_ART_BY_ID = indexByStem(CARD_ART);
const BACK_ART_BY_ID = indexByStem(BACK_ART);
const UI_ART_BY_NAME = indexByStem(UI_ART);

/** The drawn illustration for a card, or null to fall back to `artFor`. */
export function artUrlFor(cardId: string): string | null {
  return CARD_ART_BY_ID.get(cardId) ?? null;
}

/** The drawn face of a card back, or null for the generated one. */
export function backUrlFor(backId: string): string | null {
  return BACK_ART_BY_ID.get(backId) ?? null;
}

/**
 * A drawn UI element — `deathrattle`, `health-gem`, `mana-crystal` and the rest.
 * Null means the element keeps the CSS shape it is drawn with today.
 * `static/art/README.md` lists every name and its required size.
 */
export function uiArtUrl(name: string): string | null {
  return UI_ART_BY_NAME.get(name) ?? null;
}

/** Every card back that has art, for the shop. Always includes 'default'. */
export function availableBackIds(): string[] {
  return ['default', ...[...BACK_ART_BY_ID.keys()].filter((id) => id !== 'default').sort()];
}
