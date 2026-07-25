# Flashstone visual overhaul — porting notes

Written 2026-07-25, alongside the `Flashstone.dc.html` mockup.

Everything under `port/` mirrors the repo's own paths — copy each file over the
matching one in `flashstone/`. Files that **replace** an existing file are noted;
the rest are new.

```
port/src/utils/art.ts                        NEW
port/src/lib/styles/flashstone.css           NEW  (imported once from +layout)
port/src/lib/engine/events.ts                NEW
port/src/lib/engine/state.ts                 REPLACES
port/src/types/cards.ts                      REPLACES
port/src/validators/card.validator.ts        REPLACES
port/src/lib/components/CardPreview.svelte   REPLACES
port/src/lib/components/MinionView.svelte    REPLACES
port/src/lib/components/HeroPortrait.svelte  NEW
port/src/lib/components/ManaTray.svelte      NEW
port/src/lib/components/CardBack.svelte      NEW
port/src/lib/components/TurnBanner.svelte    NEW
port/src/lib/components/FloatingNumber.svelte NEW
port/src/lib/components/Chronicle.svelte     NEW
port/src/routes/+layout.svelte               REPLACES
port/src/routes/play/+page.svelte            REPLACES
```

All Svelte 4 (`export let`, `$:`) with `lang="ts"`, per HANDOVER §4.

---

## 1. What is NOT done — `engine.ts`

`engine.ts` is the one file I did not rewrite: it is 412 lines of load-bearing
logic behind 33 passing tests, and the changes below want to be made and
verified one at a time. Each is additive. **Run `npm test` after each.**

### 1a. New `MinionInstance` fields (required — `summon()` will not type-check without it)

`state.ts` now declares `frozen`, `silenced` and `buffed`. Initialise them in
`summon()`:

```diff
   const minion: MinionInstance = {
     instanceId: `m${state.nextInstanceId++}`,
     card,
     attack: card.attack ?? 0,
     health: card.health ?? 1,
     maxHealth: card.health ?? 1,
     keywords: [...card.keywords],
     divineShield: card.keywords.includes('DivineShield'),
     summonedThisTurn: true,
-    attacksThisTurn: 0
+    attacksThisTurn: 0,
+    frozen: false,
+    silenced: false,
+    buffed: false
   };
```

### 1b. `armor` on `PlayerState`

`createPlayer()` needs `armor: 0`, and `damageHero()` should spend it first:

```diff
 function damageHero(state: MatchState, id: PlayerId, amount: number): void {
   if (amount <= 0) return;
-  state.players[id].health -= amount;
+  const p = state.players[id];
+  const absorbed = Math.min(p.armor, amount);
+  p.armor -= absorbed;
+  p.health -= amount - absorbed;
   checkWinner(state);
 }
```

Nothing grants armor today — the hero frame shows the slot at 0. Either wire it
to a future Hero Power or drop the `armor` prop from `HeroPortrait`.

### 1c. Freeze thaws at the start of its controller's turn

In `startTurn()`, inside the existing board loop:

```diff
   for (const minion of p.board) {
     minion.summonedThisTurn = false;
     minion.attacksThisTurn = 0;
+    minion.frozen = false;
   }
```

`canAttack()` already rejects frozen minions (in the new `state.ts`).

### 1d. Two new actions

`Freeze` and `Silence` are in the `Action` union and the Zod enum already. Add
them to the `switch` in `resolveEffect()`:

```ts
case 'Freeze':
  if (target.kind === 'minion') target.minion.frozen = true;
  break;

case 'Silence':
  if (target.kind === 'minion') silence(target.minion);   // import from ./state
  break;
```

`silence()` clears `keywords` and `divineShield`. Note it does **not** clear
`card.effects` — those are read off the immutable `card`, so a silenced minion
still fires Deathrattles. If you want true Silence, add
`if (minion.silenced) continue;` in `triggerBoard()` and in the Deathrattle loop
in `checkDeaths()`.

Also set `minion.buffed = true` in the `BuffAttack` / `BuffHealth` cases so the
stat gems bloom green.

### 1e. The event queue — the change that makes animation possible

