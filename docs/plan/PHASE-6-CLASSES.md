# Phase 6 — Classes and hero powers

**Covers:** four classes, each with a hero power and ten class cards.
**Depends on:** Phases 1, 1B, 3, 4 (collection, packs and decks all gain a class
dimension). **Blocks:** nothing.

Four classes, loosely modelled on Hearthstone archetypes:

| Class | Modelled on | Hero power | Cost |
|---|---|---|---|
| **Designer** | Shaman | **Summon a Design Idea** — a random one of four 1-mana tokens | 2 |
| **Engineer** | Warrior | **Make it Stronger** — gain 2 Armor | 2 |
| **Consumer** | Warlock | **Pay on Credit** — draw a card, take 2 damage | 2 |
| **Manufacturer** | Mage | **Robotic Arm** — deal 1 damage | 2 |

Standard rules: **2 mana, once per turn**, and a hero power is never a card in
hand — it is a button beside the hero.

---

## Read this first: four engine features this needs that do not exist

This phase is much less about content than it looks. Grounded by reading the
source on 2026-08-22:

1. **Hero powers are entirely unimplemented.** `'HeroPower'` is a member of
   `CardType` and appears in the Zod enum. That is all: the string appears
   nowhere in `src/lib/engine/` or `src/lib/data/`. There is no once-per-turn
   tracking, no button, no cost, no AI use. Phase 1B §4 deferred this
   deliberately; it can no longer be deferred.
2. **There is no spell damage system.** `grep -rn "spellDamage" src/` returns
   nothing. The Designer's *Overclocked CPU* token is Spell Damage +1, which
   means building the concept: a per-player modifier summed from the board, read
   by `DealDamage` **only when the source is a spell** — not a Battlecry, not a
   weapon, not a minion attack.
3. **`SummonToken` can only ever summon one thing.** `TOKEN_CARD` in `engine.ts`
   is a single hardcoded 1/1 "Study Note". The Designer needs **four** named
   tokens with different statlines, one of which has an end-of-turn effect.
4. **Nothing grants armor.** `damageHero` spends it, `createPlayer` sets it to 0,
   and no card produces any. *Make it Stronger* is the first source — which
   finally resolves the long-standing gap in `HANDOVER.md` §7.

There is also a missing target: **"all friendly minions"**. The `Target` union
has `FriendlyMinion` (one, chosen at random) and `AllEnemies`, but nothing that
hits your whole board — which *Rechargeable Battery* needs.

---

## 1. The class dimension

- [ ] **1.1** Add `CardClass = 'Neutral' | 'Designer' | 'Engineer' | 'Consumer' | 'Manufacturer'`
      to `src/types/cards.ts` and a `class?: CardClass` field on `Card`, defaulting
      to `'Neutral'`. Mirror it in `card.validator.ts` **in the same commit**.
      **All 155 existing SL cards stay Neutral** — they are syllabus terms, not
      class identity, and reclassifying them would break every saved deck.
      → **verify:** every generated card reports `Neutral`; `npm run cards` output
      is unchanged.

- [ ] **1.2** A deck has a class. `Deck` gains `class: CardClass`, and
      `deckProblems` gains one rule: **a deck may contain its own class's cards
      and Neutral cards, nothing else.** Keep the existing per-card limits.
      → **verify:** a Designer deck accepts Designer and Neutral cards and refuses
      an Engineer card, with a message naming the offending cards.

- [ ] **1.3** The **server re-validates the class rule**, because it re-validates
      everything else (`lib/server/collection.ts`). It shares `deckProblems`, so
      this should be free — confirm it is.
      → **verify:** a `curl` posting a mixed-class deck is refused 400.

