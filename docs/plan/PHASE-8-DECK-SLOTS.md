# Phase 8 — Deck slots

**Status: complete 2026-08-22 — 385 tests, 0 check errors, both projects build.**
Everything below is done except playing it: no signed-in browser has clicked
through ten slots yet.
**Depends on:** Phase 6 (classes). **Blocks:** nothing, but classes are half-served
without it.

Players keep **up to 10 decks**, each with its own class, and switch between them.
This is how classes are meant to be experienced: not "pick a class", but "build a
Designer deck, then an Engineer one, and see which you prefer".

---

## Why this is a real gap, not a nicety

Class is a property of a **deck** (`DECISIONS.md` §11). With one deck slot, a
player has exactly one class at a time and changing it means destroying the deck
they had — so three of the four classes are effectively invisible, and the pack
economy (which spreads cards across all four within a week) is feeding decks that
cannot exist.

The **schema and API already support this**; only the UI does not. From
`PHASE-3-ACCOUNTS.md`'s "Found along the way":

> **One account, one deck in the UI.** The schema and `/api/decks` support many
> decks per user; the builder only ever reads and writes the most recent.

So this is mostly interface work over machinery that is already there and tested.
That held, with two exceptions worth naming: the limit of ten had never been
enforced anywhere, and "your deck" meant "the most recently updated" in four
separate places — the builder, `sync.ts`, the online ticket gate and the match
room. Each had to learn the same new answer.

---

## 1. Storage and API — check, do not rebuild

- [x] **1.1** `decks` already has `id`, `user_id`, `name`, `card_ids`, `class` and
      `updated_at`, with an index on `(user_id, updated_at DESC)`. `loadDecks`
      returns them all; `POST /api/decks` upserts by id and refuses a deck whose
      id belongs to someone else. **Confirm all of that still holds** rather than
      writing it again.
      → **verified:** all of it held. `GET` now also returns `activeId` and the
      limit, so the builder does not have to know them independently.

- [x] **1.2** Enforce the limit of **10 server-side**, where every other rule
      lives. An 11th save is refused with a message naming the limit.
      → **verified:** `src/routes/api/decks/decks.test.ts` drives the route
      handlers themselves — ten saves accepted, the eleventh refused 400,
      deleting one frees a slot, and a re-save of an existing deck does not
      count against the limit.

- [x] **1.3** `DELETE /api/decks` exists and is owner-scoped. Confirm it, and that
      deleting the deck currently in play is handled rather than crashing.
      → **verified in test:** deleting the active deck clears
      `profiles.active_deck`, and the fallback hands back the most recent
      survivor rather than leaving the player with no deck.

## 2. The builder

- [x] **2.1** A deck list: up to 10 slots, each showing name, class and card count,
      plus an empty slot to start a new one. Selecting a slot loads it; the class
      picker built in Phase 6 §5.2 then applies to **that deck**.
      → **built:** a slot strip above the class picker — name, class and count
      per slot, the one being edited outlined, the one being played marked. A
      switch with unsaved changes asks first. **Not yet played through in a
      signed-in browser** (see §5).

- [x] **2.2** Renaming and deleting a deck, with a confirm on delete.
      → **built:** the deck name is an editable field in the deck panel rather
      than a separate rename dialog — it is the same POST either way. Rename
      round-trips signed out and updates the slot label; delete confirms first.

- [x] **2.3** **Which deck is played** becomes an explicit choice rather than
      "most recently updated", which is a surprising rule once there are ten.
      Mark one active; the play route and the online room both read that one.
      → **done:** `profiles.active_deck` (migration `0005`), set through
      `POST /api/decks/active`. A player's **first** deck becomes active on its
      own; later ones do not, so saving an experiment cannot change what you
      take into a match. Every reader falls back to most-recently-updated, so
      accounts that predate the column keep the deck they had.

- [x] **2.4** `lib/collection/sync.ts` currently takes `decks[0]`. It becomes "the
      active deck", and `savePlayerDeck` stops assuming a single id.
      → **done:** `loadPlayer` returns every deck plus the active one.
      One wrinkle worth knowing: the localStorage copy now mirrors the
      **active** deck rather than the last one edited — it is what the nav bar
      reads and what offline play falls back to, and saving one of the other
      nine must not overwrite it.

## 3. The match room

- [x] **3.1** `MatchRoom.loadDeck` also takes the most recent deck. It must take
      the **active** one, and the class with it — that decides the hero power, so
      it is worth being exact about.
      → **done:** `MatchRoom.loadDeck` joins through `profiles.active_deck` and
      falls back to the most recent. `/api/online/ticket` had the same
      assumption and was checking `decks[0]` for legality — it now checks the
      active deck, or an illegal active deck would pass the gate and fail
      inside the match. **Not yet played online** (see §5).

## 4. Signed out

- [x] **4.1** Signed-out play keeps **one** local deck. Ten slots are an account
      feature; say so plainly on the builder rather than showing nine locked
      slots, which reads as a paywall in a game that has none.
      → **verified in a browser:** the builder shows one slot labelled "saved on
      this device", a line explaining that signed-in players keep ten, and a
      link to sign in. No locked slots are drawn. Renaming and saving worked.

---

## 5. What has not been played

- [ ] **5.1** Nothing has driven ten slots in a **signed-in** browser. The route
      handlers are covered by tests and the signed-out path was checked by hand,
      but "build a Designer deck and an Engineer deck and switch between them"
      is still an unrun sentence. `0005` is applied remotely, so nothing blocks
      it.
- [ ] **5.2** Online play with a chosen deck (§3.1) is likewise untested against
      a real match room.

**Migration `0005_active_deck.sql` is applied, locally and remotely** (verified
2026-08-22 — `profiles.active_deck` is live). The realtime Worker has **not**
been redeployed since `MatchRoom` learned to read it, so §5.2 is blocked on
`npm run deploy:realtime` rather than on the schema.

---

## Done when

- A signed-in player can keep up to 10 decks, each with its own class and name,
  choose which is active, and play it against the AI and online.
- `npm test` green, `npm run check` 0 errors.
- `PHASE-3-ACCOUNTS.md`'s "one deck in the UI" note is struck, and `HANDOVER.md`
  reflects that class is per-deck.

## Found along the way

_Real problems noticed but out of scope — record here, do not fix silently._

- **The nav bar's deck label is stale until a reload.** It reads localStorage
  once on mount, so renaming or switching the active deck does not update it
  until the next page load. It now at least names the *right* deck (the local
  copy mirrors the active one). Pre-existing; a store would fix it.
