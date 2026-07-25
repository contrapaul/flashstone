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

A Hearthstone-style card game whose **decks are generated from flashcards**. Branded
**Flashstone** throughout (it was called "Study & Strike" during initial development in
the `make` repo — that name should not reappear).

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

> **Keep this section current.** A stale version of it sent a later session
> chasing two bugs that had already been fixed. If you resolve something here,
> edit it in the same commit.

### Import pipeline — done
Shipped in `5f23472`. `/import` handles upload, column auto-matching, live preview
and validation; `/decks` is the deck builder with auto-build; the play route uses
the saved deck. Every imported flashcard becomes a **Minion** — question as name,
answer as description. Stats come from explicit columns when present, otherwise
from an FNV-1a hash of the card's text, with rarity-gated keywords. Deterministic:
the same flashcard always yields the same card.

`art.ts` deliberately uses the same FNV-1a constants, so a card's art and its
stats share a seed. Verified identical for identical input — don't "fix" either
hash without changing both.

### Smaller known issues
- Nothing grants `armor`, so `HeroPortrait` shows a permanent 0. Wire a source or
  drop the slot.
- **No card uses `Freeze`, `Silence` or `Stealth`.** The mechanics are implemented
  and tested, but nothing in `demoDeck.ts` uses the first two and the rarity
  keyword pools in `fieldMapper.ts` don't include Stealth — so they never appear
  in play.
- `GainKeyword` has no keyword field in the schema; the engine uses `effect.condition`
  to carry the keyword name, defaulting to `Taunt`. Worth a proper schema field.
- `Passive` trigger is a no-op. `HeroPower` cards are treated as Spells.
- Spells with no `Battlecry`-triggered effect do nothing when played.
- One collection and one deck: importing replaces rather than merges.
- Both sides play the player's deck (mirror match).
- Markdown import works in principle but only CSV has been exercised end to end;
  `parseMD`'s frontmatter fallback path looks unreachable.
- `@sveltejs/adapter-auto` is an unused dependency; the project is still on
  wrangler v3.
- `GainMana` was added to the `Action` union (and the Zod enum) for The Coin;
  `Freeze` and `Silence` were added for the overhaul. The union and the Zod enum
  must always change together.
- `weightedRandomPick` in `rarity.ts` uses `Math.random`, not the engine's seeded
  RNG. Fine today (unused by the engine), but drafting features should use it.

---

## 8. Commands

```bash
npm run dev      # http://localhost:5173
npm test         # vitest, 77 tests
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
