# Phase 1 — The SL card set

**Covers list items 5, 9, 10, 11.**
**Depends on:** nothing. **Blocks:** Phases 3, 4, 5.

Turn `slcards.txt` into the game's entire card pool: 157 unique cards, each with its
own statline and its own ability, plus the art pipeline they will eventually hang art
on, plus the ownership and deck-legality rules the shop will later feed.

At the end of this phase the game is still single-player and still entirely
client-side. Nothing here needs a server.

---

> ## Completed 2026-08-21 — 171 tests, 0 check errors, build green
>
> **Three deviations from the plan as written, all deliberate:**
>
> 1. **The generator emits `slTerms.ts` (data only); `slCards.ts` is hand-written.**
>    The plan had one generated file carrying inline statlines so Paul could retune a
>    card. That is self-defeating — regenerating would erase every edit. The split puts
>    the regenerable data in one file and the mechanical layer plus an `OVERRIDES` map
>    in another, so hand-tuning survives `npm run cards`.
> 2. **155 cards, not 157.** Slug matching found two further duplicates that
>    exact-string matching missed — `User-centred research Methods` / `User-Centred
>    Research Methods` and `Finite element analysis (FEA)` / `Finite Element Analysis
>    (FEA)`. Same terms, different capitalisation. Also: **11** terms span multiple
>    sections, not 10, because `User-Centred Research Methods` appears in **three**
>    (A2.1, B1.1, C1.2).
> 3. **`/import` is a shelved notice page, not the original route.** The plan said keep
>    the route file. It could not compile: it wrote imported cards into a collection
>    that is now a count of ids from a fixed registry. The parsers, `fieldMapper.ts` and
>    all 33 of their tests are untouched and passing; the old page is in git history.

## Preconditions

- `npm test` → 126 passing. `npm run check` → 0 errors.
- `slcards.txt` is at the repo root. It is **input data, not code** — never edit it to
  make a parser's life easier; fix the parser.

## Files this phase touches

| File | Change |
|---|---|
| `scripts/build-sl-cards.mjs` | NEW — generator |
| `src/lib/data/slCards.ts` | NEW — generated, checked in |
| `src/lib/data/slCards.test.ts` | NEW |
| `src/lib/data/starter.ts` | NEW — the 15 starter cards |
| `src/lib/data/templates.ts` | extend with ability pools |
| `src/lib/collection/owned.ts` | NEW — ownership model |
| `src/lib/decks/deck.ts` | copy rule: per-template → per-card + Legendary 1 |
| `src/lib/decks/deck.test.ts` | update to the new rule |
| `src/types/cards.ts` + `src/validators/card.validator.ts` | new fields, **same commit** |
| `src/lib/engine/engine.ts` | ability gaps (§3) |
| `src/utils/art.ts` | manifest lookup + CSS fallback |
| `static/art/README.md` | NEW — the spec Paul draws to |
| `src/routes/+layout.svelte`, `src/routes/+page.svelte` | drop `/import` from nav |
| `src/routes/decks/+page.svelte` | follow the new copy rule |

---

## 1. Parse `slcards.txt` into cards

The parse is done **once, by a script, into a checked-in TypeScript file** — not at
runtime. Rationale: the card set is the game's balance surface. It must be diffable in
review, hand-editable by Paul afterwards, and identical on every machine. A runtime
parser would make every card a moving target.

- [x] **1.1** Write `scripts/build-sl-cards.mjs`. Reads `slcards.txt`, writes
      `src/lib/data/slCards.ts`. Add `"cards": "node scripts/build-sl-cards.mjs"` to
      `package.json` scripts.
      *Format traps, all present in the real file:* header lines are bare section codes
      that may carry trailing tabs (`A2.2\t\t\t…`), may be preceded by a blank line, and
      one ends in a colon (`C4.1:`). Term rows are `Term<TAB>Definition` followed by a
      run of empty tab-separated columns — split on the **first** tab only and
      right-trim. Definitions contain curly quotes and em dashes; keep them.
      → **verify:** the script reports `167 rows, 14 sections, 157 unique cards` and the
      per-section counts in `DECISIONS.md` §1.

