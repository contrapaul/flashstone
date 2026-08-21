import { describe, expect, it } from 'vitest';

/**
 * The engine has to run in three places: vitest, the browser, and — from Phase 5
 * — inside a Durable Object. Only the second has a DOM.
 *
 * This reads the source rather than importing and calling it, on purpose: a DOM
 * reference on a branch the tests never take would still break the Worker at
 * runtime and would still pass an import-and-call test.
 *
 * Uses Vite's raw glob rather than `node:fs`, so it needs no `@types/node`.
 */

const SOURCES: Record<string, string> = import.meta.glob(
  [
    '/src/lib/engine/*.ts',
    '/src/lib/packs/*.ts',
    '/src/lib/decks/deck.ts',
    '/src/lib/collection/owned.ts',
    // These directories hold both portable rules and browser-only clients, so
    // they are listed file by file rather than globbed. `net/client.ts` and
    // `quests/client.ts` are the browser halves and are deliberately absent.
    '/src/lib/net/protocol.ts',
    '/src/lib/net/room.ts',
    '/src/lib/net/ticket.ts',
    '/src/lib/quests/quests.ts'
  ],
  { query: '?raw', import: 'default', eager: true }
);

/** Globals that exist in a browser and not in a Worker. */
const FORBIDDEN: [string, RegExp][] = [
  ['window', /\bwindow\b/],
  ['document', /\bdocument\b/],
  ['localStorage', /\blocalStorage\b/],
  ['sessionStorage', /\bsessionStorage\b/],
  ['navigator', /\bnavigator\b/],
  ['a svelte import', /from ['"]svelte/],
  ['a $app import', /from ['"]\$app\//]
];

const FILES = Object.keys(SOURCES).filter((path) => !path.endsWith('.test.ts'));

describe('code that must run inside a Durable Object', () => {
  it('covers the modules the match room needs', () => {
    expect(FILES.length).toBeGreaterThan(8);
    expect(FILES).toContain('/src/lib/engine/engine.ts');
    expect(FILES).toContain('/src/lib/decks/deck.ts');
    expect(FILES).toContain('/src/lib/net/protocol.ts');
  });

  it.each(FILES)('%s touches no browser-only global', (path) => {
    // Strip comments so prose about `window` does not trip the check.
    const code = SOURCES[path].replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    for (const [name, pattern] of FORBIDDEN) {
      expect(pattern.test(code), `${path} references ${name}`).toBe(false);
    }
  });
});
