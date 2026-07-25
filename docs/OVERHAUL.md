# Flashstone visual overhaul — porting notes

> **Status: fully applied — nothing here is outstanding work.** Written
> 2026-07-25 alongside the `Flashstone.dc.html` mockup as porting instructions.
> All of it was carried out the same day, in `8d8841b` (play screen + engine)
> and `b22d22a` (remaining routes). The `port/` staging directory has been
> removed; its files now live at their real paths.
>
> Kept as the record of **why the engine looks the way it does** — above all
> §1e, the event queue. Per-section status is noted inline.

The staging directory `port/` mirrored the repo's own paths; each file was
copied over its matching one. Files that **replaced** an existing file are
noted; the rest were new.

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

## 1. `engine.ts` — ✅ all applied

At the time of writing this was the one file left un-ported: 412 lines of
load-bearing logic behind 33 passing tests, so the changes were specified as
diffs to apply and verify one at a time rather than a blind rewrite.

**All five (1a–1e) are now in `src/lib/engine/engine.ts`**, including the full
event queue — every emit site in the §1e table is wired. The suite is at 77
tests. The diffs below are retained as the rationale for each change.

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

## 2. Open questions at the time — all since resolved

- **`ai.ts` and the new statuses** — no change was needed. `playAiTurn` already
  routes through `canAttack` and `legalTargets`, so frozen minions are skipped
  and Stealth minions are unreachable automatically.
- **`fieldMapper.ts` float-cost bug** — this was **already fixed** before the
  port, in `5f23472`. The concern came from a stale `HANDOVER.md` §7. Cost is
  `readInt(...) ?? weightedPick(rng, COST_WEIGHTS)`; both branches are integers.
- **Stat derivation** — also already decided and shipped: explicit columns win,
  otherwise an FNV-1a hash of the card's text drives cost, stats and rarity.
  Note the mockup proposed a length-based cost (`round(len / 26)`), which Paul
  had explicitly rejected earlier for clumping everything mid-curve. The
  hash-based version stands.
- **Shared seed for art and stats** — satisfied with no work. `art.ts`'s
  `hashText` and `fieldMapper`'s `hashString` are the same FNV-1a with the same
  constants; verified to return identical values for identical input.
- **`decks`, `import` and `learn` routes** — restyled in `b22d22a`. They use the
  overhaul's tokens and type, though not the richer mockup designs (deck builder
  with mana curve and card inspector, four-step import, illustrated keyword
  codex). Those remain available as a future step.
- **Fonts** — no longer load from Google. `flashstone.css` declares self-hosted
  `@font-face` rules against `static/fonts/`, with a Georgia fallback. See
  `static/fonts/README.md` for the seven `.woff2` files required.

---

## 3. New tests — ✅ all added

All five are in `src/lib/engine/engine.test.ts`; the suite went 64 → 77.

- a frozen minion cannot attack, and thaws at the start of its controller's turn
- Silence strips keywords and Divine Shield, and the minion stops being a Taunt
- a Stealth minion is absent from `legalTargets`, even when it has Taunt
- armor absorbs hero damage before health, and never goes negative
- `createMatch` produces an empty `events` array, and `playCard` appends a
  `summon` cue (guards against a silently broken queue)

---

## 4. Verification checklist — ✅ passed

Run at 1440×900. The fit check initially failed by 43px: a stray spacer `div` in
the "you" hero row took row 1 / column 3 of a `1fr auto 1fr` grid, pushing End
Turn onto a second grid row. Removing it, making `.table` `border-box` and
subtracting 55px for the nav (54px + 1px border) brought the column to the
intended 824px with zero page scroll.

From the app directory, per HANDOVER §2:

```bash
npm install && npx svelte-kit sync && npm test && npm run build && npm run check
```

Then in a browser at 1440×900: the board must fit with no page scroll (the
column sums to 824px + 54px nav), the hand must stay on screen at 10 cards
(it scales, it does not overlap), and the Chronicle must not overlap a full
seven-minion enemy board.
