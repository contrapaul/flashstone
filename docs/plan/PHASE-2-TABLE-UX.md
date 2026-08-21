# Phase 2 — Table & card UX

**Covers list items 2, 7, 8, 13.**
**Depends on:** nothing (see the conflict note in Phase 1 §5 if run in parallel).
**Blocks:** Phase 4's review-time quest needs §3's review mode.

Four fixes to how the table reads: hover is too violent, definitions are in the wrong
place, the layout assumes a 1440×900 desktop, and the opponent's hand is a row of stubs.

---

> ## Completed 2026-08-21 — 179 tests, 0 check errors, build green
>
> Verified in the browser at **1024×768**, **768×1024**, **1280×900** and **1920×1080**:
> no page scroll on either axis at any of them, hand and End Turn always on screen.
>
> **Three decisions worth knowing:**
>
> 1. **Drag is the only way to play a card** (Paul's call). A pointer tap on a hand card
>    now opens the inspector, which has no Play button — so a tap can never spend mana by
>    accident. The **keyboard path is unchanged**: Enter still picks a card up and places
>    it, which is what keeps the game playable without a pointer. `onCardPointerDown` no
>    longer checks playability, because a card you cannot afford must still be readable.
> 2. **One inspector, three call sites.** `CardInspector.svelte` is used by the match,
>    the collection and review. The collection's old bespoke definition popover is gone.
>    The card inside it is the ordinary `CardPreview`, scaled as a whole — never re-laid
>    out for a context, per Paul's "the cards should be rock solid".
> 3. **The table scales rather than overflowing.** `--fit` is computed from the viewport
>    against the 824px the layout is designed at and applied with `zoom`, clamped to
>    [0.7, 1]. iPad landscape lands on 0.865. `min-height: 824px` is gone — it was the
>    actual cause of the clipping.

## Preconditions

- `npm test` → green. `npm run check` → 0 errors.
- Read `HANDOVER.md` §4.5 — the Svelte 4 reactivity trap. This phase adds several
  derived values to `play/+page.svelte`; a function call in a prop will silently not
  update.

## Files this phase touches

| File | Change |
|---|---|
| `src/lib/components/CardPreview.svelte` | hover scale, definition removal |
| `src/lib/components/CardInspector.svelte` | NEW — the centred expanded card |
| `src/routes/play/+page.svelte` | inspector wiring, responsive layout, foe hand |
| `src/lib/components/Chronicle.svelte` | → vertical side rail |
| `src/lib/components/SettingsMenu.svelte` | NEW |
| `src/lib/settings.ts` | NEW — persisted settings store |
| `src/routes/review/+page.svelte` | NEW — review mode |
| `src/routes/decks/+page.svelte` | show definitions |

---

## 1. Hover, and click-to-inspect (item 2)

Today `CardPreview.svelte` does `transform: translateY(-18px) scale(1.75)` on hover. The
comment above it explains why it is that big — the description type is unreadable at
native size. **That justification goes away once the definition moves off the card face
(§2), and the inspector replaces it properly.**

- [x] **1.1** Reduce the hover to a lift and a slight grow — around
      `translateY(-10px) scale(1.12)`. Keep `transform-origin: bottom center` and the
      z-index bump; keep unplayable cards lifting too.
      → **verify:** at 10 cards in hand, hovering the middle card no longer covers its
      neighbours' cost crystals or stat gems.

- [x] **1.2** New `CardInspector.svelte`: a card rendered **centred on the screen at ~2.5×**,
      over a dimming backdrop, dismissed by clicking the backdrop, pressing Escape, or
      clicking the card again. It is a **read-only overlay** — it must not swallow the
      play gesture.
      → **verify:** open it, press Escape, play the same card; the card plays normally.

- [x] **1.3** Wire it to a **click that is not a drag**. `play/+page.svelte` already
      distinguishes the two for dragging cards to the board (`onCardPointerDown`, `drag`,
      `pointer`) — reuse that: a pointerdown/up pair under the existing drag threshold
      opens the inspector; anything past it is a drag as it is today.
      → **verify:** dragging a card to the board still plays it and does **not** open the
      inspector; a clean click opens the inspector and does not play the card.

- [x] **1.4** Same gesture on board minions and on cards in `/decks`, so "click to read"
      is one habit everywhere. `play/+page.svelte` already has a hover `inspect` overlay
      for minions (`inspectCard`, `inspectPos`) — that is now redundant with the
      inspector; remove it rather than having two ways to enlarge a card.
      → **verify:** hovering a board minion no longer raises a floating card; clicking one
      opens the inspector.

## 2. Definitions off the play card (item 7)

- [x] **2.1** `CardPreview.svelte`'s `.rules` panel shows **only text relevant to the
      game** (`DECISIONS.md` §8): the ability text from Phase 1 §2.4 and the keyword line.
      **Never the definition.** A card whose whole text is a keyword reads `Charge`; a
      card with nothing but stats shows an **empty panel**, which is correct — do not fill
      it with flavour, the term, or a truncated definition.
      → **verify:** no card on the table shows a wall of definition text; the 5-line clamp
      is no longer being hit by ordinary cards; a vanilla card's panel is genuinely blank.

- [x] **2.2** Definitions **always** show in `/decks` (the deck builder) and in review
      mode. That is where studying happens.
      → **verify:** every card in the collection grid shows its term and definition.

- [x] **2.3** New `src/lib/settings.ts` — a `localStorage`-backed settings store, and
      `SettingsMenu.svelte` reachable from the nav. First setting:
      **"Show definitions in game"**, default **on** — see the note below.
      → **verify:** the setting persists across a reload.

      > **Read `OPEN-QUESTIONS.md` #10 before building this.** The original item 7 asked
      > for a setting gating in-game definitions; the later clarification says the
      > definition shows on the side "when inspected", with no condition attached. Those
      > two can both be true only if the setting defaults **on** and exists purely to let
      > a player who has learned the material turn it off. That is the default taken here.
      > If Paul confirms definitions should always show in the inspector, **delete this
      > setting rather than shipping a toggle that does nothing interesting.**

- [x] **2.4** When that setting is **on**, the inspector shows the definition **in a panel
      beside the enlarged card** — Paul's words: *"hover next to the cards when a player
      clicks on one to see an expanded view."* Beside, not on the card face: the card
      keeps its game text either way.
      → **verify:** toggle on → inspector shows the side panel; toggle off → it does not;
      **the card face is identical in both cases** — the definition never migrates onto
      the card itself (`DECISIONS.md` §8).

## 3. Review mode

Item 7 names review mode as a place definitions live, and Phase 4's *"review cards for
5 minutes"* quest needs something to measure. `/learn` is the **rules** page — do not
overload it.

- [x] **3.1** New `/review` route: steps through the player's cards showing term → (reveal)
      → definition, filterable by section, with keyboard control (space to reveal, arrows
      to move).
      → **verify:** works end to end with the keyboard alone.

- [x] **3.2** Track **active** review seconds — a timer that pauses on tab blur and after
      ~30s of no input, so the quest cannot be farmed by leaving the tab open. Expose it
      through a small module the quest system reads in Phase 4.
      → **verify:** a unit test on the timer module: blur pauses, idle pauses, input resumes.

- [x] **3.3** Add `/review` to the nav (it replaces the slot `/import` vacated in Phase 1).
      → **verify:** reachable from every page.

## 4. Sizing for iPad, and the desktop action log (item 8)

`play/+page.svelte`'s `.table` is `height: calc(100vh - 55px)` with **`min-height: 824px`**
and fixed-pixel rows summing to 824px. iPad landscape is 1024×768 → 713px of usable
height → **the board is clipped or the page scrolls.** This is the real bug behind item 8.

- [x] **4.1** Replace the fixed row heights with a proportional layout that fits the
      viewport, or scale the whole table by a computed factor the way the hand already
      does (`handScale` in `play/+page.svelte` is the pattern to copy). Drop
      `min-height: 824px`.
      → **verify:** at **1024×768** (iPad landscape) and **768×1024** (iPad portrait) the
      whole board — both hero rows, both board rows, the hand and End Turn — is on screen
      with **no page scroll**. Use `resize_window` to check both.

- [x] **4.2** Make the table touch-usable: tap-to-select then tap-to-target must work for
      attacking, and card play must work by tap as well as drag. `pointerdown`/`pointerup`
      is already the event basis, so this is mostly making hit targets big enough and
      making sure nothing depends on `:hover`.
      → **verify:** drive it in the browser at mobile/tablet viewport with touch emulation;
      play a card, attack a minion, attack the hero, end the turn.

- [x] **4.3** On desktop, use the **empty side margin as a vertical action log**. The
      board's content column is ~1260px at most; anything wider is currently wasted.
      Convert `Chronicle.svelte` from a 230px floating box capped at `MAX_LINES = 4` into
      a **full-height side rail that fills downward and scrolls**, showing the whole
      match log. Below a threshold (~1500px) it collapses back to today's overlay so the
      board never loses width to it.
      → **verify:** at 1920×1080 the log occupies the left margin, holds far more than 4
      lines, auto-scrolls to the newest, and the board is not narrowed. At 1280×800 it is
      the compact overlay. At 1024×768 it is out of the way entirely.

## 5. Full-size opponent hand (item 13)

- [x] **5.1** Replace the `.foe-card` stubs (32×46px `<span>`s) in `play/+page.svelte`
      with **full-size card backs at the same scale as the player's hand**, using
      `CardBack.svelte` (which already takes a `scale` and is used at 0.34 for the deck
      pile — pass 1). Keep the fan rotation and the negative margin overlap.
      → **verify:** the opponent's hand cards are the same size as yours.

- [x] **5.2** The foe hand is positioned `absolute; top: 2px` inside `.hero-row.foe`.
      Full-size cards are ~168px tall and **will collide with the opponent's board row**.
      Re-budget that row's height, and let the hand **sit mostly off the top edge** the
      way a real card game does — showing the bottom third of each back.
      → **verify:** with 10 cards in the opponent's hand and 7 minions on their board,
      nothing overlaps, at 1440×900 **and** at 1024×768.

- [x] **5.3** Card backs respect the player's chosen back (Phase 4 §5) for their own deck
      pile, and a **default** back for the opponent until multiplayer supplies theirs.
      → **verify:** stub it now; the real selection lands in Phase 4.

## 6. Art hooks

- [x] **6.1** Phase 1 §5.4 specs the drawn UI elements (Deathrattle, Windfury, the health
      and attack gems, the mana crystal, and the rest) and ships the fallback machinery.
      As this phase rebuilds the card face and the table layout, **keep every one of those
      elements behind that lookup** rather than hard-coding a new CSS shape that Paul then
      cannot replace.
      → **verify:** dropping a file into `static/art/ui/` changes the corresponding element
      on the table with no code edit.

---

## Done when

- `npm test` green, `npm run check` 0 errors.
- The board fits with no page scroll at 1024×768, 768×1024, 1280×800 and 1920×1080.
- Hovering a card lifts it slightly; clicking one opens a large centred inspector.
- No definition text appears on the table unless the setting is on, and then only in the
  inspector's side panel.
- `/review` works and reports active seconds.
- The opponent's hand is full size and collides with nothing.
- `HANDOVER.md` §7 updated.

## Found along the way

Real problems noticed but out of scope. **Not fixed.**

- **`zoom` does the table scaling.** It is well supported in current browsers and, unlike
  `transform: scale`, it reflows so the fixed-position drag and inspector layers keep
  their coordinates. If a target browser ever drops it, the fallback is a `transform`
  plus correcting every `getBoundingClientRect` in the drag maths — a much larger change.
- **Long card names still truncate on the nameplate** (carried over from Phase 1). The
  inspector makes them fully readable now, which takes the urgency out of it, but the
  plate itself is unchanged: one line, 8px, ellipsised.
- **Phone-sized viewports are untested.** Paul asked for iPad; 375px-wide layouts were
  not part of the brief and the hand row will be very tight there.
- **`MinionView` now uses drawn card art**, which Phase 1 had missed — a card with art
  would have looked like itself in hand and generic on the board. The board's *keyword*
  elements (Taunt crest, Divine Shield halo, the chips) are still CSS-only and remain
  specced-but-unwired in `static/art/README.md`.
- The **seven missing font files** still 404 on every page. Pre-existing.
