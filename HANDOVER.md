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

Expected: **364 tests pass**, build succeeds via `@sveltejs/adapter-cloudflare`, check
reports **0 errors**. That was the verified state at handover. `svelte-kit sync` must run
before `check` on a fresh clone or `tsconfig.json` fails to resolve its `extends`.

---

## 3. What this project is

A Hearthstone-style card game whose **decks are generated from flashcards**. Branded
**Flashstone** throughout (it was called "Study & Strike" during initial development in
the `make` repo — that name should not reappear).

**It is playable right now** against a scripted AI: `npm run dev` → http://localhost:5173.

### Design decisions Paul already made — do not reopen without asking

- **The card set is fixed and built in.** 155 cards, one per Design & Technology
  syllabus term, generated from `slcards.txt`. **The flashcard import mechanic is
  shelved** (2026-08-21): `/import` is an unlinked notice page, though the parsers and
  their 33 tests remain. See `docs/plan/DECISIONS.md` §1 and §7.
- **There is NO in-match quizzing.** The match is plain Hearthstone; the studying
  happens by reading your own cards. This was chosen over three alternatives
  (answer-to-play, quiz-for-mana, answer-to-attack).
- **A card that must be aimed is refused without a target**, never fizzled — a misclick
  must never burn the card and its mana. `Taunt does not restrict spells`; Stealth does.
- **Four classes, each with one 2-mana once-per-turn hero power.** All four are
  unlocked from the start; class *cards* are earned from packs. A class deck may
  be entirely Neutral, so picking a class gives you a **hero power, not cards** —
  nobody is ever locked out of a class they have not collected.
- **Class belongs to a deck, not to a player.** As in Hearthstone, players keep
  several decks across several classes and swap between them; there is no such
  thing as "the player's class". Up to **10 deck slots**, enforced server-side,
  each with its own class and name (Phase 8). Do not write code that assumes one
  deck or a per-player class.
- **"Your deck" means the *active* one**, `profiles.active_deck`, not the most
  recently updated — editing a deck must not change what you take into a match.
  Every reader falls back to most-recent when no choice has been made. Four
  places read it: the builder, `collection/sync.ts`, `/api/online/ticket` and
  `MatchRoom.loadDeck`. Signed out there is one deck in localStorage, and that
  copy mirrors the active deck.
- **Hero powers are data, not engine branches.** `data/classes.ts` gives each a
  list of `Effect`s that resolve through the same `resolveEffect` cards use, so a
  power can never do something a card could not.
- **Spell Damage applies to spells and hero powers only** — never a Battlecry, a
  Deathrattle or a weapon. `resolveEffect` takes an explicit `spellPowered` flag
  rather than inferring it, because the inference is right today and would break
  silently the first time anything else resolves an effect without a source.
- **Weapons are hero-side.** `heroAttack` is deliberately separate from `canAttack`, which
  is minion-shaped. Equipping replaces; it never stacks.
- **Drag is the only way to play a card.** A pointer tap opens the inspector instead, so
  a tap can never spend mana by mistake. Enter on the keyboard still picks up and places.
- **One card component, scaled — never re-laid out.** `CardInspector` renders the
  ordinary `CardPreview` at 2.5x. Do not build a context-specific card rendering; a card
  must look identical in hand, in the collection and in review. A minion on the board is
  a different object and legitimately looks different (`MinionView`).
- **A card in play shows game text only.** A keyword-only card reads `Charge`; a vanilla
  card's text panel is empty. The term's **definition never appears on the card face** —
  it lives on `card.definition` and shows in the collection, in review, and beside an
  inspected card. `DECISIONS.md` §8.
- **Copy limits are per card**: two of anything, **one of a Legendary**. The template
  library still supplies statlines but no longer gates deck legality.
- **Online play is server-authoritative.** The engine runs in a Durable Object, not in
  either browser. A client sends *intents* and receives a `PlayerView` that **never
  contains the opponent's hand** — sending the whole `MatchState` would put their cards
  in the other browser's memory and make the whole arrangement pointless.
- **One board, two modes.** `MatchTable.svelte` renders a `PlayerView` and emits intents;
  `/play` gives it a `LocalSource`, `/online/[gameId]` a `RemoteSource`. **Never branch
  the table on the mode** — that is how the two games start drifting apart.
- Practice is against a **local scripted AI** playing **its own deck** (`data/aiDeck.ts`),
  not a mirror match.
- **Accounts are D1-backed, built exactly like `time` and `make/bloodbowl`** — the
  `_lib` modules were ported near-verbatim into `src/lib/server/`. **Gold, collection
  and decks are server-authoritative**; the client may read a balance and never sets one.
  Every gold award is idempotent by primary key on `(user, source, ref)`.
- **Gold is only ever written by the server**, through `award()` in `lib/server/gold.ts`,
  which is idempotent on `(user, source, ref)`. Purchases debit with
  `UPDATE ... WHERE gold >= cost` inside a `batch`, so two racing buys cannot both
  succeed and a balance can never go negative. **Never add a code path that sets gold
  directly.**
