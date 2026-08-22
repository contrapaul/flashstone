# Phase 8 — Deck slots

**Status: not started.**
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

---

## 1. Storage and API — check, do not rebuild

- [ ] **1.1** `decks` already has `id`, `user_id`, `name`, `card_ids`, `class` and
      `updated_at`, with an index on `(user_id, updated_at DESC)`. `loadDecks`
      returns them all; `POST /api/decks` upserts by id and refuses a deck whose
      id belongs to someone else. **Confirm all of that still holds** rather than
      writing it again.
      → **verify:** a `curl` creating three decks returns three from `GET`.

- [ ] **1.2** Enforce the limit of **10 server-side**, where every other rule
      lives. An 11th save is refused with a message naming the limit.
      → **verify:** a test posting an 11th deck is refused 400; deleting one frees
      a slot.

- [ ] **1.3** `DELETE /api/decks` exists and is owner-scoped. Confirm it, and that
      deleting the deck currently in play is handled rather than crashing.
      → **verify:** delete the active deck, then start a match.

## 2. The builder

- [ ] **2.1** A deck list: up to 10 slots, each showing name, class and card count,
      plus an empty slot to start a new one. Selecting a slot loads it; the class
      picker built in Phase 6 §5.2 then applies to **that deck**.
      → **verify:** build a Designer deck and an Engineer deck, switch between
      them, and confirm each keeps its own cards and class.

- [ ] **2.2** Renaming and deleting a deck, with a confirm on delete.
      → **verify:** both round-trip through the server and survive a reload.

- [ ] **2.3** **Which deck is played** becomes an explicit choice rather than
      "most recently updated", which is a surprising rule once there are ten.
      Mark one active; the play route and the online room both read that one.
      → **verify:** with three decks saved, the marked one is the one dealt in a
      match — including online, where the room loads it from D1.

- [ ] **2.4** `lib/collection/sync.ts` currently takes `decks[0]`. It becomes "the
      active deck", and `savePlayerDeck` stops assuming a single id.
      → **verify:** the signed-out path still works — localStorage keeps one deck,
      which is fine, and the UI says so rather than pretending there are ten.

## 3. The match room

- [ ] **3.1** `MatchRoom.loadDeck` also takes the most recent deck. It must take
      the **active** one, and the class with it — that decides the hero power, so
      it is worth being exact about.
      → **verify:** mark a Manufacturer deck active, play online, and confirm the
      hero power is Robotic Arm for that player and the opponent sees it.

## 4. Signed out

- [ ] **4.1** Signed-out play keeps **one** local deck. Ten slots are an account
      feature; say so plainly on the builder rather than showing nine locked
      slots, which reads as a paywall in a game that has none.
      → **verify:** a signed-out player can still build, save and play one deck.

---

## Done when

- A signed-in player can keep up to 10 decks, each with its own class and name,
  choose which is active, and play it against the AI and online.
- `npm test` green, `npm run check` 0 errors.
- `PHASE-3-ACCOUNTS.md`'s "one deck in the UI" note is struck, and `HANDOVER.md`
  reflects that class is per-deck.

## Found along the way

_Real problems noticed but out of scope — record here, do not fix silently._