- [x] **1.2** Dedupe by term, keeping the first definition, and record every section a
      term appeared under as `sections: string[]`. Mark `C4.1` cards `hl: true`.
      → **verify:** the 10 known duplicate terms listed in `DECISIONS.md` §1 each appear
      exactly once in the output, with two entries in `sections`.

- [x] **1.3** Card identity: `id` is a **stable slug of the term**
      (`lowercase, non-alphanumerics → '-'`, e.g. `user-centred-design-ucd`), not a hash
      and not an index. Ownership, decks and pack history are all keyed on this id and
      must survive re-running the generator, reordering the file, or editing a definition.
      → **verify:** a test asserts all 157 ids are unique, non-empty, and match
      `/^[a-z0-9-]+$/`; re-running the generator produces a byte-identical file.
      > **Conflict, confirmed by reading the file:** `card.validator.ts` declares
      > `id: z.string().uuid()`. Slug ids **will fail validation**. Relax it to
      > `z.string().regex(/^[a-z0-9-]+$/)` in the same commit, and check nothing else
      > depends on ids being UUIDs (`fieldMapper.ts`'s `deterministicUuid` still produces
      > them for the shelved import path — the schema must accept both).

- [x] **1.4** `name` is the term verbatim. `description` is the definition, **but see
      Phase 2 item 7** — the definition moves off the play-table card face. Store it on
      the card as `definition`; leave `description` for the card's *ability text*.
      → **verify:** `npm run check` passes with both fields typed in `src/types/cards.ts`
      and mirrored in `card.validator.ts`.
      > **Second conflict in the same file:** `card.validator.ts` declares
      > `description: z.string().min(1).max(200)`. Per `DECISIONS.md` §8 a vanilla card's
      > text is **empty**, so `.min(1)` must become `.min(0)`. Both validator changes go
      > in one commit with the type change.

## 2. Give each card its own statline and ability

Paul's rule: *"Each term+definition gets its own unique stats and ability."* Item 10
says `templates.ts` supplies the statlines for this **initial pass**, with more variety
added afterwards — so this step is a deterministic first assignment that Paul can then
hand-edit in `slCards.ts`, not a hand-authored set of 157.

- [x] **2.1** Assign each card a template via `templateForHash(hash(id))` — the existing,
      tested binding. Copy the template's cost/attack/health/rarity/keywords **inline
      into the generated card** rather than storing a `templateId` reference. Once the
      values are on the card, Paul can retune one card without disturbing another, which
      a shared template forbids.
      → **verify:** a test asserts every generated card's statline is a real row of
      `TEMPLATES`, and that the rarity mix is within a few points of `RARITY_WEIGHTS`.

- [x] **2.2** Add an **ability pool** to `templates.ts`: a rarity-weighted list of
      `Effect` objects using only triggers and actions the engine already resolves
      (`Battlecry`/`Deathrattle`/`StartOfTurn`/`EndOfTurn` × `DealDamage`/`DrawCard`/
      `BuffAttack`/`BuffHealth`/`Heal`/`SummonToken`/`Destroy`/`GainKeyword`/`Freeze`/
      `Silence`). Assign deterministically from a second slice of the card's hash.
      Commons may draw the empty pool (vanilla) — not every card needs an ability, and a
      board where every minion triggers is unreadable.
      → **verify:** every generated card passes the Zod `CardSchema`; a test asserts no
      card carries a `Passive` trigger (it is a no-op, see §3).

- [x] **2.3** Make **~15% of the set Spells** rather than Minions, chosen by hash, so the
      "cast 10 spells" quest in Phase 4 is achievable and the deck builder has variety.
      Spells take their cost from the template and drop attack/health.
      → **verify:** the generated set reports its Minion/Spell split; a 30-card auto-built
      deck contains at least 3 spells.