- **Quest progress is reported by the client and clamped by the server.** The client is
  the only witness to a card being played; `MAX_INCREMENT` is what stops it mattering.
- **Playing signed out must keep working.** Practice against the AI needs no account and
  falls back to the starter collection in localStorage. Do not gate `/play` on a session.
- Rules use standard Hearthstone defaults: 30 hero health, 7-minion board cap, 10 max mana,
  +1 mana/turn, player first with 3 cards, AI draws 4 + The Coin, fatigue on empty deck.

---

## 4. Toolchain landmines — six things that were broken, don't reintroduce them

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
6. **`d1 execute --remote --file` does not work with a `wrangler login` token.**
   The `--file` form uploads to the D1 **import** API, which returns
   `Authentication error [code: 10000]` / 401 for the OAuth token wrangler 3.114
   mints — while `/memberships`, `/user` and the `--command` query endpoint all
   answer 200 on that same token. It is the endpoint, not the scope: the token
   reports `d1 (write)` and Super Administrator. Verified 2026-08-22 applying
   `0004` and `0005`.
   **Apply remote migrations with `--command` instead**, one statement per
   invocation, flattened onto one line:
   ```
   npx wrangler d1 execute flashstone-db --remote --command "ALTER TABLE profiles ADD COLUMN packs INTEGER NOT NULL DEFAULT 0"
   ```
   The files in `db/migrations/` remain the record of the schema — the commands
   are only how it gets applied. `--local --file` is unaffected and still the
   right way to migrate the dev database. Confirm afterwards with
   `PRAGMA table_info(<table>)` and
   `SELECT name FROM sqlite_master WHERE type='table'`, because a failed import
   leaves no trace either way.

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
| `src/lib/data/slTerms.ts` | **Generated** by `npm run cards` from `slcards.txt`. Data only — never hand-edit |
| `src/lib/data/slCards.ts` | Applies the mechanical layer to those terms. **Hand-editable**; holds `OVERRIDES` for tuning one card |
| `src/lib/data/cards.ts` | The card **registry** — `ALL_CARDS`, `cardById`. Nothing else may import `slCards`/`customCards` |
| `src/lib/data/customCards.ts` | Hand-authored cards merged into the registry. The injection point for new cards |
| `src/lib/data/starter.ts` | The 15 starter cards, 2 copies each = one legal deck in **any** class |
| `src/lib/data/classes.ts` | The four classes and their hero powers, as data |
| `src/lib/data/tokens.ts` | Summoned-only cards, deliberately outside the registry |
| `src/lib/data/aiDeck.ts` | The opponent's own 30-card list, built to a curve |
| `src/lib/collection/owned.ts` | Ownership as counts per card id, plus gold (foil) variants |
| `src/lib/data/demoDeck.ts` | 12 hand-crafted cards. **Test fixtures only** — no longer reachable from the app |
| `src/routes/+page.svelte` | Board UI, targeting, match log, game-over overlay |
| `src/lib/components/` | `CardPreview.svelte` (hand), `MinionView.svelte` (board), `CardInspector.svelte` (the enlarged card + definition, used by the match, the collection and review) |
| `src/lib/settings.ts` | Client-side settings store. Today: "show definitions in game" |
| `src/lib/server/` | **Server-only.** Ported auth (`crypto`, `session`, `ratelimit`, `email`), plus `collection`, `gold` and the `api` helpers. SvelteKit forbids importing these from a component |
| `src/lib/packs/pack.ts` | Pure, seeded pack generation — no duplicates, guaranteed Rare+, 5% gold |
| `src/lib/quests/` | `quests.ts` (definitions, the daily three, increment clamps), `intro.ts` (the one-time new-player track) and `client.ts` (fire-and-forget reporting) |
| `src/lib/shop.ts` | Prices and the card-back catalogue. Shared by client and server so they cannot disagree |
| `src/lib/net/` | `protocol.ts` (the wire, Zod-validated), `room.ts` (the rules, no sockets), `view.ts` (what the table may infer), `source.ts` (Local/Remote), `client.ts` (browser socket), `ticket.ts` (HMAC bridge) |
| `src/lib/components/MatchTable.svelte` | **The** board. Both modes use it |
| `workers/realtime/` | Separate wrangler project: `MatchRoom` and `Lobby` Durable Objects |
| `src/lib/server/{shop,quests,intro}.ts` | Purchases, quest progress and the intro track. Every gold movement goes through `gold.ts`; intro rewards are guarded by `intro_quests.claimed`, because packs and card backs carry no gold |
| `src/lib/collection/sync.ts` | The one place the app asks what a player owns — server when signed in, localStorage when not |
| `src/lib/account.ts` | Client cache of `/api/profile` |
| `src/hooks.server.ts` | Resolves the session cookie into `locals.user` |
| `src/routes/api/` | `auth/*`, `collection`, `decks` (+ `decks/active`), `profile`, `quests/*`, `rewards/*`, `shop/*` |
| `db/migrations/` | D1 schema. **Append-only** — never edit an applied migration |
| `src/lib/review/timer.ts` | Active-review-seconds clock — pauses on hidden tab and after 30s idle |
| `src/routes/review/+page.svelte` | Review mode — the same card, definition beside it |
| `src/lib/parsers/`, `src/utils/rarity.ts` | Import pipeline — **written but not wired to anything** |

