# Settled decisions

Confirmed by Paul on 2026-08-21 unless noted. **These are inputs, not proposals.**
Do not reopen them without asking. Anything genuinely undecided is in
`OPEN-QUESTIONS.md`.

---

## 1. Card set

- The game is built **entirely from the SL topic set** in `slcards.txt`. The flashcard
  import mechanic is **shelved**.
- `slcards.txt` is tab-separated `Term<TAB>Definition`, grouped under bare section-code
  lines (`A1.1`, `A2.1`, … `C4.1:`). Some header lines carry trailing tabs; some are
  preceded by a blank line; one ends in a colon. A parser must tolerate all three.
- Measured content: **167 rows across 14 sections**, of which **157 terms are unique** —
  10 terms appear in two sections each (Usability, Triple Bottom Line (TBL), Prototype,
  Primary Persona, Rapid Prototyping, User-Centred Research Methods, Task, Circular
  Economy, User Observation, Computer-Aided Design (CAD)). **Deduplicate by term**;
  keep the first definition and record both section codes on the card.
- Section `C4.1` (4 terms) is the HL content. Tag it, so an SL-only filter is possible later.
- **One term+definition = one card, with its own stats and its own ability.**
- Per-section counts, for sanity-checking a parser:
  `A1.1 14 · A2.1 18 · A2.2 28 · A3.1 37 · B1.1 12 · B2.1 22 · B2.2 4 · C1.1 6 ·
   C1.2 3 · C1.3 7 · C2.1 3 · C2.2 6 · C3.1 3 · C4.1 4` = 167.

## 2. Collection and deck rules

- Players start with the **same fixed 15 cards, 2 copies of each** (= exactly one
  30-card deck, playable on first launch with no shop visit).
- A player may own **at most 2 copies of any card**. The two copies are identical.
- Deck legality: **2 copies per card for Common/Uncommon/Rare/Epic, 1 copy for
  Legendary.** Deck size stays 30.
- This **replaces** the current per-*template* copy cap in `src/lib/decks/deck.ts`.
  The template table stays as the statline source; it stops gating deck legality.

## 3. Packs

- A pack is **5 cards**, costs **100 gold**.
- Opened with the **card back facing the player**; each card **flips when clicked or
  tapped**.
- **No duplicates within a pack**, and no card is dealt that the player already owns
  2 copies of — until the collection is complete, after which the constraint lifts.
  A *second* copy of an already-owned card is **not** a duplicate.
- Rarity: 4 slots roll on `RARITY_WEIGHTS` (Common 50 / Uncommon 30 / Rare 15 /
  Epic 4 / Legendary 1); the 5th slot is **guaranteed Rare or better**.
- The **1st slot is a class card**, drawn from whichever class the collection
  currently holds **fewest distinct cards of**. Measured 2026-08-22 over 300
  runs: every class is touched by pack 4 at worst (was a median of 5 and a p90
  of 9), and five of every class arrives at ~16 packs (was 21). The late game is
  untouched — 78 packs for everything, 56 for a single class — because the pool
  of cards is the same either way.
  - Thinnest is a property of the **collection**, not the player. There is no
    "player's class" to weight toward; class is a per-deck choice (§11).

## 4. Gold

Awarded for logins, daily quests and winning games.

| Source | Gold |
|---|---|
| First login of a calendar day (UTC) | 50 |
| Win vs AI | 25 |
| Win online | 40 |
| Daily quest: win 2 games | 75 |
| Daily quest: play 30 cards | 50 |
| Daily quest: cast 10 spells | 50 |
| Daily quest: build a new deck | 40 |
| Daily quest: review cards for 5 minutes | 40 |

- **3 quests active per day**, drawn from the 5 above, refreshing at UTC midnight.
- Gold is spent on **packs (100)** and **card designs / card backs (300)**.
- Gold, collection and quest progress are **server-authoritative** from Phase 3 on.
- Gold is the only *ongoing* route to a pack. The **one-time** intro track (§13)
  awards packs directly; nothing repeatable does.

## 5. Card art

- Art is **drawn by Paul**, not generated.
- Phase 1 delivers the **pipeline and the placeholders**, not the art: a
  `static/art/cards/` convention, a manifest mapping card id → file, an exact spec
  (aspect ratio, format, pixel size) to draw to, and the existing generated CSS art from
  `src/utils/art.ts` kept as the fallback so **every card renders before any art exists**.
- Same shape for card backs, in `static/art/backs/`.
- Ship with **4 card backs**: 1 default, 3 purchasable at 300 gold.
- **UI element art is also Paul's.** Deathrattle, Windfury, Taunt, Divine Shield, Charge,
  Stealth, the health gem, the attack gem, the mana crystal, the rarity gem and the
  spell/weapon type marks all get drawn assets, in `static/art/ui/`. Every one keeps its
  current CSS-drawn version as the fallback, so the game is never blank waiting on art.
  `static/art/README.md` must enumerate each element with its exact pixel size, format
  and transparency requirement — see Phase 1 §5.4.