- [x] **2.4** Generate each card's `description` from its effects — a small formatter, so
      text and behaviour can never disagree. Per `DECISIONS.md` §8 this is **only text
      relevant to the game**: a card whose whole text is a keyword reads `Charge`, and a
      card with nothing but stats gets `''`. Keywords are already rendered as their own
      line in `CardPreview.svelte`, so the formatter must **not** repeat them into
      `description` — that would print `Charge` twice.
      → **verify:** a test round-trips every card: the description mentions every effect's
      action and value, contains no keyword name, and is `''` for every vanilla card.

- [x] **2.5** **A registry, so new cards can be injected later** (`DECISIONS.md` §9).
      `src/lib/data/cards.ts` exports `ALL_CARDS` and `cardById()`, merging the generated
      `slCards.ts` with a hand-authored `src/lib/data/customCards.ts` (empty at first;
      Phase 1B's spells and weapons land there). **Nothing outside this module may import
      `slCards.ts` directly** — that is what keeps additions to one file.
      → **verify:** add a throwaway card to `customCards.ts`; it appears in `/decks`, is
      packable, and is deck-legal, with no other file touched. A test asserts ids are
      unique **across both sources** and that a collision throws at module load rather
      than silently shadowing.

## 3. Close the engine gaps these abilities expose

`HANDOVER.md` §7 lists these as known. They were harmless while every card was a vanilla
imported minion. **Real abilities make three of them load-bearing.** Fix only these three.

- [x] **3.1** *"Spells with no Battlecry-triggered effect do nothing when played."* Give
      spells a defined trigger convention — treat a spell's effects as firing on cast
      regardless of the `Battlecry` label, or require the generator to always emit
      `Battlecry` on spells. Pick one and state it in a comment.
      → **verify:** a test plays a generated damage spell and asserts the damage lands.

- [x] **3.2** *"`GainKeyword` has no keyword field in the schema; the engine uses
      `effect.condition` to carry the keyword name, defaulting to `Taunt`."* Add a proper
      `keyword?: Keyword` field to `Effect` in `src/types/cards.ts` **and**
      `card.validator.ts`, and read it in `resolveEffect`. Keep reading `condition` as a
      fallback so nothing already stored breaks.
      → **verify:** a test grants Divine Shield via the new field and asserts the minion
      has it; the existing `GainKeyword` tests still pass.

- [x] **3.3** *"`Passive` trigger is a no-op."* Do **not** implement it. Instead make the
      generator incapable of emitting it, and add a comment in `types/cards.ts` saying so.
      → **verify:** covered by 2.2's test.

> Deliberately **not** fixed here: manual targeting (effects still auto-resolve their
> targets), `HeroPower` cards, and armor having no source. None of them block this phase.
> Leave them in `HANDOVER.md` §7.

## 4. Ownership and deck legality

- [x] **4.1** New `src/lib/collection/owned.ts`: the collection is now
      `Record<cardId, { copies: 1 | 2; gold: 0 | 1 | 2 }>` — how many copies you own and
      how many of those are gold — not a list of imported card objects. The card
      *definitions* come from the registry (2.5); ownership is just counts.
      Provide `ownedCards()`, `ownedCount(id)`, `goldCount(id)`, `addCopies()`,
      `upgradeToGold()`, `isComplete()`.
      **Gold rules are in `DECISIONS.md` §10** — a gold copy *overrides* a standard one
      rather than adding to the total, so `gold <= copies <= 2` is an invariant.
      `isComplete()` is computed from the live registry, never cached (`DECISIONS.md` §9).
      → **verify:** unit tests for each, including that `addCopies` clamps at 2, that
      `upgradeToGold` on a card you own 2 standard copies of leaves `copies` at 2 and
      raises `gold` to 1, and that `gold > copies` is impossible.

- [x] **4.1b** Render gold cards distinctly — an animated shimmer layer and a gold frame
      over the standard card, per `DECISIONS.md` §5. **The illustration is the same**; the
      foil is a treatment. Applies in hand, on board, in the collection and in pack opening.
      → **verify:** a gold card is unmistakable at hand size, and the shimmer does not
      make its text harder to read.

- [x] **4.2** `src/lib/data/starter.ts`: the fixed **15 starter card ids**, 2 copies each.
      Curate for a playable curve — roughly 3 one-drops, 4 twos, 3 threes, 2 fours, 2
      fives, 1 six, no Legendaries — drawn from the A-section terms so a new player meets
      the foundational vocabulary first.
      → **verify:** a test asserts exactly 15 ids, all present in `slCards.ts`, no
      Legendary, and that the resulting 30 cards form a legal deck under 4.3.

- [x] **4.3** Rewrite the copy cap in `src/lib/decks/deck.ts`: **per card id**, 2 copies,
      **except Legendary = 1** (`DECISIONS.md` §2). `countOfTemplate`, `templateOf`,
      `groupByTemplate`, `templateCount` and `maxDeckSize` are all template-shaped and
      should be re-expressed per-card. Keep `DECK_SIZE = 30`.
      → **verify:** `src/lib/decks/deck.test.ts` updated — including a new test that a
      third copy of a Common is refused and a *second* copy of a Legendary is refused.
      Whole suite green.

- [x] **4.4** Update `src/routes/decks/+page.svelte` to the per-card model: the collection
      grid shows all 157 cards, owned ones lit and unowned ones dimmed with a lock, with
      the owned count (`1/2`, `2/2`) on each. Filters by cost, rarity **and section**.
      → **verify:** in the browser — unowned cards cannot be added; the counter matches;
      auto-build produces a legal deck from a starter-only collection.

## 5. Art pipeline and placeholders

Item 5. This phase ships the **pipeline**, not the art.

- [x] **5.1** `static/art/README.md` — the spec Paul draws to. Fix and write down:
      aspect ratio and pixel size for the card art window (the current `.art` box in
      `CardPreview.svelte` is 118×50 CSS px inside a 134×168 card, so specify a single
      generous source size at a 2.36:1 ratio and let CSS crop), format (**WebP**, PNG
      accepted), colour space, and the filename convention `static/art/cards/<card-id>.webp`.
      Same for `static/art/backs/<back-id>.webp` at the full card ratio.
      → **verify:** Paul can read it and start drawing without asking a follow-up question.

- [x] **5.2** `src/utils/art.ts`: add `artUrlFor(cardId)` that resolves a manifest entry
      and returns `null` when there is none. **Keep `artFor(name)`'s generated CSS art as
      the fallback** — it is deterministic and already shipping, and it means all 157
      cards render on day one.
      → **verify:** a card with no art file renders exactly as it does today; a card with
      one renders the image. Test both branches.

- [x] **5.3** Build the manifest with `import.meta.glob('/static/art/cards/*.webp')` (or a
      generated list) so **dropping a file in the folder is the entire act of adding art** —
      no code edit, no registry to update.
      → **verify:** drop one placeholder file in, reload, that one card changes.

- [x] **5.4** **Spec the UI element art too** — *partially wired, see below.* (`DECISIONS.md` §5). Paul is drawing
      Deathrattle, Windfury, Taunt, Divine Shield, Charge, Stealth, the health gem, the
      attack gem, the mana crystal, the rarity gem and the spell/weapon type marks.
      Enumerate every one in `static/art/README.md` with its **exact pixel size, format
      and whether it needs transparency**, taking the sizes from the CSS that draws them
      today — e.g. the attack and health gems are 23×23 CSS px in `CardPreview.svelte` and
      the cost crystal is 38×42, so specify 3× source assets. Load them from
      `static/art/ui/`, each **falling back to today's CSS-drawn version** when absent.
      → **verify:** every listed element has a size in the README; removing all art files
      returns the game to exactly its current appearance.

- [x] **5.5** Spec the two gold-variant assets — one gold frame, one shimmer texture —
      in the same README. **Not 157 more illustrations.**
      → **verify:** the README says so explicitly, so nobody starts drawing 157 of them.

> **Conflict note for parallel work with Phase 2:** 5.2/5.3 touch `CardPreview.svelte`'s
> `.art` element only. Phase 2 touches its hover transform, its `.rules` panel and adds
> an inspect modal. If both phases are live at once, do 5.2/5.3 **after** Phase 2's
> step 1, or expect a small merge in one element.

## 6. Shelve the import mechanic

- [x] **6.1** Remove `/import` from the nav in `src/routes/+layout.svelte` and from the
      menu in `src/routes/+page.svelte`. Leave the route file, the parsers, `fieldMapper.ts`
      and all their tests **on disk and passing** (`DECISIONS.md` §7).
      → **verify:** no link reaches `/import`; `npm test` still runs the 33 parser tests.

- [x] **6.2** Retire `src/lib/data/demoDeck.ts` as the play-route default — `play/+page.svelte`
      falls back to the **starter deck** instead. Delete `demoDeck.ts` only if nothing
      imports it.
      → **verify:** a fresh browser profile (empty localStorage) loads `/play` and gets a
      legal 30-card starter deck, not the 12 placeholders.

- [x] **6.3** Give the AI **its own deck** instead of mirroring the player's
      (`HANDOVER.md` §7: *"Both sides play the player's deck"*). A fixed, seeded 30-card
      list from the full set is enough.
      → **verify:** play a match; the opponent plays cards that are not in your deck.

- [x] **6.4** Update `/learn`'s "How your flashcards become cards" section, which describes
      the now-shelved import flow.
      → **verify:** read it; nothing on the page tells the player to import a CSV.

---

## Done when

- `npm test` green (expect ~150+ tests), `npm run check` 0 errors, `npm run build` succeeds.
- A fresh profile can open `/play` and win a match with the starter deck.
- `/decks` shows all 157 cards with 15 owned.
- Every card renders art (generated fallback), and dropping one `.webp` into
  `static/art/cards/` swaps that card's art with no code change.
- `HANDOVER.md` §3 ("Design decisions") and §7 (known gaps) updated in the final commit:
  import is shelved, the copy rule is per-card, the three engine gaps you fixed are struck.

## Found along the way

Real problems noticed but out of scope. **Not fixed.**

- **UI element art is specced and indexed, but only four elements are wired.**
  `cost-crystal`, `attack-gem`, `health-gem` and `rarity-gem` read from
  `static/art/ui/` today. The board and tray elements (Taunt, Divine Shield, the
  keyword marks, the mana crystals) are listed in `static/art/README.md` with their
  sizes and are safe to draw now, but no component reads them yet — they get wired
  when the table is rebuilt in Phase 2 §6.1. Drawing them early costs nothing.
- **The rarity mix is thin at the top: 78 Common, 46 Uncommon, 25 Rare, 2 Epic,
  4 Legendary.** That is exactly what `RARITY_WEIGHTS` produces over 155 draws, but
  the sampling noise means Epic is *rarer than Legendary*, and a 2-card Epic pool is
  awkward for Phase 4's pack rarity slots. For a curated set, **allocating** rarities
  (e.g. exactly 78/46/23/6/2) would be better than rolling them. That is a design
  decision, not a bug — see `OPEN-QUESTIONS.md` #14.
- **Long terms truncate hard on the card plate.** The nameplate is one line at 8px
  with `text-overflow: ellipsis` in a 134px card, and terms like "Percentile Range
  (Upper and Lower Limits)" and "Advantages of User-Centred Design (UCD)" lose most of
  their text. Phase 2 rebuilds the card face and should size the plate to the real
  names, or allow two lines.
- **Spell cost still does not track spell power closely.** Cost now gates the effect
  pool (cheap spells cannot draw `Destroy`, expensive ones cannot draw a lone
  `Freeze`), but within a pool a 4-mana and an 8-mana spell can draw the same effect.
  Hand-tune the outliers through `OVERRIDES` in `slCards.ts`.
- **Seven self-hosted font files are missing**, so every page logs 404s and falls back
  to Georgia. Pre-existing and documented in `static/fonts/README.md`; unrelated to
  this phase.
- **`demoDeck.ts` was kept**, against step 6.2's default. Nothing in the app imports it
  any more, but `engine.test.ts` and `ai.test.ts` use its hand-crafted cards as
  fixtures with known effects — better fixtures than generated SL cards would be.
