# Revisions — polish, presentation and play

Written 2026-10-07, after the first classroom playtests. **This is the active plan.**
Phases 1–8 built a complete game. This one makes it *feel* like one. The bar is
Hearthstone's polish and, closer to home, `tome.contrapaul.com`, several of whose
modules port across almost whole (§3).

Read `HANDOVER.md` and `DECISIONS.md` first, as for any phase. Where this plan would
change a settled decision it says so in place **and** lists it in §16 as a question —
nothing here reopens a decision silently.

Conventions are the same as every other phase: Svelte 4 only, the engine stays pure
TypeScript, `types/cards.ts` and `card.validator.ts` change in the same commit, one
table for both modes, server-authoritative online play. Each step has a box and a
**verify** line; tick the box in this file when it passes.

| § | Section | Size |
|---|---|---|
| 0 | The short version | — |
| 1 | What the review found | — |
| 2 | Principles | — |
| 3 | Architecture | — |
| 4 | **Demo cut** — before the multiplayer test on 2026-10-08 | M |
| 5 | R1 — The presentation spine | L |
| 6 | R2 — The opponent's turn | M |
| 7 | R3 — Combat and keywords you can see | L |
| 8 | R4 — Table and HUD | L |
| 9 | R5 — Chronicle → play history | M |
| 10 | R6 — Brand: logo, title, menus | M |
| 11 | R7 — Sound and music | M + assets |
| 12 | R8 — Rarity and card variety | L + content |
| 13 | R9 — Gameplay staples | M–L |
| 14 | R10 — Packs, collection and the meta loop | M |
| 15 | R11 — Carried forward from Phases 7 and 8 | S |
| 16 | Open questions | — |
| 17 | Order, dependencies, and the feel checks | — |

Sizes: **S** under half a session, **M** about a session, **L** two or more.

---

## 0. The short version

1. **The board is ahead of its own animations.** That one fact is behind most of
   "things just appear". The table draws the *final* state the moment it arrives and
   then replays cues over it, so a minion that dies is already gone before its death
   cue plays. Fixing this (R1) comes first, because every animation after it
   depends on it.
2. **The opponent's turn has no story.** There is no "card played" event, so a spell
   is seen only through its side-effects and a minion just pops in. R2 gives every
   play a reveal, every aimed effect a line to its target, and the opponent a pace
   you can follow.
3. **Show, don't tell.** Taunt, Divine Shield, Stealth and Frozen become shapes and
   materials, not 7px labels. The Chronicle becomes a column of hoverable card tiles.
   Mana becomes big glass crystals beside End Turn. The phase label goes.
4. **Vibrancy is half palette, half ground.** Saturated light needs dark ground. The
   warm centre stays, but it gets a dark rim and dark hand trays for the glows to
   burn against.
5. **Rarity is spectacle.** Legendaries get unique, rule-bending effects, a crest,
   an entrance and a sound, and a pack shows its rarity light *before* you flip the
   card. Hoping for that glow is what packs are for.

---

## 1. What the review found

Read from the code and checked in a live match at 1440×900 on 2026-10-07.

| # | Finding | Where | What a player sees |
|---|---|---|---|
| 1 | **The board renders the final state before the cues play.** The table draws `view.me.board` / `view.foe.board` directly; cues replay over a board that has already changed. Checked live: two minions died in one trade, and `.dying` was applied **0** times. | `MatchTable.svelte` markup, `drain()` | Deaths never shatter, they vanish. Health drops before the hit lands. A summon can sit on the board before its arrival animation. |
| 2 | **No cue for playing a card.** `playCard` logs and mutates but emits nothing for the card leaving the hand. | `engine.ts` `playCard` | The opponent's minion "just appears". Their spell is invisible except for its results. Frostbolt killed my minion with no visible cast. |
| 3 | **The attack lunge is gone.** The `attack` cue only shakes the attacker (`struckIds`). `flashstone.css:119` still points to a `lunge()` that no longer exists, and `HANDOVER.md` §5 still describes it. | `MatchTable.svelte:213` | Minions don't attack; they flinch, and their targets take damage. |
| 4 | **Five cues are timed but invisible.** `equip`, `heroAttack`, `weaponBreak`, `armor` and `heroPower` each hold 460–680 ms with nothing on screen. `Heal`, `GainKeyword`, `Destroy`, `GainMana`, a hand-full burn and fatigue emit no cue of their own. | `events.ts` `EVENT_BEAT`, `MatchTable.svelte` `play()` | Pauses where nothing happens; changes that nothing explains. |
| 5 | **Draws.** The opponent's draws have no visual. Yours slide in from a fixed offset (`fs-draw`), not from your deck, and the hand snaps to fit. | `MatchTable.svelte`, `flashstone.css` | "Cards appear in my hand." |
| 6 | **The Chronicle is a string log of seat ids** — "ai plays Frostbolt.", "Tensile Strength hits player for 4.", "— player turn 3 (3 mana) —". Spell targets are never named. **Online, one human *is* seat `ai`** and reads their own plays as "ai plays…". The full rail only appears at ≥1500px. | `engine.ts` `state.log`, `Chronicle.svelte` | Hard to read, and wrong-sounding online. |
| 7 | **The fonts never shipped.** All seven `.woff2` files 404, so every page renders in Georgia. | `static/fonts/` | The whole game looks generic. This is the cheapest fix in this plan. |
| 8 | **The board never scales up.** `fit` is clamped to ≤1 against an 824px design height. Minions are 116×134 and heroes 90×96 whatever the screen. | `MatchTable.svelte:112` | At 1440×900 and above, the board is a small island in a big brown field. |
| 9 | **Mana** is ten 9.6×13.6px pips at bottom-left, about 1000px from End Turn. The opponent's mana is plain text. | `ManaTray.svelte` | You can't read it at the moment you need it. |
| 10 | **Vibrancy.** The temporary light-brown field (`ea5e9ae`) is mid-tone, so the green and blue blooms (≤0.85 alpha) have no dark ground to glow against. Unplayable cards drop to 0.62 opacity, which reads as broken. | `MatchTable.svelte` `.table`, `CardPreview.svelte` | "Diffuse but too muted. Nothing is vibrant." |
| 11 | The **phase label** ("your move" / "opponent" / "…") repeats what the button, the glows and the banner already say. | `MatchTable.svelte` `.phase` | Clutter. |
| 12 | **Minions are text-heavy boxes**: a hexagon portrait, an 8.5px name, 7px keyword chips. Taunt is a 34×20 crest, Divine Shield a 2px border, Stealth just lower opacity. | `MinionView.svelte` | Keywords have to be read, not seen. |
| 13 | **The hand is a flat row**, with no fan and no arc. Hover lifts it 1.12×. | `MatchTable.svelte` `.hand` | It doesn't look like a hand of cards. |
| 14 | **Card variety.** 66 of 158 minions (42%) have no text. There are 8 Epics and 9 Legendaries among 210 cards. Rarity is hash-rolled, so one Legendary is a 1-mana 2/3 that restores 2 (Functional Obsolescence) and another is a weapon with no text (The Jig). `OVERRIDES` in `slCards.ts` is still empty: no card has been hand-tuned. | `slCards.ts`, `templates.ts` | Nothing to hope for in a pack. |
| 15 | The **AI plays an all-Neutral deck** whatever class it rolls. | `aiDeck.ts` | Class cards are never seen in practice. |
| 16 | **Missing Hearthstone staples**: mulligan, emotes, turn rope, sound, music, class hero portraits, keyword tooltips. | — | — |

