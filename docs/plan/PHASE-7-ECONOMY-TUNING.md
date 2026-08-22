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

| Goal | Packs | Gold | Days at ~265/day |
|---|---|---|---|
| One class's 10 cards, 2 copies | 52–57 | ~5,500 | **~22** |
| **The entire 210-card collection** | **78** | **7,800** | **~29** |

---

## 1. The curve is the problem, not the prices

Read those last two rows together. **Getting your own class's ten cards takes 22
days; getting all 210 cards takes 29.** Three quarters of the entire collection
grind buys you one class.

That is not a tuning wobble, it is the shape being wrong. The no-duplicate rule
makes packs efficient at filling gaps, so the 170 Neutral cards arrive quickly
while your ten class cards stay a needle in a haystack — the reserved class slot
deals a card of **any** class, so only a quarter of it is yours.

The player's most-wanted cards are the slowest thing in the game to get.

- [ ] **1.1** Decide whether the reserved slot should favour **the opener's own
      class**. Simulated on 2026-08-22, changing only that:

      | | Own class set | Full collection |
      |---|---|---|
      | Today (slot = any class) | 52–57 packs | 78 packs |
      | **Slot favours your class** | **17–19 packs (~7 days)** | **78 packs (unchanged)** |

      It roughly triples the rate on the cards a player actually wants and leaves
      total collection time untouched. The cost is conceptual: **packs would know
      who is opening them**, which some people dislike on principle.
      → **implementation:** `openPack` takes the opener's class; the reserved slot
      prefers it and falls back to any class, then to the whole pool. The
      no-duplicate, never-a-third-copy and guaranteed-Rare rules are unchanged.
      → **verify:** the measured figure in `pack.test.ts` moves from <70 to <25.

- [ ] **1.2** If 1.1 is rejected, decide instead whether **~22 days for one class**
      is acceptable for a tool used over a school term, or whether pack price,
      gold income or pack size should move. Changing prices affects everything;
      changing the slot affects only the thing that is wrong.

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