This is the real architectural one. Today the engine mutates `MatchState` and
the UI does `state = state`, so a minion that dies during an attack vanishes in
the same frame the attack resolves; there is nothing to animate *between*.

`events.ts` defines the cue type. Add `events: []` to the `MatchState` literal
in `createMatch()`, a tiny helper, and one call at each mutation site:

```ts
function emit(state: MatchState, event: GameEvent): void {
  state.events.push(event);
}
```

| Site in `engine.ts` | Cue |
|---|---|
| `drawCard`, after `p.hand.push(card)` | `{ type: 'draw', owner: id }` |
| `summon`, after `p.board.push(minion)` | `{ type: 'summon', owner: id, instanceId }` |
| `attack`, after `attacker.attacksThisTurn++` | `{ type: 'attack', owner: id, instanceId }` |
| `damageMinion`, shield branch | `{ type: 'shield', instanceId }` |
| `damageMinion`, damage branch | `{ type: 'damage', target: {kind:'minion',instanceId}, amount }` |
| `damageHero` | `{ type: 'damage', target: {kind:'hero',owner:id}, amount }` |
| `checkDeaths`, per dead minion | `{ type: 'death', owner, instanceId }` |
| `startTurn` | `{ type: 'turn', owner: id }` |
| Freeze / Silence / Buff cases | `freeze` / `silence` / `buff` |

The UI (`play/+page.svelte`) already drains this queue on a timeline —
see `drain()`. **Until you add the emit calls the board still plays correctly,
it just does not animate**: the queue is empty, `drain()` returns immediately,
and everything snaps as it does today. That makes this a safe, incremental
change; do 1a–1d first, ship, then add cues one row at a time.

One ordering caveat: `drain()` runs *after* the engine has finished mutating, so
the visuals lag the truth by up to a second. `myTurn` is gated on `!draining` so
the player can't act mid-playback. If that latency bothers you, the alternative
is a synchronous engine that yields between steps — considerably more work.

---

## 2. Also not done, and why

- **`ai.ts` is unaware of the new statuses.** It will happily try to attack with
  a frozen minion (the engine rejects it, so it just wastes the swing) and does
  not know that Stealth minions can't be targeted. `playAiTurn` should filter
  on the new `canAttack` / `isTargetable` exports.
- **`fieldMapper.ts` float-cost bug (HANDOVER §7).** Still there:
  `(front.length + back.length) / 5` is a float and `CardSchema.int()` rejects
  it, so every import without a cost column fails validation. I didn't touch it
  because the fix depends on the stat-derivation decision below. The mockup
  uses `clamp(1, 9, round(len / 26))` for cost, a hash-derived attack, and
  `cost + 1 - (hash & 1)` for health — that's a proposal, not a decision.
- **Stat derivation is still Paul's call** (HANDOVER §7). It determines the
  game's texture and every card's art, because `art.ts` and the stat hash
  should share a seed.
- **`decks`, `import` and `learn` routes are not ported.** They're designed in
  the mockup (deck builder with mana curve and card inspector, four-step import
  with column mapping, the illustrated keyword codex) but they're static
  markup translation — say the word and I'll do them next.
- **Fonts load from Google.** For an offline-safe build, self-host Cinzel and
  EB Garamond into `static/fonts/` and swap the `@import` in `flashstone.css`
  for `@font-face` rules.

---

## 3. New tests worth adding

Alongside the existing 33:

- a frozen minion cannot attack, and thaws at the start of its controller's turn
- Silence strips keywords and Divine Shield, and the minion stops being a Taunt
- a Stealth minion is absent from `legalTargets`, even when it has Taunt
- armor absorbs hero damage before health, and never goes negative
- `createMatch` produces an empty `events` array, and `playCard` appends a
  `summon` cue (guards against a silently broken queue)

---

## 4. Verification checklist

From the app directory, per HANDOVER §2:

```bash
npm install && npx svelte-kit sync && npm test && npm run build && npm run check
```

Then in a browser at 1440×900: the board must fit with no page scroll (the
column sums to 824px + 54px nav), the hand must stay on screen at 10 cards
(it scales, it does not overlap), and the Chronicle must not overlap a full
seven-minion enemy board.
