import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// The engine is plain TypeScript, so tests skip the SvelteKit plugin entirely —
// loading it leaves a Vite server hanging after the run.
//
// `$lib` still has to resolve, because the server modules under src/lib/server
// use it. A plain alias does that without pulling in the plugin; do not swap
// this for `sveltekit()` to get the alias "for free".
export default defineConfig({
  resolve: {
    alias: {
      $lib: fileURLToPath(new URL('./src/lib', import.meta.url))
    }
  },
  test: {
    include: ['src/**/*.test.ts']
  }
});
