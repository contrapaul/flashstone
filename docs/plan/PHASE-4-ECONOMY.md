# Phase 4 — Gold, packs, quests, card backs

**Covers list items 3, 4, 6, 12, 14.**
**Depends on:** Phase 1 (cards), Phase 2 (review timer for the review quest), Phase 3
(accounts, gold endpoints, `owned_cards`). **Blocks:** nothing.

All economy numbers are settled in `DECISIONS.md` §3–§5. This phase implements them; it
does not choose them.

---

> ## Completed 2026-08-22 — 222 tests, 0 check errors, build green
>
> `0002_quests.sql` applied locally and remotely (9 tables).
>
> **One deviation:** DECISIONS.md §5 says ship 4 card backs from Paul's art. The art does
> not exist yet, so the four backs are **generated** — the hue-and-sigil design
> `CardBack.svelte` has always drawn, now given a catalogue in `lib/shop.ts`
> (Grimoire, Astral, Verdant, Ember). Dropping `static/art/backs/<id>.webp` in replaces
> one with drawn art and changes nothing else. Same fallback discipline as card art: the
> shop is never empty waiting on illustration.
>
> **Verified against D1** (a throwaway account, since deleted): buying with 0 gold and
> with 50 refused with the shortfall named; at 100 it dealt 5 cards, debited to 0, and
> the collection went 15 → 20. Every pack's last card was Rare or better. Reporting
> `wins: 99` advanced the quest by **1**; an unknown metric 400'd; claiming an unfinished
> quest was refused, claiming a finished one paid 75, and claiming it again paid 0.
> Buying a back debited 300 (325 → 25), a second purchase and wearing an unowned back
> were both refused. **Two simultaneous pack purchases against exactly 100 gold produced
> one 200 and one 400, with the balance ending at 0 and never negative.**
>
> **Verified in the browser:** five backs face down in the player's own chosen back,
> flipping on click, tagged New / Second copy; a forced gold card renders with the frame
> and foil layer; saving a new deck advanced the "build" quest to 1/1 while re-saving did
> not; claiming it moved gold 350 → 390 in both the nav and the header with no reload.

## 1. Gold

- [x] **1.1** Show the balance in the nav, next to the account. Read-only, from
      `/api/profile`.
      → **verify:** it updates after a reward without a page reload.

- [x] **1.2** **Daily login bonus, 50 gold**, on the first login of a UTC calendar day.
      Server-side using `profiles.last_login`; compare **UTC day numbers**, not elapsed
      hours, or a player drifts an hour later each day and eventually loses one.
      → **verify:** a unit test crossing a UTC midnight awards twice; two logins the same
      day award once.

- [x] **1.3** **Win rewards: 25 vs AI, 40 online.** The AI award is the awkward one — the
      match runs entirely on the client, so the client is the only witness. Accept that
      for AI matches (it is single-player; there is nothing to cheat *from*), but make it
      idempotent per match id and **rate-limit it** so it cannot be looped. Online wins
      are awarded by the match DO in Phase 5, which is authoritative.
      → **verify:** replaying the same match-id award twice awards once; 30 awards in a
      minute 429s.

## 2. Daily quests (item 6)

The five quests, with rewards, are in `DECISIONS.md` §4. **3 active per day**, refreshing
at UTC midnight.

- [x] **2.1** `db/migrations/0002_quests.sql` — append-only, do not edit `0001`:
      ```sql
      CREATE TABLE quests (
        user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        day      INTEGER NOT NULL,   -- UTC day number
        quest_id TEXT NOT NULL,      -- 'win2' | 'play30' | 'cast10' | 'build' | 'review5'
        progress INTEGER NOT NULL DEFAULT 0,
        claimed  INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (user_id, day, quest_id)
      );
      ```
      → **verify:** migration runs local and remote.

- [x] **2.2** Quest definitions in `src/lib/quests/quests.ts` — id, label, target, reward,
      and which **event** advances it. Pure data + pure functions, unit-testable.
      → **verify:** tests for progress accumulation and completion at exactly the target.

- [x] **2.3** Progress is reported by the client to `POST /api/quests/progress` as
      **increments of counted events** (cards played, spells cast, matches won, decks
      built, review seconds), and the **server clamps** each to a sane per-request
      maximum. A client that claims 10,000 cards played in one request gets clamped, not
      believed.
      → **verify:** a test posting an absurd increment lands at the clamp.

- [x] **2.4** Hook the five counters up:
      - *win 2 games* — match end, either mode.
      - *play 30 cards* — `playCard` succeeding in `play/+page.svelte`.
      - *cast 10 spells* — same, filtered to `type === 'Spell'`. **Needs Phase 1 §2.3**,
        or there are no spells to cast.
      - *build a new deck* — a **new** deck saved, not a re-save. Key on deck id.
      - *review cards for 5 minutes* — the active-seconds timer from Phase 2 §3.2.
      → **verify:** play a real match and watch each counter move exactly once per event.

- [x] **2.5** Quest panel UI: 3 cards with progress bars, a claim button on completion,
      and a countdown to refresh.
      → **verify:** complete one end to end and see the gold land.

## 3. The shop

- [x] **3.1** `/shop` route: packs (100 gold) and card backs (300 gold). Balance shown,
      unaffordable items disabled with the shortfall stated.
      → **verify:** buying with insufficient gold is refused **by the server**, not just
      greyed out in the UI.

