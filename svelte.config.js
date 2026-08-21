import adapter from '@sveltejs/adapter-cloudflare';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({
      // Gives `vite dev` the real bindings from wrangler.toml — D1 included —
      // via wrangler's getPlatformProxy. Without it `platform` is undefined in
      // dev and every server route would need a fallback, or the whole team
      // would have to develop against `wrangler pages dev` on a built artifact.
      platformProxy: {
        configPath: 'wrangler.toml',
        persist: true
      }
    })
  }
};

export default config;
