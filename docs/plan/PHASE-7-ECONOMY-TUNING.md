# Phase 7 — Economy and shop review

**Status: decided 2026-08-22.** Numbers reviewed and one changed; the
new-player package in §5 was added and built. Playing to confirm §1.1 is the
only thing left.

Everything here already works. The question is whether the **numbers** are right,
and they have never been played — every value in `DECISIONS.md` §3–§4 was proposed
by Claude and accepted to keep Phase 4 moving, not chosen from experience.

Paul skipped past the pack and shop detail during the build and is picking it up
in a dedicated session.

---

## The numbers as they stand

Measured against the shipped `openPack` on 2026-08-22, not estimated.

**The pool:** 210 cards — 170 Neutral, 40 class (10 each). Collecting everything
at two copies is 420 cards.

**Prices and income** (`DECISIONS.md` §3–§4):

| | |
|---|---|
| Pack | 100 gold, 5 cards |
| Card back | 300 gold |
| Daily login | 50 |
| Win vs AI / online | 25 / 40 |
| Quests (3 active/day) | 75, 50, 50, 40, 40 |
| **Realistic daily income** | **~265 gold — about 2.6 packs** |

**Time to collect, measured by simulation:**

Class belongs to a **deck**, not a player, and players are expected to keep
several decks across several classes. So the figures that matter are how quickly
cards spread across **all four**, not how quickly any one class completes.

Re-measured after the §1.3 class-slot change, and again with the new-player
package of §5. "Days" is at ~265 gold a day.

| Milestone | Packs | Days, no package | Days, with package |
|---|---|---|---|
| One card of every class | ≤4 | ~2 | **1** |
| Five of every class | ~16 | ~6 | **5** |
| All 40 class cards, 1 copy | ~48 | ~18 | ~15 |
| Everything, 2 copies | 78 | ~30 | ~27 |

---

## 1. The curve looks healthy — check that, then leave it alone

Every class is meaningfully playable within about a week, and the whole game is
collected in about a month. For a tool used over a school term that seems right,
but nobody has played it.

> **A correction, recorded because it nearly shipped as advice.** An earlier
> version of this file led with "one class's ten cards take ~22 days, versus ~29
> for the entire collection", and proposed weighting the reserved pack slot
> toward *the opener's class* to fix it.
>
> **That was the wrong model of the player.** There is no "opener's class" —
> class is a per-deck choice and people build across all four. Measured against
> the right question the curve is fine, and the proposed fix would have optimised
> something nobody does while making packs depend on which deck happened to be
> loaded. Withdrawn.

- [ ] **1.1 — still open, and the only item here that needs a human at a
      keyboard.** Play enough to confirm the spread *feels* right, particularly
      the first fortnight — now 4 packs to touch every class and ~16 to have
      five of each, and the intro package hands over 7 of those on day one.
      → **verify:** judgement, not an assertion. `packs/pack.test.ts` guards the
      shape so a later change cannot break it silently. The spread was
      re-measured and improved rather than left alone: see §1.3.

- [x] **1.2** Completing a **single** class takes 52–57 packs and lands at roughly
      the same time as the whole collection, because packs never deal a card
      already held at two copies. That is a late-game milestone, not a barrier —
      decide whether it needs anything at all. **Decided: nothing.** It is 56
      packs after the §1.3 change and still lands beside the full collection,
      which is the right shape for a late-game milestone.

- [x] **1.3** The reserved class slot now draws from **the class the collection
      holds fewest distinct cards of**. Measured over 300 runs, the old
      any-class rule left 17% of players owning nothing of some class after
      seven packs, with a p90 of 9 packs to touch all four. The new rule makes
      it every class by pack 4 at worst, five of every class at ~16 rather than
      21, and changes nothing later (78 packs for everything, 56 for one class).
      → **verify:** `pack.test.ts` guards both ends; `DECISIONS.md` §3 records it.
      Note this is a property of the **collection**, not of the player — it is
      not the withdrawn "opener's class" proposal in a new coat.

## 2. Prices and income nobody has played

- [x] **2.1** **Confirmed unchanged:** pack **100**, card back **300**, daily **50**,
      AI win **25**, online win **40**, quests **75/50/50/40/40**.
      These are all one-line constants (`packs/pack.ts`, `lib/shop.ts`,
      `server/gold.ts`, `quests/quests.ts`).
      → **verify:** any change is reflected in `DECISIONS.md` §3–§4 in the same
      commit, or the docs start lying.

- [x] **2.2** **Three a day stands.** The new-player package (§5) is where the
      early game needed help, and it helps it without raising the daily ceiling
      for someone grinding.

- [x] **2.3** **Not taken.** The first-win-of-the-day lever exists to fix a slow
      start, and the intro package fixes it more directly and only once. Worth
      revisiting if daily retention turns out to be the problem instead.

## 3. Things deliberately not built

Each was left out on purpose. Revisit only if the session decides to.

- [x] **3.1** **No dust / disenchanting.** Unchanged. Once a card is at two copies it is
      excluded from packs, so duplicates never accumulate and there is nothing to
      convert. Adding dust would mean letting packs deal duplicates first.
- [x] **3.2** **Gold cards cannot be bought.** Unchanged. A 5% per-card roll is the only
      source (`DECISIONS.md` §10). No shop path grants one.
- [x] **3.3** ~~**No pack rewards.**~~ **Reversed, once.** The intro track pays
      packs (§5). Nothing *repeatable* does, so gold is still the only ongoing
      route — a free pack every day would make gold pointless, a free pack on
      your first day makes the first day work.
- [x] **3.4** **The shop is one page for three things** — packs, card backs,
      quests. Fine at three; wants splitting at four. It is now four panels
      (packs, backs, intro quests, daily quests) but still three *things* —
      revisit when a fourth thing is for sale, not a fourth panel.

## 4. The completion edge

- [ ] **4.1** **Still open.** With every card at two copies the shop stops selling packs and says
      so. **78 packs is reachable in about a month**, so this is a state real
      players will hit, not a theoretical one. Decide what the shop offers then —
      today it offers nothing.

---

## 5. The new-player package

Added this session, from Paul's design; the full record is `DECISIONS.md` §13.
Four one-time intro quests paying **7 packs and 200 gold** in total, plus a card
back that cannot be bought. Simulated before it was built rather than after:
"one card of every class" moves to day one for every kind of player, "five of
every class" from day 8 to day 5 for a keen one and from day 27 to day 15 for a
light one, and the month it takes to collect everything barely moves.

- [x] **5.1** Intro quests, pack inventory, `Ascendant` back, migration `0004`.
- [x] **5.2** Simulate the package against the pack curve rather than assuming
      it helps. → **verify:** the figures above and in `DECISIONS.md` §13.
- [ ] **5.3** Play it. The package has the same status the rest of the economy
      had at the top of this file: measured, not played.

---

## Done when

The numbers in `DECISIONS.md` §3–§4 are ones Paul chose rather than inherited,
and `pack.test.ts` asserts whatever acquisition rate was agreed.

## Found along the way

_Real problems noticed but out of scope — record here, do not fix silently._

- **Online wins were not counted towards quests.** The daily quest reads "Win 2
  games — against the AI or online", but only `/play` ever reported progress;
  the online table reported nothing at all, so an online win advanced no quest.
  **Fixed** rather than recorded, because the intro track's "win 1" and "win 3"
  quests would have inherited the same hole — but it predates this session and
  is worth knowing about. `src/routes/online/[gameId]/+page.svelte`.
- **A complete collection with packs in hand has nowhere to go.** See §4.1.