---

## 2. Principles

These are the tests every step in this plan is held to.

1. **Show, don't tell.** Every rule that changes the board has a visual. Text is the
   fallback, in the inspector and the history, never the first channel.
2. **Everything is seen happening, in order.** Nothing on screen is ahead of its cue
   or behind it. The opponent's turn runs a little slower than yours (Tome's
   *enemy pace*), so you can see what hit you.
3. **Anticipation, travel, impact, settle.** Cards have weight. A summon lands with a
   slam and a dust ring, an attack winds up before it dashes, and an impact freezes
   for a beat (hit-stop) before the recoil.
4. **One impact, one intensity.** A single 0–1 number per hit drives knockback,
   shake, sparks, splat size and sound variant, so they always agree (Tome's
   `hitIntensity`).
5. **Saturated light on dark ground.** Glows sit on dark rims and trays, never on
   mid-tone.
6. **The rarer, the louder** — in the pack, in the hand, on entry, in sound.
7. **Art and sound are drop-ins.** Every new visual keeps a CSS or SVG fallback, and
   every sound is optional. Nothing waits on an asset. This is the existing art
   convention, extended to audio.
8. **Reduced motion is a real mode.** It skips lunges and shakes and keeps fades.
   Nothing ever depends on seeing a movement.

---

## 3. Architecture

### Keep
Svelte 4 and a DOM board; one `MatchTable` for both modes; the engine as pure
TypeScript emitting cues; the server as the authority; `CardPreview` as the one card
component, scaled rather than re-laid out.

### Add

| Piece | What | Why | Port from Tome? |
|---|---|---|---|
| **Presented view** | The table renders `shown`, a copy of the view that playback advances one cue at a time. `view` becomes the *target*, and they sync at the end of the drain. | Fixes finding 1. Every later animation depends on it. | The idea is Tome's `Playback`: "views update from the events and never read state mid-playback". |
| **Cues carry results** | Each cue states what it produced: health after, the summoned minion, mana after. A pure `applyCue(view, cue)` reducer moves `shown` forward. | The client can show the board exactly as it was between two cues, without guessing. | Same: "every event carries the totals it produced". |
| **Director** | `src/lib/presentation/director.ts` maps each cue type to an `async` choreography that awaits its own animation. It replaces the `switch` plus fixed `EVENT_BEAT` sleeps. | Each beat lasts as long as its animation, and the code is testable in one place. | — |
| **Motion** | `d(seconds)` scales every duration by the setting (Full / Fast / Reduced) and by opponent pace. | One place to slow things down or calm them for a class. | `ui/kit/motion.ts`, nearly verbatim |
| **GSAP** (+ Flip) | Timelines for flights, lunges and reveals. Flip handles a card moving between containers, hand → showcase → board. | It's the tool Tome uses, and GSAP is free including Flip since 3.13. CSS keyframes stay for idle loops. | dependency |
| **`animate:flip`** | Svelte's built-in, on the board's `#each`. | Minions slide to close a gap after a death and part to make room for a summon. Today they snap. | — |
| **FX canvas** | One fixed `<canvas>` above the board for particles: sparks, shards, motes, projectiles and trails. Hand-rolled, about 200 lines, and idle when empty. | Particles are what make impacts feel physical. A DOM particle per spark would be too heavy. | `ui/fx/impact.ts` patterns |
| **History** | `state.history`: structured entries (actor, card, targets, results) kept alongside `log`. | Hoverable cards in the Chronicle, with targets and outcomes. Fixes finding 6 properly. | — |
| **Audio** | An `AudioService` with a build-time manifest from `static/audio/`. Unlocks on first input; separate master, music and sfx gains. | Sound is half of "polish". | `app/audio.ts` + `docs/CONTRIBUTING-AUDIO.md`, nearly verbatim |

### Not
**A Pixi rewrite.** Tome is Pixi, but its lessons are in its *playback discipline,
timings and audio*, not its renderer. A canvas board would throw away `CardPreview`'s
one-component rule, keyboard play, the inspector and accessibility, and would cost
weeks. The DOM board plus one FX canvas gets there.

---

## 4. Demo cut — before the multiplayer test (2026-10-08)

> ## Built 2026-10-07 — 401 tests, 0 check errors, both projects build
>
> Verified in a practice match at 1440×900, 1920×1080 and 1024×768: the
> opponent's cards are revealed before they act, deaths shatter (the `.dying`
> class is now applied, where before the fix it never was), attacks lunge and
> hold at contact (measured from the transforms: 8px lift, ~267px dash, ~65ms
> hold), the Chronicle uncovers each line as its cue plays, and hovering a card
> name shows the card.
>
> **What D6 became:** `src/lib/presentation/apply.ts`, a pure `applyCue`
> reducer, with a 40-match replay test (`apply.test.ts`) asserting the boards on
> screen never drift from the engine's. Breaking its `death` case on purpose
> fails the test and names the seed and turn.
>
> **Two bugs found along the way, both fixed:**
> 1. **Practice matches crashed in dev, and mis-rendered the hand in
>    production, whenever both copies of a two-of were in hand.** `resolveDeck`
>    returns the registry's *same object* for both copies, and the hand is keyed
>    by object. `createMatch` now gives each copy its own object (tested).
>    Online play never hit it, because cards arrive as fresh JSON.
> 2. **Online, your own hero was labelled with the opponent's username**: the
>    route passed it as `deckName`. It now passes `opponentName` (D10).
>
> **Not verified in a browser:** an online match (needs two signed-in
> accounts), Reduced motion, and a hero swinging a weapon (no weapon came up).
> The online path shares every line of the table with practice.

The highest-impact, lowest-risk slice of R1–R4, ordered so you can stop after any
step and still have a better game. Most of it is **client-only**: it needs no
realtime redeploy and cannot break the online protocol. Steps marked **both deploys**
change the engine, so the realtime Worker and the Pages app must ship together:

```bash
npm test && npm run check && npm run deploy:realtime && npm run deploy
```

After deploying: two browser windows (one private), two accounts, and one online
match played to turn 4 **before** class.

- [x] **D1 — Fonts.** *Client-only. Needs Paul's OK to download seven OFL files.*
      Put the Cinzel and EB Garamond `.woff2` files listed in `static/fonts/README.md`
      in place.
      → **verify:** no font 404s in the network panel, and the computed `font-family`
      of the brand mark is Cinzel.

