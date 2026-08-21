# Phase 1B — Spells, weapons and manual targeting

**Covers the follow-up item 3: "a range of basic spell cards and ability cards —
fireball, equip weapons, swap health and damage".**
**Depends on:** Phase 1. **Blocks:** Phase 4 (the "cast 10 spells" quest), Phase 5
(targeting has to cross the wire).

Numbered 1B rather than 6 because it belongs **immediately after Phase 1** — it expands
the card model that Phase 1 establishes, and everything downstream assumes it.

> **Why this is its own phase.** Phase 1 §3 deliberately left manual targeting alone:
> `resolveTargets()` in `engine.ts` picks targets automatically from a `Target` enum, and
> nothing in the codebase lets a player choose. "Fireball" is not a card you can express
> without it. Weapons are further still — `CardType` is
> `'Minion' | 'Spell' | 'HeroPower'`, `PlayerState` has no weapon slot, and heroes cannot
> attack at all. These are engine features, not card data, and folding them into Phase 1
> would bury a real design job inside a data-generation task.

Paul's note: **the card names here are placeholders he will rename to fit the subject.**
Build the mechanics; do not agonise over the flavour.

---

## Preconditions

- Phase 1 done. `npm test` green, `npm run check` 0 errors.
- Read `engine.ts`'s `resolveEffect` / `resolveTargets` and `state.ts`'s `legalTargets`
  before starting. The Taunt and Stealth rules in `legalTargets` must apply to spell
  targeting too, or Stealth stops meaning anything.

---

## 1. Manual targeting

- [ ] **1.1** Add a `'Chosen'` member to the `Target` union in `src/types/cards.ts` **and**
      the Zod enum in `card.validator.ts` (same commit, always — `README.md` conventions).
      A `Chosen` effect resolves against a target supplied by the caller rather than by
      `resolveTargets`.
      → **verify:** `npm run check` clean; a card with a `Chosen` effect validates.

- [ ] **1.2** `playCard(state, owner, handIndex)` gains an optional `target?: Character`.
      When a card has any `Chosen` effect and no legal target is supplied, the play is
      **refused** (return `false`) rather than fizzling — the engine's existing convention
      is a boolean for legality, so keep it.
      → **verify:** tests — a Chosen spell with no target returns `false` and does not
      spend mana; with a legal target it resolves; with an illegal target (a Stealth
      minion, or a non-enemy when the card says enemy) it returns `false`.

- [ ] **1.3** New `spellTargets(state, owner, card): Character[]` in `state.ts`, the
      spell-side analogue of `legalTargets`. **Taunt does not restrict spells** (that is
      the standard rule and the interesting one), but **Stealth still hides a minion**.
      Some spells target friendly characters, some enemy, some any — carry that on the
      effect.
      → **verify:** tests for each case, including that a Taunt wall does not stop a
      fireball reaching the enemy hero and that a Stealth minion is never in the list.

- [ ] **1.4** UI: clicking a targeted spell in hand enters a **targeting mode** — legal
      characters highlight, the aiming arrow already used for attacks is reused
      (`aim`, `aim-line`, `aim-head` in `play/+page.svelte`), Escape or a click on empty
      space cancels. **Reuse the attack targeting code path**; do not build a second one.
      → **verify:** in the browser — cast a fireball at a minion, at the enemy hero, and
      cancel a cast; mana is only spent on the completed cast.

- [ ] **1.5** The AI must pick targets. `ai.ts` already routes through `legalTargets`;
      extend `playAiTurn` to choose a `Chosen` target with a simple heuristic — damage the
      biggest thing it kills outright, else the hero; buff its own biggest minion.
      → **verify:** an AI holding a fireball with lethal on board takes it; existing
      `ai.test.ts` still passes.

## 2. A basic spell set

- [ ] **2.1** Extend the `Action` union (and the Zod enum, same commit) with what the
      starter spells need and nothing more:
      - `SwapStats` — swap a minion's attack and health (Paul's "swap health and damage").
      - `RestoreHealth` is already `Heal`; `Destroy` already exists. **Check before adding.**
      Anything you add needs a `case` in `resolveEffect` and a test.
      → **verify:** every member of the `Action` union has a `case`; add a test that fails
      if one is added without one.