- **Gold (foil) cards reuse the standard card's art.** The foil is a *treatment* — an
  animated shimmer layer plus a gold frame — not a second illustration. Paul draws one
  gold frame and one shimmer texture, not 157 more images.

## 6. Accounts and backend

- Accounts are built **the same way as `time.contrapaul.com` and
  `make.contrapaul.com/bloodbowl`**: Cloudflare **D1**, email + username + password,
  PBKDF2-SHA256 via WebCrypto, hashed session tokens in an HttpOnly cookie, D1-backed
  fixed-window rate limiting, Resend for verification and reset email.
  The helper modules port over near-verbatim — see Phase 3 §1.
- Multiplayer is **server-authoritative** via **Durable Objects**: one DO per match
  running the existing engine as the source of truth, one DO as the public lobby registry.
- Gold, collection, decks and quests live in D1 against the account.

## 7. Import pipeline

- **Kept on disk, dropped from the nav.** `/import`, `csvParser.ts`, `mdParser.ts`,
  `fieldMapper.ts` and their 33 tests stay and must keep passing. The nav link and the
  homepage menu entry are removed so players cannot reach it. Shelved, not deleted.


---

## 8. What a card shows on the table

Confirmed 2026-08-21, as a refinement of item 7.

- A card in play shows its **name** and **only text relevant to the game**. A card whose
  entire text is a keyword reads exactly `Charge`. A card with nothing but stats has an
  **empty text panel** — not its definition, not filler.
- The **definition** appears only when a card is **inspected**, in a panel **beside** the
  enlarged card — never on the card face, in any mode.
- The deck builder and review mode still always show definitions. That is where studying
  happens.
- **Review mode reuses the same card, unchanged.** It shows the real card component with
  the definition in a panel **beside** it — exactly the gameplay inspect treatment. There
  is no separate "study card" rendering, and the card face is never rebuilt for a
  different context. One card component, several call sites.
- **A card on the board is a different object**, and legitimately looks different: a
  minion is rendered by `MinionView.svelte`, not by dropping a hand card onto the field.
  That distinction stays.
- More **Legendary and Rare cards will be authored by hand after this pass**, which is
  how the thin top-end rarity mix gets fixed. Do not re-weight or re-allocate rarities
  to compensate.

## 9. Injecting new cards later

- The card set must be **extensible without regenerating or editing `slCards.ts`**.
  Hand-authored cards (the basic spells and weapons of Phase 1B, and anything Paul adds
  later) live in a separate file and are merged by a registry module.
- Card ids are **stable slugs**, never indices or hashes of content, so adding a card
  never renumbers an existing one, and a player's collection survives every addition.
- Adding cards changes what "collection complete" means. The completion check must be
  computed from the live registry, never cached in the database.

## 10. Gold (foil) card variants

Confirmed 2026-08-21.

- A gold card is a **variant of an existing card, not a separate card.** It has the same
  id, cost, stats, text and deck-legality footprint.
- **5% chance per card drawn** from a pack. Gold cards **cannot be crafted or bought** —
  the roll is the only source.
- Gold **overrides** the standard copy rather than adding to the collection: owning 2
  copies where 1 is gold is still 2 copies. **2 gold copies override both.**
- Ownership is therefore `copies` (0–2) plus `goldCopies` (0–`copies`).
- A gold roll on a card the player already owns 2 standard copies of **upgrades one copy
  to gold**. It is not wasted, and it is not blocked by the no-duplicates rule — that rule
  exists to stop worthless dupes, and a gold upgrade is not worthless.
- Deck building uses whichever copies you own; if you own a gold copy it is the one shown.
  There is no "gold-only deck" mode and no way to opt out of showing gold.


## 11. Classes

Confirmed 2026-08-22. Built in `docs/plan/PHASE-6-CLASSES.md`.

- Four classes, each loosely modelled on a Hearthstone archetype:
  **Designer** (Shaman), **Engineer** (Warrior), **Consumer** (Warlock),
  **Manufacturer** (Mage).
- Each has **one hero power**, costing **2 mana, once per turn**, and never a card
  in hand:

  | Class | Power | Effect | Hearthstone original |
  |---|---|---|---|
  | Designer | **Summon a Design Idea** | Summons a random one of four 1-mana tokens | Totemic Call |
  | Engineer | **Make it Stronger** | Gain 2 Armor | Armor Up! |
  | Consumer | **Pay on Credit** | Draw a card, take 2 damage | Life Tap |
  | Manufacturer | **Robotic Arm** | Deal 1 damage | Fireblast |

- The four **Design Ideas** are renamed copies of Hearthstone's basic totems:

  | Token | Original | Stats | Text |
  |---|---|---|---|
  | Rechargeable Battery | Healing Totem | 0/2 | At the end of your turn, restore 1 Health to all friendly minions |
  | OLED Screen | Searing Totem | 1/1 | — |
  | Reinforced Frame | Stoneclaw Totem | 0/2 | Taunt |
  | Overclocked CPU | Wrath of Air Totem | 0/2 | Spell Damage +1 |

  As in Hearthstone, the power summons one **not already on the board**, and does
  nothing when all four are out.