- [ ] **1.4** Decide what a player starts with (`OPEN-QUESTIONS.md` #15). Today it
      is 15 Neutral cards, two copies each — exactly one deck. With classes that
      is one deck of *no* class.
      → **verify:** a new account can build and play a legal deck of at least one
      class without opening a pack.

## 2. Hero powers

- [ ] **2.1** `PlayerState` gains `heroClass: CardClass` and
      `heroPowerUsedThisTurn: boolean`, cleared in `startTurn` alongside
      `heroAttacksThisTurn`. `HERO_POWER_COST = 2`.
      → **verify:** a unit test that the flag clears at the start of its
      controller's turn and not the opponent's.

- [ ] **2.2** `useHeroPower(state, id, target?)` in `engine.ts`, next to
      `heroAttack` and shaped like it: returns `false` for illegal use rather
      than throwing, checks turn, mana and the once-per-turn flag, spends 2 mana,
      sets the flag, emits a cue.
      → **verify:** tests — refused off-turn, refused twice in a turn, refused
      under 2 mana, allowed again next turn.

- [ ] **2.3** Define the four powers as data, not as a `switch` in the engine:
      a `HERO_POWERS: Record<CardClass, HeroPower>` table in
      `src/lib/data/classes.ts`, each carrying its name, description, cost and
      `Effect[]` — so a power resolves through the **same `resolveEffect`** cards
      use. A power that needs aiming (`Robotic Arm`) carries `Target: 'Chosen'`
      and reuses Phase 1B's targeting whole.
      → **verify:** each power's effect list validates against the Zod schema.

- [ ] **2.4** Emit `heroPower` cues and add a beat to `EVENT_BEAT`
      (`HANDOVER.md` §5 — anything that mutates must emit, or it will not animate).
      → **verify:** using a power appends exactly one cue.

- [ ] **2.5** The AI uses its power. Keep it shallow, like the weapon logic:
      spend leftover mana at end of turn, aim *Robotic Arm* at something it kills,
      and **do not** let the Consumer tap itself to death — a health floor
      (say, stop below 10) is the one non-obvious rule here.
      → **verify:** a test that the AI never drops itself below the floor with
      *Pay on Credit*, over many simulated turns.

## 3. What each power needs that does not exist

- [ ] **3.1 — Engineer, the easy one.** `Make it Stronger` = an `Effect` with a
      new `GainArmor` action. Add it to the `Action` union, the Zod enum, a case
      in `resolveEffect`, and the card-text formatter — whose switch is
      **exhaustive by construction** since Phase 1B, so a missing case is a
      compile error rather than a blank card.
      → **verify:** armor rises by 2, is spent before health by `damageHero`, and
      the hero portrait shows the slot it currently hides at zero.

- [ ] **3.2 — Manufacturer.** `Robotic Arm` = `DealDamage 1` with
      `Target: 'Chosen'`. This should need **no new engine work at all** — if it
      does, Phase 1B's targeting is less reusable than it looked, which is worth
      knowing.
      → **verify:** aim it at a minion and at a hero; Stealth is not targetable;
      Taunt does not block it (it is a power, not an attack).

- [ ] **3.3 — Consumer.** `Pay on Credit` = `DrawCard 1` plus 2 damage to your
      **own** hero. `Target: 'Hero'` currently resolves to *the enemy* for harmful
      actions (`HELPFUL` set in `resolveEffect`) — so this needs either a
      `SelfHero` target or an explicit owner on the effect. Pick one and comment why.
      → **verify:** it damages the caster, never the opponent; it can kill you,
      and doing so ends the match correctly.

- [ ] **3.4 — Designer, the expensive one.** Four tokens, then a random summon.
      Build `src/lib/data/tokens.ts` and generalise `SummonToken` to name a token
      (defaulting to Study Note so nothing existing changes):

      | Token | Hearthstone original | Stats | Text |
      |---|---|---|---|
      | Rechargeable Battery | Healing Totem | 0/2 | At the end of your turn, restore 1 Health to all friendly minions |
      | OLED Screen | Searing Totem | 1/1 | — |
      | Reinforced Frame | Stoneclaw Totem | 0/2 | Taunt |
      | Overclocked CPU | Wrath of Air Totem | 0/2 | Spell Damage +1 |

      **Summon one you do not already have**, as Hearthstone does — with all four
      out, the power should do nothing rather than duplicating one.
      → **verify:** tests — the summon is seeded and reproducible; with three out
      it always gives the fourth; with four out it is refused and the mana is not
      spent.

- [ ] **3.5 — Spell Damage, the one genuinely new system.** A `spellDamage`
      number on `PlayerState`, recomputed from the board (a `SpellDamage` keyword
      or a per-card value), added to `DealDamage` **only when the effect's source
      is a spell or a hero power** — never a minion's Battlecry, never a weapon.
      Getting that condition wrong is the classic bug: every Battlecry silently
      scales.
      → **verify:** tests — a spell with Overclocked CPU out deals +1; a
      Battlecry with it out deals unchanged damage; two CPUs give +2; silencing
      one drops it back; it applies to the Manufacturer's power.

## 4. The forty class cards

Ten per class. **Design them against what the engine can already do** — this
phase is heavy enough without new mechanics hiding in the card list.

- [ ] **4.1** Author them in `src/lib/data/customCards.ts` alongside the Phase 1B
      spells and weapons, each with its `class`. Names are placeholders for Paul
      to rename, as before.
      → **verify:** all 40 validate; ids are unique across the registry (the
      registry throws at module load otherwise).

- [ ] **4.2** Lean each class on its archetype so they feel different: Designer
      on tokens and board width, Engineer on armor and weapons, Consumer on
      drawing hard and paying in health, Manufacturer on direct damage.
      → **verify:** play one match with each class deck and write down whether it
      felt distinct. This one is a judgement, not an assertion.

- [ ] **4.3** Packs must deal class cards. Decide whether a pack is class-weighted
      or fully random (`OPEN-QUESTIONS.md` #16) and make `openPack` respect it.
      The no-duplicates and guaranteed-Rare rules apply unchanged.
      → **verify:** the existing pack tests still pass; a new one asserts whatever
      class rule is chosen.

## 5. UI

- [ ] **5.1** A hero power button beside each hero portrait: cost, art, lit when
      usable, spent when used. It belongs in `MatchTable.svelte` so **both modes
      get it at once** — the table must not learn to branch on mode.
      → **verify:** usable exactly once a turn, greyed under 2 mana, and the
      opponent's shows as spent when they use it.

- [ ] **5.2** Class choice in the deck builder, and the class shown on a deck.
      Filter the collection by "playable in this deck".
      → **verify:** switching class re-filters and warns before orphaning cards.

- [ ] **5.3** `PlayerView` carries each side's `heroClass`, hero power state and
      spell damage; the room broadcasts it. **Re-validate power use server-side**
      exactly as `playCard` is.
      → **verify:** a crafted `useHeroPower` twice in a turn is refused by the room.

- [ ] **5.4** Class art: a hero portrait per class, and a hero power icon per
      class, both behind the `static/art/` lookup with the current CSS as fallback.
      Add them to `static/art/README.md`.
      → **verify:** dropping a file in changes the portrait with no code change.

---

## Done when

- `npm test` green, `npm run check` 0 errors, both projects build.
- A new account can pick a class, build a legal class deck, and play it against
  the AI and online.
- Each power works, once per turn, and the AI uses its own.
- Spell Damage affects spells and hero powers and **nothing else**.
- `HANDOVER.md` §3 and §7 updated — hero powers and armor are no longer gaps.

## Found along the way

_Real problems noticed but out of scope — record here, do not fix silently._
