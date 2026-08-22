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

### The one finding that matters

Measured against the real `openPack`, not estimated:

| Goal | Packs | Days at ~265 gold/day |
|---|---|---|
| One class's 10 cards, 2 copies | 52–57 | **~22** |
| The entire 210-card collection | 78 | **~29** |

Getting your own class's cards takes three quarters as long as getting *every card
in the game*. The player's most-wanted cards are the slowest thing to obtain.

The cause: packs never deal a card you already have two of, so the 170 Neutral
cards fill in quickly, while the reserved class slot deals a card of **any** class
— only a quarter of it is yours.

Simulated fix, changing only that slot to favour the opener's class:
**17–19 packs (~7 days) for your own set, full collection unchanged at 78.**
Not applied — it is a design decision about whether packs should know who is
opening them, and it is Paul's call.

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