- [x] **3.2** `POST /api/shop/buy-pack`: debit and deal **in a single D1 transaction/batch**,
      returning the 5 cards. A crash between debit and grant must not eat the gold.
      → **verify:** a test asserts gold and `owned_cards` move together; concurrent double
      purchase with 100 gold succeeds once and 400s once.

## 4. Pack generation and opening (item 12)

- [x] **4.1** `src/lib/packs/pack.ts` — pure, seeded, unit-testable. Rules from
      `DECISIONS.md` §3: 5 cards; 4 slots rarity-weighted, 5th guaranteed Rare+; **no two
      of the same card in one pack**; **never deal a card the player already owns 2 of**,
      until the collection is complete, when that constraint lifts.
      → **verify:** tests for — no intra-pack duplicates; a player owning 2 of everything
      but one card always gets that card; a complete collection still yields 5 cards; the
      guaranteed slot is always Rare+; rarity distribution over 10,000 packs is within
      tolerance of the weights.

- [x] **4.1b** **Gold variants** (`DECISIONS.md` §10). After a pack's 5 cards are chosen,
      roll **5% per card** for gold. Gold cannot be bought or crafted — this roll is the
      only source. A gold roll on a card the player already owns 2 standard copies of
      **upgrades one copy to gold** rather than being discarded, and is therefore exempt
      from the "already owns 2" exclusion in 4.1: apply that exclusion to the *standard*
      pool only, then let the gold roll upgrade.
      → **verify:** tests — the gold rate over 100,000 rolls is 5% ± tolerance; a player
      owning 2 standard copies who rolls gold ends at `copies: 2, gold: 1`; a player
      owning 2 gold copies of a card is never dealt it again before completion;
      `gold <= copies` holds after every possible pack outcome.

- [x] **4.2** Pack generation runs **on the server**, using the seeded RNG in
      `src/lib/engine/rng.ts` (pure TS, runs anywhere). The client is told what it got.
      → **verify:** the response is the only source of the 5 cards; devtools cannot influence it.

- [x] **4.3** Opening UI: **5 card backs facing the player; each flips on click or tap.**
      A gold card gets a distinct reveal — the shimmer from Phase 1 §4.1b, and it should
      be obvious across the room that one turned up.
      A 3D flip (`transform: rotateY`, `backface-visibility: hidden`) over `CardBack.svelte`
      and `CardPreview.svelte`. New and second copies are marked distinctly; the sixth-plus
      copy case cannot occur before completion.
      → **verify:** on desktop and at a tablet viewport — all five flip, on click and on
      tap, and the collection reflects them afterwards.

- [x] **4.4** Handle the **completion edge**: when every card is owned at 2 copies, say so
      in the shop rather than selling packs of pure duplicates. (Dust/refund is **not** in
      scope — do not invent it.)
      → **verify:** with a complete collection the shop states it plainly.

## 5. Card backs (item 14)

- [x] **5.1** Card backs are art files under `static/art/backs/` per the Phase 1 §5 spec,
      registered the same way — dropping a file in adds a back.
      → **verify:** add a placeholder file; it appears in the shop.

- [x] **5.1b** The shop sells **card backs only** — gold cards are not purchasable
      (`DECISIONS.md` §10). If a "card designs" item is ever added beyond backs, it must
      not be a route to buying foils.
      → **verify:** no code path grants gold except the pack roll in 4.1b.

- [x] **5.2** Ship **4**: 1 default (owned by everyone) and 3 at 300 gold. Selection is
      stored in `profiles.card_back` and applied to the player's deck pile and hand backs.
      → **verify:** buy one, select it, reload; it persists and shows in a match.

- [x] **5.3** `CardBack.svelte` takes a back id and renders its art, falling back to
      today's generated `hue`/`mark` version when there is no file — **the same fallback
      discipline as card art**, so nothing is ever blank.
      → **verify:** both branches render.

---

## Done when

- `npm test` green (expect substantial new pure-logic coverage in `packs/` and `quests/`),
  `npm run check` 0 errors.
- A new account: gets 15×2, gets 50 gold on first login, completes a quest for more,
  buys a pack, flips 5 cards, and owns them afterwards — verified against remote D1.
- Every gold mutation is server-side and idempotent.
- `HANDOVER.md` §3 and §7 updated.

## Found along the way

Real problems noticed but out of scope. **Not fixed.**

- **Card back art does not exist**, so all four backs are the generated design. See the
  deviation above. `static/art/README.md` already specifies the size and filenames.
- **The AI-win reward still trusts the client**, unchanged from Phase 3 and unchangeable
  while that match runs in the browser. Idempotent per match id, rate-limited to 20/hour.
- **Quest progress is client-reported.** The server clamps every increment
  (`MAX_INCREMENT` in `lib/quests/quests.ts`) and rate-limits the endpoint, so the
  exposure is a crafted client reporting at the cap rather than inventing a number. The
  only complete fix is a server-authoritative match, which is Phase 5 and only covers
  online play.
- **`cardsPlayed` and `spellsCast` were exercised through the play route but not
  end-to-end against a live quest**, because the quests active on the test day were
  review5 / win2 / build. The wiring is shared with `decksBuilt`, which *was* verified
  end to end, and reporting an inactive metric is a deliberate no-op. Worth re-checking
  on a day when `play30` or `cast10` comes round.
- **Nothing spends a duplicate.** Once a card is at two copies it is excluded from packs,
  and after the collection is complete the shop stops selling. There is no dust or
  disenchant system — deliberately out of scope, do not invent one.
- **The shop is one page for three things** (packs, backs, quests). If a fourth arrives
  it wants splitting; three fits.
