# Phase 7 — Economy and shop review

**Status: not started. This is a *decision* phase, not a build phase.**

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

| Milestone | Packs | Gold | Days at ~265/day |
|---|---|---|---|
| One card of every class | 6 | 600 | **~2** |
| Five of every class | 21 | 2,100 | **~8** |
| All 40 class cards, 1 copy | 56 | 5,600 | ~21 |
| Everything, 2 copies | 78 | 7,800 | ~29 |

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

- [ ] **1.1** Play enough to confirm the spread *feels* right, particularly the
      first fortnight — 6 packs to touch every class and 21 to have five of each.
      → **verify:** judgement, not an assertion. `packs/pack.test.ts` guards the
      shape (five of every class inside 30 packs) so a later change cannot break
      it silently.

- [ ] **1.2** Completing a **single** class takes 52–57 packs and lands at roughly
      the same time as the whole collection, because packs never deal a card
      already held at two copies. That is a late-game milestone, not a barrier —
      decide whether it needs anything at all.

## 2. Prices and income nobody has played

- [ ] **2.1** Confirm or change: pack **100**, card back **300**, daily **50**,
      AI win **25**, online win **40**, quests **75/50/50/40/40**.
      These are all one-line constants (`packs/pack.ts`, `lib/shop.ts`,
      `server/gold.ts`, `quests/quests.ts`).
      → **verify:** any change is reflected in `DECISIONS.md` §3–§4 in the same
      commit, or the docs start lying.

- [ ] **2.2** Decide whether **three quests a day** is right. Five exist; three are
      active. All three completed plus a login plus two wins is ~265 gold.

- [ ] **2.3** Decide whether the **first win of the day** should pay more, which is
      the usual lever for "play a bit every day" without raising the ceiling for
      someone grinding.

## 3. Things deliberately not built

Each was left out on purpose. Revisit only if the session decides to.

- [ ] **3.1** **No dust / disenchanting.** Once a card is at two copies it is
      excluded from packs, so duplicates never accumulate and there is nothing to
      convert. Adding dust would mean letting packs deal duplicates first.
- [ ] **3.2** **Gold cards cannot be bought.** A 5% per-card roll is the only
      source (`DECISIONS.md` §10). No shop path grants one.
- [ ] **3.3** **No pack rewards.** Gold is the only route; quests and wins pay gold,
      never packs. A first-win-of-the-day pack is the obvious alternative.
- [ ] **3.4** **The shop is one page for three things** — packs, card backs,
      quests. Fine at three; wants splitting at four.

## 4. The completion edge

- [ ] **4.1** With every card at two copies the shop stops selling packs and says
      so. **78 packs is reachable in about a month**, so this is a state real
      players will hit, not a theoretical one. Decide what the shop offers then —
      today it offers nothing.

---

## Done when

The numbers in `DECISIONS.md` §3–§4 are ones Paul chose rather than inherited,
and `pack.test.ts` asserts whatever acquisition rate was agreed.

## Found along the way

_Real problems noticed but out of scope — record here, do not fix silently._
