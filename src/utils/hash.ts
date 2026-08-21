/**
 * FNV-1a, the one hash the card set is built on.
 *
 * It lives in its own module because it is needed in three places with very
 * different constraints: card generation, art, and — from Phase 5 — inside a
 * Durable Object. `utils/art.ts` uses Vite's `import.meta.glob`, which esbuild
 * (and therefore wrangler's bundler) does not understand, so anything the Worker
 * bundles must not reach art.ts. Pulling the hash out is what keeps the card
 * registry importable from both.
 *
 * Stable across runs and platforms. Changing it re-rolls every card's statline,
 * ability and art at once — don't.
 */
export function hashText(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}