- [ ] **2.2** Author ~10 basic spells as hand-written cards (see §4 — they go in the
      manual card file, not the generator). Suggested spread, placeholder names:
      fireball (damage one), arcane blast (damage all enemies), healing touch, a draw-two,
      a board-wide buff, a single-target Destroy at high cost, a Freeze, a Silence, a
      SwapStats, and a summon-tokens.
      → **verify:** each validates, each has a test that casting it does what its text says.

- [ ] **2.3** Spell cards render with **no attack/health gems** and a `SPELL` type line —
      `CardPreview.svelte` already branches on `isMinion` for this. Confirm it still reads
      correctly with the shorter text rules from the follow-up item 1.
      → **verify:** look at one on the table.

## 3. Weapons

Weapons are the biggest single addition here. Everything below is new.

- [ ] **3.1** `CardType` gains `'Weapon'`; the card carries `attack` and a new
      `durability`. Update `card.validator.ts`'s `.refine()` — it currently asserts that
      only Minions have attack/health, which a Weapon breaks.
      → **verify:** a Weapon card validates; a Weapon with `health` does not.

- [ ] **3.2** `PlayerState` gains `weapon: { card: Card; attack: number; durability: number } | null`.
      Equipping replaces any existing weapon (the old one is destroyed, not stacked).
      → **verify:** equip twice; the second replaces the first.

- [ ] **3.3** Heroes can attack. This is the invasive part: `canAttack` and the `attack()`
      flow are minion-shaped (`MinionInstance`, `summonedThisTurn`, `attacksThisTurn`).
      Add a hero attack path — once per turn, only with a weapon, damage equal to weapon
      attack, **hero takes the defender's attack back**, weapon loses 1 durability and is
      destroyed at 0. Taunt applies to hero attacks exactly as to minion attacks.
      → **verify:** tests — a hero with no weapon cannot attack; a hero attacking a 3-attack
      minion takes 3; durability decrements and the weapon vanishes at 0; a Taunt blocks
      the hero.

- [ ] **3.4** Emit animation cues for equip, hero attack and weapon break, per
      `HANDOVER.md` §5 — **anything that mutates state must emit or it will not animate.**
      Add the new event types to `events.ts` and `EVENT_BEAT`.
      → **verify:** the existing "createMatch produces an empty events array" test still
      passes; a new test asserts equipping emits.

- [ ] **3.5** UI: a weapon slot on `HeroPortrait.svelte` showing attack and durability,
      and the hero portrait becomes clickable-to-attack when armed. **`HeroPortrait`
      already has an unused `armor` slot** (`HANDOVER.md` §7) — decide whether weapons
      finally justify it or whether armor goes; do not leave both dead.
      → **verify:** equip, swing at a minion, watch durability tick down.

- [ ] **3.6** The AI must use weapons — equip when it can, swing when the trade is good.
      → **verify:** the AI equips and attacks in a real match; `ai.test.ts` green.

## 4. "Ability cards"

Paul's phrasing covers three things that are not the same. **Confirm which is meant
before building** (`OPEN-QUESTIONS.md` #9); the default is the first two only:

- **Spells** — covered by §2.
- **Weapons** — covered by §3.
- **Hero powers** — a once-per-turn button, not a card. `CardType` has `'HeroPower'` but
  `HANDOVER.md` §7 records that the engine treats it as a Spell, and there is no UI for
  it. **Out of scope by default** — it is a separate mechanic, not a card set.

---

## Done when

- `npm test` green with new coverage for targeting, each spell, and every weapon rule.
- `npm run check` 0 errors.
- In a browser: cast a targeted spell at a minion and at a hero, cancel a cast, equip a
  weapon and attack with the hero, and see the weapon break.
- The AI does all of the above against you.
- `HANDOVER.md` §5 (the architecture table and the event queue paragraph) and §7 updated
  — manual targeting is no longer a gap, and `HeroPower` / armor are resolved or restated.

## Found along the way

_Real problems noticed but out of scope — record here, do not fix silently._