- Each class gets **10 class-specific cards**. Names are placeholders for Paul to
  rename to fit the syllabus.
- **All 155 existing SL cards stay Neutral.** They are syllabus terms, not class
  identity, and reclassifying them would invalidate every saved deck.
- A deck has a class and may hold **that class's cards plus Neutral cards**. The
  per-card copy limits (2, or 1 for Legendary) are unchanged.

### How classes are acquired

Confirmed 2026-08-22.

- **Class belongs to a deck, not to a player.** As in Hearthstone, a player has no
  class of their own: each deck picks one, and a player is expected to keep
  several decks across several classes and swap between them. Choosing a class is
  a per-deck decision made every time a deck is built — **not** a one-time choice
  at first run. The first deck is simply the first of many.
- **Players may keep up to 10 decks.** The limit is enforced server-side; an
  eleventh save is refused rather than merely unrendered.
- **Which deck is played is an explicit choice**, held in `profiles.active_deck`
  and read by both the practice route and the online match room. It falls back
  to the most recently updated deck for an account that has never chosen one, or
  whose choice has since been deleted. Editing a deck must not silently change
  what you take into a match, which "most recent" would.
- **Signed out, there is one deck**, in localStorage. Slots are an account
  feature; the builder says so plainly rather than showing nine locked slots,
  which would read as a paywall in a game that has none. The local copy mirrors
  the **active** deck, so offline play falls back to the deck you actually play.
- **All four classes are unlocked from the start.** There is no gate, no purchase
  and no progression to choosing one; a player may build a deck of any class on
  first run and switch freely.
- **Class cards are not granted.** The 40 class cards join the general card pool
  and are unlocked **organically, through packs** — bought with gold or earned.
- The consequence is worth stating, because it is what makes this work: **picking
  a class gives you a hero power, not cards.** A deck of nothing but Neutral cards
  is legal for every class, so a new player can build **four** decks on day one —
  one per class — with nothing but the starter 15, and feel four different games
  through the hero powers alone. Class cards deepen decks they can already field.
- Because players collect toward **all four** classes rather than one, the
  meaningful acquisition figures are the spread, not the completion of any single
  class: **one card of every class within 4 packs, five of every class by ~16**,
  the whole 210-card collection by 78 (~27 days). Measured after the class slot
  began aiming at the thinnest class (§3), and guarded in `packs/pack.test.ts`.
  With the new-player package (§13) the first of those lands on **day one** and
  the second on **day 5**.

## 12. Backdrop and menu art

- Paul is drawing a **play-field backdrop** and a **menus backdrop** as well as
  card art.
- Both are **2560 × 1440 lossy WebP**, budgeted under 500 KB each, in
  `static/art/scene/`. The existing CSS gradient stays underneath as the fallback.
- The play field's **centre must stay dark and quiet** — cards and text sit there —
  and the composition must survive a **4:3 crop**, because the board runs from
  iPad portrait to ultrawide.
- Full sizes, formats and export settings are in `static/art/README.md`.

## 13. The new-player package

A one-time runway, separate from the daily rhythm. Four intro quests, claimed
once ever and never expiring:

| Quest | Reward |
|---|---|
| Play your first match — **won or lost** | 100 gold + 1 pack |
| Win a game | 1 pack |
| Build a deck | 100 gold |
| Win 3 games | 5 packs + the **Ascendant** card back |

- **7 packs and 200 gold in total** — about 900 gold, or three and a half days of
  income, inside the first session or two.
- **Only the first quest is shown** until it is finished; four quests in front of
  someone who has not played yet is a chore list rather than a welcome. Progress
  on the hidden three still accrues, so a first match that is *won* completes two
  quests at once.
- The first quest pays for **finishing** a match either way. The moment a new
  player is most likely to leave is the one where the game should be most
  generous.
- **Ascendant is not for sale.** It is the only thing in the shop gold cannot
  buy, which is the whole reason it means anything.
- Packs are held in an inventory (`profiles.packs`) and opened from the shop.
  They are not consumed once the collection is complete — the shop stops offering
  to open them rather than burning them on duplicates.
- Payment is guarded by the `claimed` flag on `intro_quests`, set by a guarded
  `UPDATE ... WHERE claimed = 0` before anything is granted. A `gold_awards` row
  cannot do that job here: some rewards carry no gold at all.

**What it does to the curve** (measured 2026-08-22, against the pack rule in §3):

| Income | One of every class | Five of every class | Everything |
|---|---|---|---|
| Keen, ~265/day | day 2 → **day 1** | day 8 → **day 5** | day 30 → 27 |
| Steady, ~150/day | day 4 → **day 1** | day 14 → **day 8** | day 52 → 46 |
| Light, ~75/day | day 7 → **day 1** | day 27 → **day 15** | day 104 → 92 |

It collapses the early game and barely moves the endgame, which is what an
onboarding grant should do. The light player is helped most.
