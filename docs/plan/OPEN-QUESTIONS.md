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
| 9 | "Ability cards" — does that mean spells and weapons only, or also **hero powers**? Hero powers are a once-per-turn button, not a card, and the engine has no UI for them. | 1B §4 | Spells and weapons only. Hero powers out of scope. |
| ~~10~~ | ~~Does the in-game definitions setting survive follow-up 1?~~ **Built as: setting survives, defaults on, affects matches only.** The collection and review always show definitions regardless. Verified both ways. Say the word if you would rather it always showed and the toggle went. | — | Resolved |
| 11 | Gold variants: should a duplicate gold roll on a card already owned as 2 gold be re-rolled to a different card, or simply not roll gold? | 4 §4.1b | Excluded from the pool like any other fully-owned card; no gold roll happens. |
| 12 | Is 5% per card the rate **per card in a pack** (≈23% of packs contain one) or per pack? Follow-up 5 says "per card". | 4 §4.1b | Per card, as stated. |
| ~~14~~ | ~~Allocate rarities exactly instead of rolling them, to fix the thin 2-Epic / 4-Legendary top end?~~ **Answered 2026-08-21: no.** Paul will author additional Legendary and Rare cards by hand after this pass. Leave the weights alone. | — | Resolved |
| 13 | Weapons need `HeroPortrait`'s currently-dead `armor` slot decided one way or the other. Weapon durability beside armor, or drop armor? | 1B §3.5 | Show the weapon; leave armor hidden until something grants it. |