**Conventions:** engine functions mutate `MatchState` in place and return a boolean for
legality; the UI reassigns (`state = state`) to trigger Svelte reactivity. Effect targets
resolve automatically — there is no manual targeting in v0.1.

**The event queue — why the engine looks like this.** `engine.ts` appends
presentation cues to `state.events` at every mutation site (13 of them: draw,
summon, attack, shield, damage, death, turn, freeze, silence, buff). The engine
finishes mutating first; `drain()` in `play/+page.svelte` then replays the queue
on a timeline, so an attack lunges before its target shatters. Two consequences
to respect: the visuals lag the truth by up to a second, and `myTurn` is gated on
`!draining` so the player cannot act mid-playback. An empty queue is valid — the
board simply snaps. Anything that mutates state must emit, or it will not animate.
This replaced a synchronous-engine-that-yields design, which was judged
considerably more work. (Recorded here 2026-08-21 when `docs/OVERHAUL.md`, whose
work was fully applied in `8d8841b` and `b22d22a`, was retired.)

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

**Three things the accounts work added here, all load-bearing:**

- **API routes are SvelteKit `+server.ts`, never a `functions/` directory.**
  `adapter-cloudflare` emits a `_worker.js`, and Pages ignores `functions/` whenever one
  exists — copying `time`'s layout across would 404 in production while looking right in
  the repo. This is why the ported auth has a different shell but identical internals.
- **D1 is bound as `DB`** in `wrangler.toml` (`flashstone-db`,
  `2d848ca6-c435-47f5-be5a-552037001bfe`) and reached as `platform.env.DB`. A
  dashboard-driven build needs the same binding configured in the dashboard.
- **`platformProxy` in `svelte.config.js` gives `vite dev` the real bindings**, so the
  dev loop is `npm run dev` — not a rebuild plus `wrangler pages dev`. Migrations run
  with `npx wrangler d1 execute flashstone-db --local|--remote --file <migration>`.

**Online play is a second deployment.** Cloudflare Pages cannot define Durable Object
classes, so `workers/realtime/` deploys separately with `npm run deploy:realtime`. The
browser talks to it directly; Pages only mints a signed ticket (`src/lib/net/ticket.ts`),
because a cross-origin session cookie would be a far worse trade.

Locally: `npm run dev` and `npm run realtime` together. That script passes
`--persist-to .wrangler/state` **and must keep doing so** — `wrangler dev --config <path>`
otherwise resolves state relative to the config file and the Worker gets its own empty
D1, which presents as "no such table: decks".

**Neither `RESEND_API_KEY` nor `TICKET_SECRET` is set, and nothing is deployed.** Until
they are, email is a logged no-op and online play returns "not configured". The exact
commands are in `docs/plan/PHASE-5-MULTIPLAYER.md`.

For reference, the old location could not host this at all: `make/wrangler.toml` used
`pages_build_output_dir = "."` with no build step, so `/fun/flashcards/` served the
portfolio 404 fallback while the raw `.svelte` and `package.json` sources were publicly
readable. Using a build command means only built assets publish.

---

## 7. Known gaps and the next real feature

> **Outstanding work now lives in `docs/plan/`.** That directory holds the phased build
> plan for multiplayer, gold and packs, daily quests, the SL card set, the table-UX pass
> and card art — start at `docs/plan/README.md`. This section stays as the record of
> *small known defects*; the plan owns *features*. `docs/OVERHAUL.md` was fully applied
> and was deleted on 2026-08-21; its one durable paragraph is in §5 above.


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

### Resolved by Phase 1 (2026-08-21)
- `GainKeyword` now has a real `keyword` field on `Effect`; `condition` is still read as
  a fallback.
- Spells fire correctly — the convention is that **every spell effect must be tagged
  `Battlecry`**, which is what `playCard` fires. Enforced by a test over the card set,
  not by the engine.
- `Passive` is still a no-op, but the generator can no longer emit it, and a test proves
  no card carries one.
- One collection, one deck, and the mirror match are all gone.

### Smaller known issues
- Armor now has sources (the Engineer's power and several of its cards), and the
  slot hides at zero. The long-standing gap here is closed.
- **The `'HeroPower'` CardType is still unused.** Hero powers exist, but as
  *class* powers in `data/classes.ts`, never as cards — that union member is
  vestigial.
- **Seven self-hosted `.woff2` files are missing**, so every page logs 404s and falls
  back to Georgia. See `static/fonts/README.md`.
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
npm run cards    # regenerate src/lib/data/slTerms.ts from slcards.txt
npm test         # vitest, 364 tests
npm run realtime # the Durable Object Worker on :8787 (needed for online play)
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
