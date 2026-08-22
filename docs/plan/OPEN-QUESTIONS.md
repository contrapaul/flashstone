# Open questions

Genuinely undecided. Each names the phase it blocks and the default that will be taken
if no answer arrives — so **no phase stalls waiting on this file.**

| # | Question | Blocks | Default if unanswered |
|---|---|---|---|
| 1 | Should the starter 15 be hand-picked by Paul, or curated by curve from the A-sections? | 1 §4.2 | Curated by curve, listed in `starter.ts` for Paul to reorder later. |
| 2 | Ability variety: is a deterministic first pass from a rarity-weighted pool acceptable, with hand-tuning after? Item 10 says "we'll add more variety after the initial pass", which reads as yes. | 1 §2.2 | Yes — generate, then hand-edit `slCards.ts`. |
| 3 | Card art window: is 2.36:1 the right crop, or should the frame change to suit the art? | 1 §5.1 | Keep the existing frame; spec the art to it. Changing the frame is a Phase 2-sized job. |
| 4 | Does "review cards for 5 minutes" mean 5 minutes total across the day, or one 5-minute sitting? | 4 §2.4 | Cumulative across the UTC day. |
| 5 | Should losses count toward "win 2 games"? | 4 §2.4 / 5 §4.5 | No — wins only. |
| 6 | Pages + separate realtime Worker, or migrate to Workers static assets? | 5 §1 | Option A (Pages + separate Worker), unless the §1.1 spike shows the adapter bump is clean. |
| 7 | Is there a spectate or rematch flow? Neither is in the list. | 5 | Out of scope. Do not build it. |
| 8 | Should packs ever be earned rather than bought (e.g. a first-win-of-the-day pack)? | 4 | No. Gold is the only path, per item 4. |
| ~~9~~ | ~~"Ability cards" — spells and weapons only, or also hero powers?~~ **Answered 2026-08-22: "we'll get to hero powers later."** Spells and weapons shipped; hero powers deferred. | — | Resolved |
| ~~10~~ | ~~Does the in-game definitions setting survive follow-up 1?~~ **Built as: setting survives, defaults on, affects matches only.** The collection and review always show definitions regardless. Verified both ways. Say the word if you would rather it always showed and the toggle went. | — | Resolved |
| 11 | Gold variants: should a duplicate gold roll on a card already owned as 2 gold be re-rolled to a different card, or simply not roll gold? | 4 §4.1b | Excluded from the pool like any other fully-owned card; no gold roll happens. |
| 12 | Is 5% per card the rate **per card in a pack** (≈23% of packs contain one) or per pack? Follow-up 5 says "per card". | 4 §4.1b | Per card, as stated. |
| ~~14~~ | ~~Allocate rarities exactly instead of rolling them, to fix the thin 2-Epic / 4-Legendary top end?~~ **Answered 2026-08-21: no.** Paul will author additional Legendary and Rare cards by hand after this pass. Leave the weights alone. | — | Resolved |
| 13 | Weapons need `HeroPortrait`'s currently-dead `armor` slot decided one way or the other. Weapon durability beside armor, or drop armor? | 1B §3.5 | Show the weapon; leave armor hidden until something grants it. |
| ~~15~~ | ~~With classes, what does a new account start with?~~ **Answered 2026-08-22: all four classes unlocked from the start; class cards are *not* granted and are unlocked organically through packs.** Recorded in `DECISIONS.md` §11. | — | Resolved |
| **16** | **At what rate do class cards arrive?** Decided: organic, via packs. Undecided: whether packs are fully random or reserve a slot. **The arithmetic is worth reading before choosing** — see the note below this table. | 6 §4.3 | **Reserve one of a pack's five slots for a class card of any class.** Still purely organic — you buy packs, you unlock cards — but it brings a full 2-of set of your own class from ~32 days of daily play to ~7. If Paul prefers fully random, say so and the default flips. |
| 17 | Does `Spell Damage +1` apply to hero powers? In Hearthstone it does. | 6 §3.5 | Yes — it applies to spells **and** hero powers, and to nothing else. Battlecries and weapons are explicitly unaffected. |
| 18 | Are the four classes drafted as hero portraits, or does the existing Ψ/Ω glyph stay with a class colour? | 6 §5.4 | Paul draws four portraits; the current glyph is the fallback until they exist, like all other art. |

---

### Note on #16 — how long a class set actually takes

> **Updated 2026-08-22 with a measured figure, replacing the estimate below.**
> With one reserved class slot per pack, completing one class's ten cards at two
> copies takes **57 packs — 5,700 gold, roughly three weeks of daily play**.
> Asserted in `pack.test.ts` as a regression guard.
>
> My earlier estimate of "about a week" was wrong: it ignored that the reserved
> slot deals a class card of **any** class, so only about a quarter of them are
> the player's own. The remaining lever, if three weeks is still too slow, is to
> weight the reserved slot toward the player's own class — `openPack` would need
> to be told which class that is. **Not done, because it is a design decision
> about whether packs should know who is opening them.**

### Original estimate (superseded)

Computed 2026-08-22 against the real numbers, not estimated:

- Pool after Phase 6: **210 cards** (155 SL + 15 Phase 1B + 40 class).
- Your own class is **10 of them — 4.8%**.
- A 5-card pack therefore yields about **0.24** of your class's cards.
- A full 2-of set of your class is 20 cards → **~84 packs → 8,400 gold**.
- At a rough 265 gold/day for a player doing the daily bonus, three quests and a
  couple of wins, that is **~32 days of committed daily play**.

That is a long time for a tool used over a school term — a student could
reasonably never see their class's cards before the topic moves on. Reserving one
slot per pack for a class card divides it by roughly five (~7 days), without
changing the principle that cards are earned rather than given.

The counter-argument is real too: a slower drip makes the collection last longer,
and the Neutral starter deck is fully playable in every class from day one, so
nobody is blocked — only their class deck is thinner for a while.

**This is a tuning knob, not a design change.** It lives in `openPack` and can be
adjusted after watching one class actually play.

