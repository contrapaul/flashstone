# Flashstone — Handover

Continuation of work done in `contrapaul/make` at `fun/flashcards/`. That copy is now
**abandoned**; this repo is the live one. Written 2026-07-25.

---

## 1. Repo state

The app lives at the **repo root** — flattened out of the original `flashcards/`
subdirectory on 2026-07-25, so the game serves at `/` on the subdomain rather than a
deeper path.

```
flashstone/
├── src/
├── package.json  svelte.config.js  vite.config.ts  vitest.config.ts  tsconfig.json
├── wrangler.toml         ← Cloudflare Pages config, see §6
├── .gitignore            ← node_modules/, .svelte-kit/, .wrangler/, .dev.vars, .DS_Store
├── .claude/launch.json   ← dev server on :5173
└── CLAUDE.md  HANDOVER.md  LICENSE
```

Note: at the time of writing only `LICENSE` was committed — the app itself was still
untracked, pending the first real commit. Check `git status` before assuming.

---

## 2. Verify the toolchain works before changing anything

From the app directory:

```bash
npm install && npx svelte-kit sync && npm test && npm run build && npm run check
```

Expected: **33 tests pass**, build succeeds via `@sveltejs/adapter-cloudflare`, check
reports **0 errors**. That was the verified state at handover. `svelte-kit sync` must run
before `check` on a fresh clone or `tsconfig.json` fails to resolve its `extends`.

---

## 3. What this project is

A Hearthstone-style card game whose **decks are generated from flashcards**. Package name
is still `study-strike` — rename to `flashstone` if you want.

**It is playable right now** against a scripted AI: `npm run dev` → http://localhost:5173.

### Design decisions Paul already made — do not reopen without asking

- **Flashcards affect deck construction only. There is NO in-match quizzing.** Cards are
  generated from study material at import time; the match itself is plain Hearthstone.
  `_rawFront`/`_rawBack` are captured on import and deliberately unused during play.
  This was chosen over three alternatives (answer-to-play, quiz-for-mana, answer-to-attack).
- Opponent is a **local scripted AI**. No multiplayer, no hot-seat.
- **All state is client-side.** D1 is not wired up.
- Rules use standard Hearthstone defaults: 30 hero health, 7-minion board cap, 10 max mana,
  +1 mana/turn, player first with 3 cards, AI draws 4 + The Coin, fatigue on empty deck.

---

## 4. Toolchain landmines — five things that were broken, don't reintroduce them

This project had **never successfully built** before this work. Each of these is a real
trap, not a style preference:

1. **`@sveltejs/vite-plugin-svelte` must stay `^3.x`.** The code is Svelte 4
   (`export let`, `$:`). Plugin v4 requires Svelte 5 — that peer conflict made
   `npm install` literally impossible. Don't "helpfully" bump it without migrating to runes.
2. **`svelte.config.js` needs `vitePreprocess()`.** Without it, `lang="ts"` in `.svelte`
   files is not compiled and every component fails with "Unexpected token".
3. **`sveltekit` is imported from `@sveltejs/kit/vite`**, not from the Svelte plugin, and
   the adapter is a *default* import from `@sveltejs/adapter-cloudflare`.
4. **`vitest.config.ts` deliberately omits the SvelteKit plugin.** The engine is plain TS;
   loading the plugin leaves a Vite server hanging ~10 s after every run.
5. **Svelte 4 reactivity gotcha, already hit once:** a prop expression like
   `targetable={isTargetable(m.id)}` never re-runs, because the compiler only tracks
   identifiers *referenced in the expression*. Use a reactive value
   (`$: targetableIds = new Set(...)`) instead of a function call. This caused a real bug
   where enemy minions didn't highlight as attack targets.

---

## 5. Architecture

The engine is pure TypeScript and fully decoupled from Svelte and from cards' origin.

| File | Role |
|---|---|
| `src/types/cards.ts` | `Card`, `Effect`, and the `Trigger`/`Action`/`Target` unions |
| `src/validators/card.validator.ts` | Zod `CardSchema` — must stay in sync with the unions above |
| `src/lib/engine/state.ts` | `MatchState`, `MinionInstance`, constants, `canAttack`, `legalTargets` (Taunt rule) |
| `src/lib/engine/engine.ts` | `createMatch`, `playCard`, `attack`, `endTurn`, effect resolution, `COIN_CARD` |
| `src/lib/engine/rng.ts` | Seeded RNG — matches are reproducible from `state.seed` |
| `src/lib/engine/ai.ts` | `playAiTurn` — curve-out, Coin logic, Taunt clearing, free trades, lethal check |
| `src/lib/data/demoDeck.ts` | 12 placeholder cards; `buildDemoDeck()` = 2 copies each |
| `src/routes/+page.svelte` | Board UI, targeting, match log, game-over overlay |
| `src/lib/components/` | `CardPreview.svelte` (hand), `MinionView.svelte` (board) |
| `src/lib/parsers/`, `src/utils/rarity.ts` | Import pipeline — **written but not wired to anything** |