- [x] **D2 — Remove the phase label.** *Client-only.* Delete `.phase` and its
      `phase` reactive. While waiting, End Turn reads **Enemy Turn** (greyed).
      The turn banner stays.
      → **verify:** nothing on the centre line says "your move" in either turn.

- [x] **D3 — Mana where your eyes are.** *Client-only.* Your tray moves to the
      bottom right, sitting just above the top edge of the hand and beside End Turn:
      ten crystal slots about 30px tall, with the count (`5/7`) at about 22px. The
      opponent's tray mirrors it at top right at about 70% size. Crystals refill one
      by one at the start of your turn (a CSS stagger is enough for now).
      → **verify:** at 1024×768 and 1920×1080, with 10 cards in hand, the tray
      collides with nothing and reads at a glance.

- [x] **D4 — Vibrancy pass.** *Client-only.*
      (a) Playable glow: a crisp 2px saturated edge (`#47ff7a`) with a tight 10–12px
      bloom, replacing the soft orbiting `fs-spell` haze.
      (b) Unplayable cards stay at **full opacity** with no glow and a desaturated
      cost gem, rather than fading to 0.62.
      (c) A dark **hand tray** gradient behind your hand and a mirrored one behind
      the opponent's, plus a dark rim vignette on the outer ~10% of the field. The
      warm centre stays as it is.
      (d) Mana crystals in saturated blue, with a white-hot core and an outer bloom.
      → **verify:** a screenshot from across the room (or on the projector) shows,
      instantly, which cards can be played.

