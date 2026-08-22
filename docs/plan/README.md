# Flashstone — Build Plan

Written 2026-08-21. This directory is the **single source of truth for outstanding
work**. It replaces `docs/OVERHAUL.md`, which was fully applied and has been deleted;
its one load-bearing paragraph (the event queue) now lives in `HANDOVER.md` §5.

`HANDOVER.md` remains the description of what the project **is** and what its traps
are. Read it first, then this. Keep both current.

---

## How to pick this up (any model, any session)

1. Read `HANDOVER.md` in full — especially §4 (toolchain landmines) and §5 (architecture).
2. Read `docs/plan/DECISIONS.md` — settled design parameters. **Do not re-litigate these.**
3. Read `docs/plan/OPEN-QUESTIONS.md` — genuinely undecided points, each with the
   default that applies if no answer has arrived. **No phase stalls on it.**
4. Read the phase file you are working on. Each phase is self-contained: it states its
   preconditions, the files it touches, numbered steps with a verification line each,
   and its done-criteria.
5. Verify the baseline before changing anything:

```bash
npm install && npx svelte-kit sync && npm test && npm run check
```

   Baseline after Phase 7 (2026-08-22): **377 tests pass, `svelte-check` reports 0 errors.**
   Every **build** phase is complete, including hero powers, which were deferred
   twice before Phase 6 built them. [Phase 7](PHASE-7-ECONOMY-TUNING.md) is
   **decided**: the prices stand, the pack class slot now aims at the class the
   collection is thinnest in, and a one-time new-player package hands over 7
   packs and 200 gold. Its numbers are measured but still unplayed. [Phase 8](PHASE-8-DECK-SLOTS.md) is real work — class is a
   property of a *deck*, and players are meant to keep up to ten of them, but the
   UI still exposes only one.
   If that is not what you see, fix that before starting work.

6. Work one numbered step at a time. Each step names its own check. Do not proceed
   past a failing check.
7. When a step is finished, tick its box **in the phase file** and commit. When a whole
   phase is finished, mark it Done in the status board below and update `HANDOVER.md` §7
   in the same commit.
8. When every phase is Done, delete this directory.

**Status is tracked in the files themselves, not in anyone's memory.** A model with no
history of this conversation must be able to open a phase file, see which boxes are
ticked, and continue.

---

## Status board

| Phase | Title | Covers list items | Depends on | Status |
|---|---|---|---|---|
| [1](PHASE-1-CARD-SET.md) | The SL card set | 5, 9, 10, 11 + follow-ups 1, 2, 4, 5 | — | **Done** 2026-08-21 |
| [1B](PHASE-1B-SPELLS-WEAPONS.md) | Spells, weapons, targeting | follow-up 3 | 1 | **Done** 2026-08-22 (hero powers deferred) |
| [2](PHASE-2-TABLE-UX.md) | Table & card UX | 2, 7, 8, 13 | — (light overlap w/ 1) | **Done** 2026-08-21 |
| [3](PHASE-3-ACCOUNTS.md) | Accounts & server state | (enables 3, 4, 6) | 1 | **Done** 2026-08-22 |
| [4](PHASE-4-ECONOMY.md) | Gold, packs, quests, card backs | 3, 4, 6, 12, 14 + follow-up 5 | 1, 1B, 2, 3 | **Done** 2026-08-22 |
| [5](PHASE-5-MULTIPLAYER.md) | Play Online | 1 | 1B, 3 | **Done** 2026-08-22 |
| [6](PHASE-6-CLASSES.md) | Classes & hero powers | new 2026-08-22 | 1, 1B, 3, 4 | **Done** 2026-08-22 |
| [7](PHASE-7-ECONOMY-TUNING.md) | Economy & shop review | — (decisions) | 4, 6 | **Decided** — one number changed, new-player package built; playing it is all that is left |
| [8](PHASE-8-DECK-SLOTS.md) | Deck slots (10 per player) | — | 6 | **Not started** |

"Follow-ups" are the five clarifications Paul added on 2026-08-21, recorded in
`DECISIONS.md` §8–§10 and in the Phase 1 and 1B steps: table text is game-text only,
cards must be injectable later, basic spells and weapons are needed, UI elements get
drawn art, and gold foil variants drop at 5%.

Phases 1 and 2 are independent of the server and of each other, and can be built in
parallel by two models. They collide in exactly one file — `CardPreview.svelte` — and
Phase 1's §4 note says how to keep that collision to a few lines.

Phases 3, 4 and 5 are strictly ordered: 4 and 5 both need the account and API scaffolding
that 3 builds. 4 and 5 do not depend on each other and can run in parallel once 3 lands.

---

## Recommended order and why

**1 → 1B → 2 → 3 → (4 ∥ 5) → 6**

Phase 1 first because everything downstream is expressed in terms of the card set:
packs deal cards, quests count cards played, multiplayer syncs card ids. Building the
economy against `demoDeck.ts`'s 12 placeholders would mean redoing it.

Phase 1B next because it is the other half of the card model — manual targeting and
weapons are engine features, and every later phase (the spell quest, the wire protocol)
assumes cards can do more than sit on a board. Doing it after Phase 2 would mean
rebuilding the card face and the targeting UI twice.

Phase 2 third because it is the cheapest real improvement to the thing that already
exists, it needs no infrastructure, and it makes the rest of the work pleasant to test
by hand.

Phase 3 next because it is a hard prerequisite for two large phases and is mostly a
**port, not a design job** — the auth code is lifted almost unchanged from the `time`
repo (see that phase's §1).

Phase 4 and 5 in either order or together.

Phase 6 last, because it touches everything the others built: cards gain a class,
decks gain a legality rule, packs gain a distribution question, the table gains a
button, and the match room gains one more intent to re-validate. It is also the
only phase that needs **new engine systems** rather than new content — hero
powers, spell damage, named tokens and a source of armor — so doing it earlier
would have meant building them twice.

---

## Conventions every phase follows

- **Svelte 4 only.** `export let`, `$:`, no runes. See `HANDOVER.md` §4.1.
- **Engine stays pure TypeScript.** No Svelte imports under `src/lib/engine/`. It must
  keep running in `vitest` with no DOM and, from Phase 5, inside a Durable Object.
- **Tests are the definition of done for logic.** UI is verified in a browser.
- **`src/types/cards.ts` and `src/validators/card.validator.ts` change in the same
  commit, always.** They encode the same unions twice; drift is silent.
- **Surgical diffs**, per `CLAUDE.md` §3. Every changed line traces to a numbered step.
- Anything discovered mid-phase that is real but out of scope goes in that phase's
  "Found along the way" section — not fixed silently.
