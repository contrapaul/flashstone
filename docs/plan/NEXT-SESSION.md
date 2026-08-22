# Handoff — after the economy session

Written 2026-08-22. Replaces the pre-economy handoff. Delete this file once the
deck-slots session is done.

## Where the project is

Flashstone is **feature-complete and deployed**. **377 tests pass,
`svelte-check` reports 0 errors**, and both projects build. Live at
`flashstone.contrapaul.com`, realtime Worker at
`flashstone-realtime.contrapaul.workers.dev`.

`PHASE-7-ECONOMY-TUNING.md` is **decided**. Two things changed:

1. **The reserved class slot now aims at the thinnest class.** Measured, not
   guessed: the old any-class rule left 17% of players owning nothing of some
   class after seven packs. Now every class is touched within 4 packs at worst,
   and five of every class arrives at ~16 rather than 21. The endgame is
   untouched (78 packs for everything, 56 for one class).
2. **The new-player package** (`DECISIONS.md` §13) — four one-time intro quests
   paying **7 packs and 200 gold**, plus the `Ascendant` card back, which gold
   cannot buy. Packs are now held in an inventory and opened from the shop.

Every price is unchanged: pack 100, card back 300, daily 50, AI win 25, online
win 40, quests 75/50/50/40/40, three quests a day.

## Before anything else

**Migration `0004_onboarding.sql` has been applied locally but not remotely.**

```
npx wrangler d1 execute flashstone-db --remote --file db/migrations/0004_onboarding.sql
```

Without it, `/api/profile` and every intro-quest call fail on `profiles.packs`.

## What is still open

- **Play it.** `PHASE-7` §1.1 and §5.3. The economy has been simulated at every
  step and played at none. That was true before this session and is still true;
  the numbers are just better founded now.
- **The new-player package has not been exercised in a browser.** The server
  logic is covered by `src/lib/server/intro.test.ts`, the types check and both
  projects build, but nothing has signed in and clicked Claim. Worth doing first
  after the remote migration: play one match against the AI, lose it on purpose,
  and confirm the 100 gold and the pack arrive.
- **`PHASE-8-DECK-SLOTS.md`** — ten deck slots. The schema and `/api/decks`
  already support many decks per user; **only the UI is single-deck**, so three
  of the four classes are effectively invisible. This is the real remaining work.
- **`PHASE-7` §4.1** — what the shop offers a player with a complete collection.
  Now with a wrinkle: they may be holding unopened packs, which are deliberately
  not burned on duplicates.

## How to work here

- `docs/plan/README.md` is the index; `DECISIONS.md` holds settled design and
  **must be updated in the same commit** as any number that changes.
- `HANDOVER.md` §4 lists real toolchain traps. Svelte 4 only — no runes.
- Verify before changing anything: `npm test && npm run check`.
- Economy constants are one-liners: `packs/pack.ts`, `lib/shop.ts`,
  `server/gold.ts`, `quests/quests.ts`, `quests/intro.ts`.
- `pack.test.ts` asserts the acquisition curve as a **regression guard**. If a
  change moves it, re-measure and update the number — do not nudge it to pass.

## The habit that keeps paying

Four estimates in this project turned out wrong and were caught by measuring
rather than reasoning: the acquisition rate (predicted ~17 packs, actually 57),
the AI's hero power use (predicted fine, actually never fired), the class-grind
framing (the wrong model of the player), and this session's — the reserved class
slot *looked* fine at the median and hid a 17% tail. **Simulate the number
rather than deriving it.** `openPack` is pure and seeded, which is what makes
that cheap. Keep it that way.