- [x] **D5 — Chronicle, quick fix.** *Client-only. R5 replaces this properly.*
      In `Chronicle.svelte`:
      - pass `you`, and turn the seat ids into **You** / **Opponent** (or the
        opponent's username online);
      - drop the `— … turn N (M mana) —` lines and replace them with a thin divider
        in the side's colour (blue for you, red for them);
      - wrap card names found in the registry (and in `tokens.ts`) in rarity-coloured
        chips, with a `CardPreview` popover on hover, matching longest names first;
      - show damage numbers in red and deaths struck through.
      → **verify:** online, the player seated as `ai` reads "You play …" for their
      own plays; hovering a name shows the card.

- [x] **D6 — The presented view, client-only form.** *This is R1.3–R1.4 built on
      today's cues.* The reducer's shape survives into R1; only its data source
      changes later. Keep `shown` (a copy of the last committed view) and advance it
      as each cue plays:
      - `summon`: insert the minion from the incoming view at its index;
      - `damage`: subtract the amount (armor first, for heroes);
      - `shield`: clear Divine Shield;
      - `death`: add `.dying`, await the shatter, then remove the minion;
      - `buff`, `freeze`, `silence`: copy that minion's fields from the incoming view;
      - `equip`, `weaponBreak`, `armor`, `heroPower`, `turn`: copy that side's fields;
      - `draw`: reveal the next hand card, as `pendingDraws` does today.
      When the drain ends, set `shown = view`. Online, a view that arrives
      mid-drain only replaces the target.
      → **verify:** trade two minions and both shatter. When the AI kills your
      minion with a spell, the minion stays on the board until the hit lands.
      Health gems tick down on impact, not before.

- [x] **D7 — The lunge returns.** *Client-only.* On `attack` (and `heroAttack`),
      the attacker lifts (scale 1.12, larger shadow), dashes ~75% of the way to its
      target (ease-in, ~180ms), freezes for ~60ms at contact, and springs back
      (~260ms, overshoot). The `damage` cues that follow land at the moment of
      contact. Use WAAPI or GSAP, measured from the elements.
      → **verify:** attacks read as attacks, from both sides, at Full motion. Under
      Reduced motion there's no lunge, only the hit.

- [x] **D8 — `play` cue and the opponent's card reveal.** *Both deploys.* The engine
      emits `{ type: 'play', owner, card, target? }` at the top of `playCard`, after
      mana is spent and before any summon or effect. The table:
      - **opponent's play**: their card back lifts out of their fan, flips to its
        face, and flies to a **showcase** spot left of centre at about 1.6×. It holds
        for about 1s, then a minion shrinks into its slot (a slam and dust ring,
        stronger for higher cost), a spell fades out into its effects, or a weapon
        flies to the hero;
      - **your play**: no showcase, just a short flight to its slot.
      → **verify:** on the AI's turn you can say what it played before anything
      happens to your board. `room.test.ts` and `MatchRoom.test.ts` still pass.

- [x] **D9 — Scale up on big screens.** *Client-only.*
      `fit = clamp(0.7, min(h / 824, w / 1300), 1.35)`.
      → **verify:** at 1920×1080 the board fills the screen; 1024×768 is unchanged;
      the drag and aim maths still land (both already use `zoom`, which reflows).

- [x] **D10 — Names, not seats.** *Client-only.* `MatchTable` takes an
      `opponentName` (the username online, the AI's class name in practice) and shows
      it on the opponent's hero nameplate.
      → **verify:** online, each player sees the other's username.

- [x] **D11 — `Zzz`.** *Client-only, stretch.* Minions that can't attack yet
      (summoned this turn, no Charge) show a small drifting "z z z", as in
      Hearthstone, in place of today's absence of the ready glow.
      → **verify:** play a minion; it sleeps until your next turn. A Charge minion
      never sleeps.

- [x] **D12 — Taunt and Divine Shield shapes.** *Client-only, stretch. Pulled forward
      from R3.4.*
      → **verify:** as R3.4.

**Not in the demo cut**, deliberately: mulligan and emotes (both change the
protocol on the day of a test), and anything that needs new art.

---

## 5. R1 — The presentation spine

**Goal:** what's on screen is always one frame of the match as it unfolds. Nothing
runs ahead of its cue and no cue goes unseen.
**Depends on:** nothing. D6 is its first half.
**Blocks:** R2, R3, R5, the engine work in R8, and mulligan in R9.

- [ ] **R1.1 — Cues carry results.** Extend `GameEvent` (`events.ts`):

      | Cue | New or changed | Carries |
      |---|---|---|
      | `play` | new (D8) | owner, card, `handIndex`, aimed target |
      | `summon` | changed | the `SerialisedMinion` and its slot |
      | `damage` | changed | `after` (health), and `armorAfter` for heroes |
      | `heal` | new | target, amount, `after` |
      | `buff` | changed | attack, health and maxHealth after |
      | `keyword` | new | instanceId, keywords after (gain *and* loss) |
      | `effect` | new | source (minion, hero or card), action, `targets[]`, emitted **before** the effect resolves, to drive projectiles and target lines |
      | `trigger` | new | instanceId and which trigger (Deathrattle, StartOfTurn, EndOfTurn, OnAttack), to light its badge before its effects |
      | `mana` | new | owner, mana, maxMana (turn start, the Coin, spending) |
      | `burn` | new | owner, card (a card drawn into a full hand — public in Hearthstone) |
      | `fatigue` | new | owner, amount |
      | `equip` / `armor` / `heroPower` | changed | weapon snapshot / armor after / class |
      | `draw` | unchanged | still **no card**. Your own drawn card is read from your view; the opponent's must never be. |

      → **verify:** an `events.test.ts` that drives every action in the `Action`
      union and asserts each emits. All 385 existing tests pass.

- [ ] **R1.2 — The replay invariant.** This is the keystone test, and the
      project's usual habit: *simulate, don't derive*. For 200 seeded AI-vs-AI
      matches, take the view before each intent, fold its cues through
      `applyCue`, and assert the result deep-equals `viewFor(state)` after the intent
      on boards (ids, order, attack, health, keywords, flags), hero health, armor,
      weapon, mana and hand counts. A mutation that forgets to emit fails this test
      and the failure names it.
      → **verify:** green over 200 matches. Then delete one `emit` on purpose,
      confirm the test fails and names the site, and put it back.

- [ ] **R1.3 — `applyCue` reducer** in `src/lib/presentation/apply.ts`: pure, no DOM,
      used by the table and by R1.2.
      → **verify:** unit tests per cue.

- [ ] **R1.4 — The table renders `shown`.** D6 switches from guessing to
      `applyCue`. At the end of the drain, if `shown` and `view` differ, log a dev
      warning naming the field: that is a missed cue in the wild.
      → **verify:** a full AI match with zero warnings.

- [ ] **R1.5 — Director.** `play()` becomes `director[cue.type](cue, stage)`. `stage`
      exposes element lookup (minion by instanceId, hero, hand slot, deck pile, the
      showcase spot), the FX layer, shake, banner and sound. Each choreography awaits
      its own animation. `EVENT_BEAT` remains only as a minimum hold.
      → **verify:** no `setTimeout` left in `MatchTable.svelte`'s playback path.

- [ ] **R1.6 — Motion settings.** Port `motion.ts`. Settings gain **Animation speed**
      (Full / Fast / Reduced) and **Opponent pace** (default 1.3× slower).
      `prefers-reduced-motion` selects Reduced on first run.
      → **verify:** Reduced has no lunges, shakes or flights; fades only; and a
      match is still fully readable.

- [ ] **R1.7 — GSAP and `animate:flip`.** Add `gsap` (^3.13). Put `animate:flip` on
      both board `#each` blocks and on the hand.
      → **verify:** a death in the middle of a board slides the neighbours together.

- [ ] **R1.8 — FX canvas.** `FxLayer.svelte` with `burst`, `shards`, `trail`, `ring`
      and `motes`. DPR-aware. The rAF loop stops when no particles are alive.
      → **verify:** CPU is idle on an idle board (Performance panel); 300 sparks
      hold 60fps on the iPad.

**Done when:** deaths shatter; the replay test is green; no cue holds without a
visual; `HANDOVER.md` §5 (the event queue and the lunge) is rewritten to match.

---

## 6. R2 — The opponent's turn

**Goal:** a student watching the opponent's turn can say what was played, at what,
and why their minion died, without reading anything.
**Depends on:** R1.

- [ ] **R2.1 — The AI acts one intent at a time.** Split `playAiTurn` into
      `nextAiAction(state): Intent | null`, with `playAiTurn` becoming a loop over it
      so the tests keep their shape. `LocalSource.runOpponent` steps through it:
      think → apply → publish → await `drained` → next. This is the shape online
      play already has, since a human opponent's intents arrive one at a time.
      → **verify:** `ai.test.ts` is unchanged: the same seed gives the same final
      state as before.

- [ ] **R2.2 — Thinking.** A pause before each AI action, d(0.5–1.0s), longer before
      big plays. Online, if the opponent has been idle for more than 2 seconds, a
      random card back in their fan lifts and settles now and then, the way a
      Hearthstone opponent hovers cards. Before a `play` cue, the back at its
      `handIndex` lifts first.
      → **verify:** the opponent's hand feels inhabited.

- [ ] **R2.3 — The reveal (D8), finished.** Minion landings scale with cost:
      1–3 is a tap, 4–6 a thud with a dust ring, 7+ a slam with a screen shake.
      Legendaries get a unique entrance (R8.6).
      → **verify:** a 7-drop feels heavy, a 1-drop doesn't.

- [ ] **R2.4 — Target lines and projectiles.** For aimed effects (`effect` cues with
      a chosen target), a red arrow draws from the source to the target and holds
      briefly before the projectile flies. For random targets (`RandomEnemy`,
      `EnemyMinion`), a **roulette**: a highlight flickers across the candidates and
      lands on the one chosen. Hearthstone's random-target tension, for nothing
      more than an animation.
      → **verify:** Frostbolt shows what it was aimed at; a random 2-damage effect
      visibly chooses.

- [ ] **R2.5 — The opponent draws.** A back slides from their deck into their fan,
      and the fan re-spaces with Flip.
      → **verify:** their hand count never changes without a visible card.

- [ ] **R2.6 — Handover.** When the opponent ends their turn, their side of the End
      Turn button flips to **Your Turn** with a flash, and the banner plays. Your
      crystals refill one at a time (R4.5).
      → **verify:** the start of your turn is unmistakable without the banner.

---

## 7. R3 — Combat and keywords you can see

**Goal:** every keyword is a shape or a material, and every hit has weight.
**Depends on:** R1. **Art:** every item here has a CSS/SVG fallback and an
`art/ui/` slot (§16 lists them).

### Combat

- [ ] **R3.1 — Lunge and hit-stop** (D7, finished): the attacker rises in z, dashes,
      freezes for ~60ms at contact, recoils with overshoot. Hero attacks lunge the
      portrait and swing the weapon icon.
- [ ] **R3.2 — Impact intensity.** `hitIntensity(damage)` from 0 to 1 drives target
      knockback, screen shake (from 0.5 up), spark count, splat size and
      `hit-light`/`hit-heavy`.
- [ ] **R3.3 — Damage splats.** The floating "-3" becomes a red starburst badge
      pinned to the target. Heals show a green "+2" badge; armor gains a steel plate
      badge. Health gems tick and flash. **Damaged health shows in red**, as in
      Hearthstone, which replaces the "Enraged" chip.
- [ ] **R3.4 — Death.** The minion cracks (a mask overlay), desaturates, and bursts
      into canvas shards with gravity. If it has a Deathrattle, its badge flares and
      a wisp rises before the effect. Then the board closes up (Flip).
- [ ] **R3.5 — Heroes.** Hit flash; crack overlays at ≤10 and ≤5 health; at 0, the
      portrait cracks and explodes (R6.6).

### Persistent keywords — no more chips

| Keyword | Shown as | On change |
|---|---|---|
| **Taunt** | A heavy shield-shaped frame around the portrait, the Hearthstone silhouette. | **Illegal attack**: all Taunt frames pulse red and the target you tried shakes "no", so the Taunt rule is shown without a sentence. |
| **Divine Shield** | A golden translucent bubble with a slow shimmer sweep. | It cracks, bursts into gold shards, and plays a "ting". |
| **Stealth** | Animated smoky noise over a desaturated portrait. | The smoke puffs away when it attacks. |
| **Frozen** | An ice block with crystalline edges. | It cracks and drips on thaw. |
| **Windfury** | Two faint wind swirls orbiting the base. | One fades after the first attack. |
| **Charge** | Speed lines and a spark on arrival; no lasting mark, as in Hearthstone. | — |
| **Deathrattle** | A small badge at the bottom: **recycling arrows**. "End of life cycle" is the D&T reading of a deathrattle. | Flares on death (R3.4). |
| **Start/End of turn triggers** | A **cog** badge. | The cog spins when it fires (`trigger` cue). |
| **Spell Damage** | A violet spark badge with "+1". | Spell numbers in your hand turn green and go up (R8.2). |
| **Silenced** | Desaturated, with a hush line through the badges. | A shockwave ripple pops every badge off. |
| **Buffed** | Stat gems turn green. | Upward chevrons rise and the gem pulses. |
| **Asleep** | `z z z` (D11). | It wakes at the start of your turn. |

- [ ] **R3.6 — The minion becomes a portrait.** An oval portrait with attack and
      health gems; the name and chips go (both live in the inspector and the history).
      Legendary minions get an ornate oval with a crest and drifting motes (R8.1).
      → **verify:** with the text removed, a board of seven can be read entirely by
      shape. Clicking a minion still opens the inspector.
- [ ] **R3.7 — Weapons, armor, hero power.** Equip: the weapon card flies to a slot
      left of the hero and becomes an icon with attack and durability gems (a tool:
      hammer, calipers, soldering iron). Durability ticks per swing; at 0 the icon
      shatters. Armor is a steel plate beside the health gem. Using the hero power
      **flips the button over** (Hearthstone's tell) with a class-coloured burst.
- [ ] **R3.8 — Burn and fatigue.** A card drawn into a full hand appears above your
      hand and burns away (fire-dissolve mask). Fatigue: an empty card slides from
      the deck showing the damage number, then strikes the hero.
- [ ] **R3.9 — Spell visuals by action.** Each `effect` cue gets a choreography:

      | Action | Visual |
      |---|---|
      | DealDamage | A spark bolt from the source (D&T: a laser-cutter line) with a trail, then an impact burst |
      | Heal | Green-gold motes rise; the gem glows |
      | BuffAttack / BuffHealth | Chevrons; the relevant gem swells |
      | Freeze | Ice crystals grow over the target, then the block forms |
      | Silence | A ripple, and the badges pop off |
      | Destroy | A crack splits the portrait, then death |
      | SwapStats | The two gems physically swap places |
      | DrawCard | A card flies from the deck |
      | SummonToken | A puff, then a small landing |
      | GainArmor | Plates clank onto the hero |
      | GainKeyword | That keyword's visual forms (the Taunt frame drops in, and so on) |

**Done when:** every row of both tables is on the board, and every visual has a
fallback.

---

## 8. R4 — Table and HUD

**Goal:** a board that reads like Hearthstone at a glance, on a laptop, an iPad and a
projector.

```
┌───────────────────────────────────────────────────────────────────────┐
│ ▣ history   ╭ opponent's hand tray (fan hangs off the top) ╮   ▤ deck  │
│ ▣ tiles          [weapon] ( OPPONENT ) [power]          ◆◆◆◆◇ 4/5     │
│ ▣                 ── opponent's board ──                               │
│ ════════════════ centre line ══════ fuse ~~~~~~~~~~~~~ [ END TURN ] ═══│
│                   ── your board ──                                     │
│                [weapon] (    YOU    ) [power]                  ▤ deck  │
│        ╭──────────── your hand tray (fanned hand) ───────╮ ◆◆◆◆◆◇◇ 5/7 │
└───────────────────────────────────────────────────────────────────────┘
```

- [ ] **R4.1 — Scale both ways** (D9), and re-budget rows for the larger heroes and
      minions.
- [ ] **R4.2 — The surface.** The play field becomes a framed board: the warm centre
      you chose (a subtle texture and a soft overhead spotlight) inside a dark carved
      rim. Your hand sits on a dark **hand tray** ledge and the opponent's on a
      mirrored one. These are the per-player hand-area elements you described.
      Art slots: `ui/tray-you`, `ui/tray-foe`; `scene/table` paints over the lot,
      as now.
      → **verify:** every glow on the table sits on dark ground.
- [ ] **R4.3 — The fan.** Cards on an arc (about ±3.5° per card, with vertical arc
      offset), overlapping down to −30% as the hand fills. **Hover:** the card rises
      clear of the hand to about 1.5× and its neighbours part sideways (Flip).
      *This changes Phase 2's 1.12 lift (§16 Q3):* that was reduced because 1.75×
      covered neighbours' gems, whereas a fanned card rises **above** the row, so it
      hides nothing.
      → **verify:** at 10 cards, every cost gem is visible when nothing is hovered,
      and the hovered card is fully readable.
- [ ] **R4.4 — Draws from the deck.** The card leaves your deck pile, flips face-up
      in flight, and slots into the fan; the fan re-spaces. The opening hand deals
      one card at a time.
- [ ] **R4.5 — Mana, finished.** Refill crystal by crystal with a rising chime; a
      new maximum crystal *grows in*; spending drains crystals right-to-left as the
      card lands; **hovering a playable card makes the crystals it would cost
      pulse**; dragging a card you can't afford flashes the crystals red and the card
      snaps back. That last one is show-not-tell for "not enough mana".
- [ ] **R4.6 — Glow language.** Green means playable or ready. **Gold** is reserved
      for "special": a condition met (R8.4) or a held-back lethal hint. Red means
      target or danger. Blue means mana. Nothing else glows.
- [ ] **R4.7 — End Turn.** A large button on the right edge of the centre line with
      three states: **End Turn** (gold, you still have plays), **End Turn** (green
      pulse, nothing left to do — replaces today's blue), **Enemy Turn** (grey).
      Pressing it flips the button.
- [ ] **R4.8 — The fuse (online turn timer).** With 20 seconds left, a burning wire
      appears along the centre line, sparks travelling toward End Turn, and reaches
      it at 0. It replaces the `XXs` text, and is Hearthstone's rope, in D&T
      materials. Local matches have none.
- [ ] **R4.9 — Heroes by class.** Class frames and emblems in SVG until art exists:
      Designer (compass and pen nib), Engineer (gear and wrench), Consumer (price
      tag and coin), Manufacturer (robot arm). The health gem grows to Hearthstone
      size. A nameplate shows the player's name (D10).
- [ ] **R4.10 — Hero power** as a round disc with the class icon and a cost gem; it
      glows when usable and flips when used (R3.7).
- [ ] **R4.11 — Decks** for both players on the right edge, their thickness tracking
      the count. When three or fewer cards remain, the pile flickers a warning:
      fatigue is close.
- [ ] **R4.12 — Low health.** At ≤10, a faint red heartbeat vignette on your side.
- [ ] **R4.13 — Board doodads** *(delight; stretch).* One clickable object in each
      corner of the table, as Hearthstone's boards have: a desk lamp that toggles
      warm light, a 3D printer that prints a tiny trinket, a bench vise you can
      crank, a pencil pot that rattles. Each is an SVG with a sound. They do
      nothing for the rules and a great deal for the feel, and students will find
      them in the first minute.

**Done when:** the four Phase 2 viewport checks still pass (1024×768, 768×1024,
1280×800, 1920×1080), plus a projector check at 1280×720.

---

## 9. R5 — Chronicle → play history

**Goal:** the cards that were played, and what they did, with no turn headers.
**Depends on:** R1.1 (results to record). **Both deploys.**

- [ ] **R5.1 — Structured history.** `state.history: HistoryEntry[]` alongside `log`
      (which stays for tests and debugging):
      ```ts
      { actor: PlayerId; kind: 'play' | 'attack' | 'heroPower' | 'trigger' | 'fatigue' | 'burn';
        cardId: string; targets: { ref: Ref; cardId?: string;
          result: 'damage' | 'heal' | 'killed' | 'buff' | 'frozen' | 'silenced' | 'shielded';
          amount?: number }[] }
      ```
      Results are gathered from the cues emitted while an entry is open.
      → **verify:** a `view.test.ts` case shows history never names a card from the
      opponent's hand or deck, only played, revealed or burned ones.
- [ ] **R5.2 — Protocol.** `PlayerView.history`, card ids resolved on the client
      through `cardById` and tokens. MatchRoom gets the same change.
      → **verify:** `room.test.ts` and `MatchRoom.test.ts`.
- [ ] **R5.3 — The tile column.** Down the left edge, a column of tiles (about 56px
      wide, so it fits at every viewport and the 1500px threshold goes): each tile
      shows the card's art in a frame, **blue-edged for you, red for the opponent**,
      with an action icon (sword, burst, cog, recycle). The newest slides in at the
      top. **Hover or tap** opens a panel with the full `CardPreview` and an arrow
      to a mini-portrait of each target, carrying its result splat (−3,
      destroyed, +2, frozen).
- [ ] **R5.4 — Text mode** (the rail at ≥1500px, or a toggle). One line per entry
      with text effects: the actor shown as a coloured pip, not a word; card names
      in Cinzel, rarity-coloured, with a hover popover; numbers styled (red damage,
      green heals); deaths struck through with a recycle mark; keywords bold. Turn
      boundaries are a thin divider in the side's colour, never words.
- [ ] **R5.5 — Names.** "You", the opponent's username, or "Opponent". Never seat
      ids, anywhere.

---

## 10. R6 — Brand: logo, title, menus

**Depends on:** D1 (fonts). Independent of the engine, so it can run alongside
R1–R5.

- [ ] **R6.1 — The logo.** `Logo.svelte`, inline SVG so it's crisp at any size and
      animatable; `art/ui/logo.webp` overrides it when Paul draws one.
      - **Wordmark:** FLASHSTONE in a heavy flared display face on a gentle upward
        arch. The Hearthstone treatment: a 3-stop gold bevel gradient, a thin inner
        highlight, a 3px dark-umber outline, and a deep drop shadow.
      - **Emblem:** a cut gemstone (the flash *stone*) set in a **cog-tooth bezel**
        (D&T's gear in place of Hearthstone's medallion), split by a jagged bolt of
        light. It sits between FLASH and STONE, or as a keystone above.
      - **Motion:** on load the emblem flashes and the letters settle; every ~6
        seconds a light sweep crosses the letters; the gem breathes.
      - **Face:** render three OFL candidates side by side in a scratch page and
        pick one: *Cinzel Decorative* 900 (same family as the UI), *Germania One*,
        *Metamorphous*.
      → **verify:** legible at 32px in the nav and striking at 160px on the title.
- [ ] **R6.2 — Title screen.** A full-bleed backdrop (`scene/menu`; until then a deep
      layered gradient with dust motes drifting on the FX canvas). The logo drops in
      with a bounce and a flash. Menu buttons become carved plates with a hover
      glow and a pressed state; **Play** is the large one. Music starts on the first
      input (R7).
- [ ] **R6.3 — Versus splash.** Entering a match: your hero frame against theirs,
      with names and classes, for about 1.5s; then the board assembles (decks slide
      in, heroes drop onto plinths) and the opening hand deals (R4.4), followed by
      the mulligan (R9.1).
- [ ] **R6.4 — Page transitions.** Menu pages crossfade with a slight zoom; the gold
      counter in the nav counts up with a coin icon.
- [ ] **R6.5 — The nav** as a carved header strip that matches the title.
- [ ] **R6.6 — Victory and defeat.** The loser's portrait cracks and explodes into
      shards. A **VICTORY** or **DEFEAT** plate in the logo treatment. Gold earned
      counts up with coins flying to the counter, and quest bars tick if any moved.

---

## 11. R7 — Sound and music

**Depends on:** nothing. Port it whole.

- [ ] **R7.1 — `AudioService`** from Tome's `app/audio.ts`: Web Audio, unlocked by
      the first input; master, music and sfx gains (sliders in
      `SettingsControls`); silent when the tab is hidden; random pitch spread;
      multiple takes (`hit-light-2.wav`). The manifest is built from
      `static/audio/` with `import.meta.glob`, the same way `utils/art.ts` indexes
      art: no manifest to edit, a missing file is silence.
      → **verify:** with `static/audio/` empty the game runs with no errors.
- [ ] **R7.2 — Sound names** (`static/audio/sfx/`):
      `card-draw`, `card-hover`, `card-pickup`, `card-play`, `minion-land` and
      `minion-land-heavy`, `spell-cast`, `attack-swing`, `hit-light`, `hit-heavy`,
      `hero-hurt`, `death`, `shield-pop`, `taunt-up`, `freeze`, `thaw`, `silence`,
      `buff`, `heal`, `armor`, `weapon-equip`, `weapon-break`, `hero-power`,
      `mana-fill`, `mana-new`, `no-mana`, `burn`, `fatigue`, `turn-start`,
      `turn-end`, `fuse` (loop), `emote`, `victory`, `defeat`, `pack-open`,
      `card-flip`, `reveal-rare`, `reveal-epic`, `reveal-legendary`, `gold`,
      `quest-complete`, `ui-click`, `ui-hover`.
- [ ] **R7.3 — Per-card lines** *(optional)*:
      `static/audio/cards/<card-id>-play|attack|death.wav`. Legendaries first.
      **A classroom idea:** students record these, as a sound-design brief that
      fits D&T well.
- [ ] **R7.4 — Music** (`static/audio/music/`): `title`, `menu`, `match-1…3`
      (rotated), and a `tense` layer that crossfades in when either hero is at ≤10.
      Stings: `victory`, `defeat`. Loop points in a JSON sidecar, as in Tome.
- [ ] **R7.5 — `static/audio/README.md`**, adapted from Tome's
      `CONTRIBUTING-AUDIO.md`.
- [ ] **R7.6 — Placeholder pack** *(needs Paul's OK to download)*: Kenney's CC0
      interface and RPG audio packs cover most of R7.2 until custom sound exists.

---

## 12. R8 — Rarity and card variety

**Goal:** opening a pack is a gamble worth taking, and a Legendary is an event.
**Depends on:** R1 (new mechanics must emit cues) and R3 (their badges).
Respects `DECISIONS.md` §14: **the rarity weights are not touched**. Variety comes
from hand-authoring, as §8 anticipated.

- [ ] **R8.1 — Rarity on the card face.** A faceted rarity gem under the art (where
      Hearthstone puts it), coloured, in addition to the frame tint. **Legendary**
      cards get a crest over the top of the frame in brass gear filigree (the
      Flashstone answer to Hearthstone's dragon) and a faint shimmer in hand; on the
      board they get an ornate oval with a crest and drifting motes. **Epic** cards
      get a soft inner glow. Art slots: `ui/rarity-gem-<rarity>`,
      `ui/legendary-crest`.
- [ ] **R8.2 — Card text with effects.** A small formatter for `description`: bold
      keywords and trigger words (**Battlecry:**, **Taunt**), and damage numbers in
      green and raised when Spell Damage applies, as in Hearthstone. The card face
      still shows game text only (`DECISIONS.md` §8).
- [ ] **R8.3 — What a rarity *means*.** A design rule for every card from now on:

      | Rarity | Identity |
      |---|---|
      | Common | Stats, plus at most one keyword. Vanilla is fine here, and only here. |
      | Uncommon | One simple effect. |
      | Rare | A targeted or two-part effect, or a keyword plus an effect. |
      | Epic | An engine piece: a trigger, a condition, an aura. |
      | Legendary | A **unique, named rule-bend** worth building a deck around, with its own entrance and sound. |

- [ ] **R8.4 — New engine capabilities.** Each is its own step with tests;
      types and validator change in the same commit, and each emits cues.

      | Capability | Example | Size |
      |---|---|---|
      | Triggers: `OnFriendlySpell`, `OnFriendlyPlay`, `OnDamaged` (survives), `OnFriendlyDeath` | "Whenever this takes damage, deal 1 to a random enemy" | M |
      | Auras (gives `Passive` a meaning at last) | "Your other minions have +1 Attack" | L — a derived-stats layer |
      | Conditions, shown with a **gold glow** in hand when met | "If you control a Taunt minion…" | M |
      | **Discover**: choose 1 of 3 | Three cards rise and you pick one. A pending choice in the engine, plus an intent and a protocol message. | M–L |
      | Return, shuffle, transform, copy | "Return this to your hand"; "Transform a minion into a 0/1" | S–M each |
      | Graveyard | "Resummon a friendly minion that died this game" | S |
      | Delayed | "Destroy it at the end of your opponent's next turn", with a ticking badge on the target | S–M |
      | Counters on an instance | Staged Legendaries (below) | S |

- [ ] **R8.5 — The curation pass**, through `OVERRIDES` in `slCards.ts` (the
      intended place for hand-tuning). Every existing Epic and Legendary gets an
      effect that *is* its term; the obvious headline terms are promoted. Proposals,
      each renameable:

      | Card | Rarity | Effect | Why it fits |
      |---|---|---|---|
      | **Circular Economy** | Legendary spell | Resummon your three most recent friendly minions that died this game. | Resources stay in use |
      | **Triple Bottom Line (TBL)** | Legendary minion | Battlecry: deal 3 to the enemy hero, restore 3 to yours, gain 3 Armor. | Profit, people, planet. Uses only existing actions, so it can ship **first**. |
      | **Shape Memory Material** | Legendary minion | Deathrattle: return this to your hand. | It remembers its shape |
      | **Iterative Design** | Legendary minion | At the start of your turn, advance a stage — draw a card → your minions +1/+1 → summon a 3/3 Prototype → restore 4 Health — then repeat. A four-segment ring shows the stage. | Iteration |
      | **Generative Design** | Legendary minion | Battlecry: Discover a minion and summon it. | The computer proposes, you choose |
      | **Design Thinking** | Legendary spell | Discover three times: a minion, a spell, a weapon. | Diverge, then converge |
      | **Planned Obsolescence** | Epic spell | Choose an enemy minion. Destroy it at the end of your opponent's next turn. | Built to fail, on a timer |
      | **Piezoelectricity** | Epic minion | Whenever this takes damage, deal 1 damage to a random enemy. | Pressure becomes current |
      | **Electro-Rheostatic** / **Magneto-Rheostatic** | Epic pair | Taunt. During your opponent's turn, has +3 Health. | The fluid stiffens under a field |
      | **Constructive Discontent** | Rare minion | Whenever this survives damage, gain +2 Attack. | It improves under criticism |
      | **Biodegradable Material** | Rare minion | A 5/5 for 3. At the end of your turn, it loses 1 Health. | It breaks down |
      | **Dematerialization** | Epic spell | Transform a minion into a 0/1 Study Note. | Less material |
      | **Take-Back Legislation** | Epic spell | Return all minions to their owners' hands. | The manufacturer takes it back |
      | **Reverse Engineering** | Epic spell | Discover a copy of a card your opponent has played this game. | Taking apart to learn |
      | **Smart Materials** (already Epic) | Legendary minion | Battlecry: gain Taunt, Divine Shield **or** Stealth (your choice). | Responds to its environment |

      Then lift the vanilla share from 42% toward about 20% by giving Uncommon and
      Rare vanillas one simple effect each, through the same overrides.
      → **verify:** a `slCards.test.ts` case asserts every Epic and Legendary has
      non-empty text, and that vanilla minions are all Common.
      **Caveat:** a card promoted to Legendary is limited to one copy per deck, so
      saved decks holding two become illegal. Default: auto-trim to one with a
      one-time notice; the collection keeps both copies (§16 Q7).
- [ ] **R8.6 — Legendary entrances.** On summon: the screen dims slightly, light
      beams rise, the minion drops with a heavy slam and a gold shockwave, and its
      sound line plays (R7.3).
- [ ] **R8.7 — The AI plays class cards.** `aiDeck.ts` builds per class: class cards
      first, Neutral to fill, curve preserved. All four classes are then seen in
      practice, as Phase 6 intended.
      → **verify:** `aiDeck.test.ts` asserts each class deck is legal for its class
      and contains class cards.

---

## 13. R9 — Gameplay staples

- [ ] **R9.1 — Mulligan.** *Both deploys.* Each player sees their opening hand
      (3, or 4 plus the Coin), taps any card to mark it for replacement, and
      confirms. Replaced cards shuffle back into the deck. Engine: a `mulligan`
      phase and intent. Online, both players choose at once and the room waits for
      both. AI: replace cards costing 4 or more. Visual: the cards line up large in
      the centre, and marked ones show a red cross.
      → **verify:** `engine.test.ts` (the deck is conserved; replaced cards never
      come straight back) and `room.test.ts` (simultaneous choices; a timeout keeps
      the hand).
- [ ] **R9.2 — Emotes.** *Both deploys.* Right-click or long-press your hero to open
      a small wheel of **fixed, friendly phrases**, never free text: *Hello!* ·
      *Nice design!* · *Thanks!* · *Hmm…* · *Back to the drawing board!* ·
      *Prototype incoming!*. They appear as a speech bubble by the hero with a
      sound. Rate-limited to one per 3 seconds on the server. **Mute opponent**
      sits in the game menu, which matters in a classroom. The AI emotes too: a
      greeting at the start and "Nice design!" when it loses.
- [ ] **R9.3 — Keyword tooltips.** The inspector gains a short explanation of each
      keyword on the card, beside it (as the definition panel already is):
      *"Taunt — enemies must attack this first."* Teaching without putting
      text on the board.
- [ ] **R9.4 — First-match coach marks.** In a player's very first match only, three
      wordless-ish pointers: an arrow and *Drag to play*, *Drag to attack*, then
      a pulse on End Turn. Tome's `coach.ts` is the pattern.
- [ ] **R9.5 — AI pacing and personality** (R2.1 plus the emotes) rather than
      difficulty levels. Out of scope still: spectating and rematch
      (`OPEN-QUESTIONS.md` #7).

---

## 14. R10 — Packs, collection and the meta loop

**Depends on:** R1.8 (FX), R7 (sound). Keeps the click-to-flip rule from
`DECISIONS.md` §3.

- [ ] **R10.1 — The pack ceremony.** Drag the pack onto a central socket (or tap it);
      it shakes, glows and bursts. Five face-down cards fan into an arc, and **each
      card's rarity light leaks from beneath it before you flip it**: nothing for a
      Common, green for Uncommon, blue beams for Rare, a purple pulse for Epic, and
      orange god-rays for Legendary. Hovering a hidden card swells its glow and its
      sound. That is the moment of hope this whole section exists for.
- [ ] **R10.2 — Reveals scale with rarity.** Common: a clean flip. Rare: a blue burst.
      Epic: a purple burst and a shake. Legendary: the screen dims, the card zooms
      to centre, its name banner unfurls, a sting plays, and it settles back into
      the fan. Gold adds a foil sweep and coin sparkle. "New" tags glow.
- [ ] **R10.3 — The collection.** Cards you haven't viewed yet carry a glowing NEW
      badge until hovered. Legendaries shimmer in the grid. Per-class completion
      bars use the rarity gems.
- [ ] **R10.4 — Rewards.** Quest completion slides in as a card with a filling bar
      and flying coins; gold counts up everywhere it changes.
- [ ] **R10.5 — Card backs** that move: the three purchasable backs gain a subtle
      animated shimmer. That sells them, and Ascendant should look the most alive.

---

## 15. R11 — Carried forward from Phases 7 and 8

Still valid, unchanged, and best done during play sessions:

- [ ] `PHASE-7` §1.1 / §5.3 — play the economy and the new-player package for real.
- [ ] `PHASE-7` §4.1 — what the shop offers a complete collection.
- [ ] `PHASE-8` §5.1 / §5.2 — ten slots in a signed-in browser, and a chosen deck
      played online.
- [ ] `PHASE-4` "found along the way" — confirm `play30` and `cast10` end to end on
      a day they come round.
- [ ] `OPEN-QUESTIONS.md` #18 — class hero portraits. R4.9 makes SVG frames the
      fallback either way.

---

## 16. Open questions

Each has a default, so nothing stalls.

| # | Question | Default |
|---|---|---|
| Q1 | The table surface: keep the light-brown centre inside a dark rim and dark trays, or go back to a dark field? | Keep the warm centre; add the rim and trays (R4.2). |
| Q2 | Logo direction: the gem-in-a-cog emblem with a gold bevel wordmark? | Yes. The face is chosen from three rendered candidates (R6.1). |
| Q3 | Hand hover: a fan where the card rises to about 1.5× above the row, replacing Phase 2's 1.12 lift? | Yes. In a fan the raised card covers nothing. |
| Q4 | Unplayable cards at full opacity with no glow (Hearthstone), instead of dimmed? | Full opacity (D4). |
| Q5 | Add a mulligan? | Yes, after the demo (R9.1). |
| Q6 | Emotes in online play: a fixed friendly set with a mute toggle? | Yes, after the demo (R9.2). |
| Q7 | Promote and rework existing terms into Legendaries and Epics (R8.5)? Saved decks with two copies of a newly Legendary card get trimmed to one, with a notice. | Yes, with the trim. |
| Q8 | Keep five rarity tiers (Hearthstone has four, with no Uncommon)? | Keep five; weights untouched (§14). |
| Q9 | Real designers (Rams, Eames, Hadid, Dyson…) as hand-authored Legendaries? | No: stay with syllabus terms. Say the word and they become a set of their own. |
| Q10 | CC0 placeholder sounds (Kenney) until custom audio exists? | Yes. Needs your OK to download. |
| Q11 | Add GSAP as a dependency, as in Tome? | Yes (R1.7). |

---

## 17. Order, dependencies, and the feel checks

**Order:** Demo cut → **R1** → **R2** → **R3** → **R4** → **R5** → (**R6** ∥ **R7**,
which can run alongside anything) → **R9** → **R8** → **R10**. R11 happens whenever
people are playing.

R8 comes after R9 on purpose: its new mechanics must emit cues (R1) and have badges
(R3), and Discover shares its pending-choice plumbing with the mulligan.

**The feel checks.** These are the definition of done for this whole plan, checked by
watching someone who has never seen the game:

1. They can narrate the opponent's turn from the screen alone.
2. Every death is seen. Nothing leaves the board without a visible cause.
3. They know which cards they can play from across the room, on the projector.
4. They read their mana without looking for it, at the moment they reach for End Turn.
5. They can name every keyword on a board of seven by shape, with no text shown.
6. They make a noise when a Legendary's light leaks out of a pack.
7. With sound off and Reduced motion on, the game is still entirely playable.

## Found along the way

- `HANDOVER.md` §5 describes an attack lunge and a death shatter that the board no
  longer shows (findings 1 and 3). Rewrite it as part of R1's done-criteria rather
  than now, so it describes what was built.
- `@sveltejs/adapter-auto` is still an unused dependency (pre-existing,
  `HANDOVER.md` §7).