**Conventions:** engine functions mutate `MatchState` in place and return a boolean for
legality; the UI reassigns (`state = state`) to trigger Svelte reactivity. Effect targets
resolve automatically — there is no manual targeting in v0.1.

**The clean seam:** `createMatch(playerDeck, aiDeck, seed)` takes a plain `Card[]`.
Swapping demo cards for imported ones is a one-line change.

---

## 6. Deployment

Serving at `/` on its own subdomain means **no `kit.paths.base` is needed**, and
`@sveltejs/adapter-cloudflare` is the right adapter — no conversion to `adapter-static`.

`wrangler.toml` is configured and the production artifact was verified locally with
`wrangler pages dev` (Worker compiled, `/` returned 200, `/_app/immutable/*` assets
resolved, unknown paths 404'd correctly):

```toml
name = "flashstone"
compatibility_date = "2025-07-18"
compatibility_flags = ["nodejs_compat"]
pages_build_output_dir = ".svelte-kit/cloudflare"
```

Two settings there are load-bearing and were found by actually running the artifact:

- **`nodejs_compat` is required.** SvelteKit's server bundle imports `node:async_hooks`;
  without the flag the Worker fails to boot.
- **`compatibility_date` must not exceed what the installed runtime supports.** wrangler
  3.114 caps at `2025-07-18`; a later date silently falls back with a warning.

Deploy either by connecting the repo in the Cloudflare dashboard (build command
`npm run build`, output directory `.svelte-kit/cloudflare`) or directly with
`npm run deploy`, which builds and runs `wrangler pages deploy`.

For reference, the old location could not host this at all: `make/wrangler.toml` used
`pages_build_output_dir = "."` with no build step, so `/fun/flashcards/` served the
portfolio 404 fallback while the raw `.svelte` and `package.json` sources were publicly
readable. Using a build command means only built assets publish.

---

## 7. Known gaps and the next real feature

### The import pipeline is written but connected to nothing
Grep-verified: nothing in the app calls `parseCSV`, `parseMD`, `mapRowsToCards`,
`CardSchema`, or the rarity helpers. The only reference outside their own files is a test.
There is one route (`/`). Missing: file upload, column-mapping screen, a validation step,
deck persistence (localStorage), and a deck picker.

### The blocker worth solving first — needs Paul's input
A typical flashcard export has only front/back columns. Traced through `mapRowsToCards`:
no attack/health columns → `isMinion` is false → **every card becomes a Spell**; and
`parseEffectsFromText` only fires on the literal words "Battlecry"/"Deathrattle", which
real answer text never contains → **`effects: []`**. So importing actual study material
yields a deck of zero-effect spells that do nothing when played.

This needs a **deterministic stat-derivation strategy** — hash card text into
cost/attack/health/rarity. `src/types/cards.ts` already anticipates it in its header
comment ("deterministic fallbacks, rarity-weighted drafting"). **Ask Paul how he wants
decks to feel before building this** — it determines the whole game's texture.

### Smaller known issues
- `fieldMapper.ts` fallback cost is `(front.length + back.length) / 5` — a **float**, which
  `CardSchema`'s `.int()` rejects. Every card imported without a cost column fails validation.
- `fieldMapper.ts` hardcodes `_importSource: 'csv'` even for markdown input.
- `GainKeyword` has no keyword field in the schema; the engine uses `effect.condition` to
  carry the keyword name, defaulting to `Taunt`. Worth a proper schema field.
- `Passive` trigger is a no-op. `HeroPower` cards are treated as Spells.
- Spells with no `Battlecry`-triggered effect do nothing when played.
- `@sveltejs/adapter-auto` is an unused dependency.
- `GainMana` was **added** to the `Action` union (and the Zod enum) to make The Coin
  expressible — the original 8 actions couldn't represent it.
- `weightedRandomPick` in `rarity.ts` uses `Math.random`, not the engine's seeded RNG.
  Fine today (unused by the engine), but drafting features should use the seeded RNG.

---

## 8. Commands

```bash
npm run dev      # http://localhost:5173
npm test         # vitest, 33 tests
npm run check    # svelte-check, expect 0 errors
npm run build    # production build via adapter-cloudflare
```

---

## 9. What was verified at handover

33/33 tests pass; `npm run build` succeeds; `npm run check` reports 0 errors. Exercised
live in a browser with no console errors: playing cards and spending mana, summoning
sickness blocking attacks, target highlighting, a 4/2-into-2/1 trade killing both minions,
Battlecry token summoning, a StartOfTurn buff accumulating, the AI coining into a 2-drop,
and fatigue → loss overlay → restart.

Consider copying `CLAUDE.md` over from the `make` repo — it holds Paul's working
guidelines (simplicity, surgical diffs, verify-by-test).
