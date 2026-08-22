# Handoff — economy and shop session

Written 2026-08-22 at the end of the build sessions. Delete this file once the
economy session is done.

## Where the project is

Flashstone is **feature-complete and deployed**. Every build phase in
`docs/plan/` is finished: the 155-card SL set, the table rebuild, accounts on D1,
gold/packs/quests, online play on Durable Objects, spells and weapons, and four
classes with hero powers. **364 tests pass, `svelte-check` reports 0 errors**, and
both projects build.

Live at `flashstone.contrapaul.com`, with the realtime Worker at
`flashstone-realtime.contrapaul.workers.dev`. `TICKET_SECRET`, `REALTIME_URL` and
`RESEND_API_KEY` are all set.

**Nothing is broken.** This session is about numbers, not repair.

## What this session is for

`PHASE-7-ECONOMY-TUNING.md` — read it first. It is a **decision** phase: every
price, reward and rate in the game was proposed by Claude and accepted to keep the
build moving. None has been played.

### The numbers, measured

Class belongs to a **deck**, not a player: people keep several decks across
several classes and swap between them (up to 10 slots — see below). So the
figures that matter are how fast cards spread across **all four** classes.

| Milestone | Packs | Days at ~265 gold/day |
|---|---|---|
| One card of every class | 6 | ~2 |
| Five of every class | 21 | ~8 |
| Everything, 2 copies | 78 | ~29 |

Every class is meaningfully playable inside a fortnight; the whole game is
collected in about a month. **The curve looks healthy — the job is to play it and
confirm, not to fix it.**

> **One correction worth reading, because it nearly shipped as advice.** An
> earlier draft of the economy plan led with "one class takes ~22 days versus ~29
> for everything" and proposed weighting packs toward *the opener's class*. That
> assumed a player has a class. They do not — class is per-deck. Measured against
> the right question the curve is fine, and the proposal is withdrawn. The lesson
> generalises: check the model of the player before optimising a number.

### The other outstanding work

`PHASE-8-DECK-SLOTS.md` — players are meant to keep **up to 10 decks**, each with
its own class. The schema and `/api/decks` already support many decks per user;
**only the UI is single-deck**, so three of the four classes are effectively
invisible today. Mostly interface work over machinery that already exists.

## How to work here

- `docs/plan/README.md` is the index; `DECISIONS.md` holds settled design and
  **must be updated in the same commit** as any number that changes, or the docs
  start lying.
- `HANDOVER.md` §4 lists real toolchain traps. Svelte 4 only — no runes.
- Verify before changing anything: `npm test && npm run check`.
- Economy constants are all one-liners: `packs/pack.ts`, `lib/shop.ts`,
  `server/gold.ts`, `quests/quests.ts`.
- `pack.test.ts` asserts the acquisition rate as a **regression guard**. If a
  change moves it, re-measure and update the number — do not nudge it to pass.

## Two habits worth keeping

Two estimates in this project turned out wrong and were caught by measuring
rather than reasoning: the acquisition rate (predicted ~17 packs, actually 57),
and the AI's hero power use (predicted fine, actually never fired because it
curved out to zero mana first). **Simulate the number rather than deriving it.**

The other is that `openPack` is pure and seeded, which is exactly why the
simulations above were cheap. Keep it that way.
