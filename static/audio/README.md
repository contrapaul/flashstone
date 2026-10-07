# Sound for Flashstone

Record a sound, name the file, drop it in. The game picks it up on the next build.
Nothing waits on audio: a sound with no file is silence, and the game plays the same.

Adapted from Tome of Secrets' `CONTRIBUTING-AUDIO.md`; the engine is the same one.

## Formats

| What | Format | Why |
|---|---|---|
| Sound effects | **WAV**, 48 kHz, 16-bit, **mono** | Decodes everywhere with no delay at the start. A one-second file is 94 KB; forty of them are under 4 MB. |
| Music | **MP3** (192 kbps) or **M4A/AAC**, 48 kHz, stereo | Plays in every browser. WAV would be 10 MB a minute. |

`.wav`, `.mp3`, `.m4a` and `.ogg` are accepted in every folder; the table is what
works best. Please don't send compressed sound effects: MP3 adds about 50 ms of
silence to the start of every file, which makes a hit land late.

**Recording tips:** trim the front tight (the sound should start in its first
millisecond), leave a short natural tail, peak around −3 dB, and don't clip. Keep
effects under two seconds. Every sound plays a few percent off pitch in the game,
so one good take is enough; three are better for the sounds that repeat (below).

## Sound effects — `static/audio/sfx/`

Named exactly:

| File | Plays when |
|---|---|
| `card-draw` | a card is drawn — yours, or (more quietly) theirs. Eight in a row at the start of a match: keep it short and soft |
| `card-hover` | the pointer lifts a card in your hand (quiet) |
| `card-pickup` | you pick a card up to play it |
| `card-play` | a minion or weapon is put down — yours as you drop it, theirs as it is revealed |
| `spell-cast` | a spell is cast |
| `minion-land` | a minion costing 1–3 lands on the board |
| `minion-land-heavy` | one costing 4 or more lands (played lower for 7 and up, which also shakes the table) |
| `attack-swing` | a minion or an armed hero lunges |
| `hit-light` | a minion takes up to 3 damage |
| `hit-heavy` | a minion takes 4 or more |
| `hero-hurt` | a hero takes damage (louder for bigger hits) |
| `death` | a minion shatters |
| `shield-pop` | a Divine Shield breaks |
| `taunt-up` | a Taunt minion lands, or something gains Taunt |
| `freeze` | something is frozen |
| `thaw` | frozen minions thaw at the start of their turn |
| `silence` | something is silenced |
| `buff` | a minion grows, or gains a keyword |
| `heal` | health comes back |
| `armor` | a hero gains armor |
| `weapon-equip` | a weapon arrives |
| `weapon-break` | a weapon breaks |
| `hero-power` | a hero power is used |
| `mana-fill` | the crystals refill at the start of a turn, or The Coin adds one |
| `mana-new` | a turn begins with a new crystal grown |
| `no-mana` | you pick up a card you can't afford |
| `burn` | a card is burned by a full hand |
| `fatigue` | a draw from an empty deck strikes |
| `turn-start` | your turn begins |
| `turn-end` | you press End Turn |
| `fuse` | **a loop**: the online turn timer's last 20 seconds. It stops when the turn ends |
| `emote` | *reserved* — for the emotes in R9; nothing plays it yet |
| `victory` · `defeat` | the match is won or lost — used only when `music/` has no sting of that name |
| `pack-open` | a pack is opened |
| `card-flip` | a card in a pack is turned over |
| `reveal-rare` · `reveal-epic` · `reveal-legendary` | …and it is that rarity (the best one, for "Reveal all") |
| `gold` | gold arrives: a win, a quest, the daily bonus |
| `quest-complete` | a quest is finished in a match, or claimed |
| `ui-click` | any button or link off the table |
| `ui-hover` | the pointer moves onto a menu plate or a nav link |

**Extra takes:** `hit-light.wav`, `hit-light-2.wav`, `hit-light-3.wav` are all the
same sound, and the game picks one at random each time. Worth doing for
`card-draw`, `hit-light`, `hit-heavy`, `card-play` and `ui-click`, which play constantly.

## A card's own lines — `static/audio/cards/`

Optional, and the best classroom brief here: a card can say something when it is
played, when it attacks and when it dies, as Hearthstone's minions do. Name each by
the card's id (it is in the card data, and in the URL of its art):

```
static/audio/cards/<card-id>-play.wav
static/audio/cards/<card-id>-attack.wav
static/audio/cards/<card-id>-death.wav
```

Any of the three can be missing. A line plays **on top of** the ordinary sound, so
keep it a voice or a signature noise rather than another thud. Start with the
Legendaries.

> **For a sound-design lesson:** each student takes a card, reads its name and
> text, and records the three lines — Foley for the attack, a voice for the play,
> something final for the death. It is a real brief with a real client: the
> files go into the game the next build.

## Music — `static/audio/music/`

| File | Plays on |
|---|---|
| `title` | the title screen |
| `menu` | every other page outside a match |
| `match-1`, `match-2`, `match-3` | matches — they take turns, one per match (any number works) |
| `tense` | **a layer**, not a track: it fades in over the match music while either hero is at 10 health or less, and out again when the danger passes. It starts in step with the track under it, so make it the same length as the match tracks to keep it in time |
| `victory` · `defeat` | **stings**, played once as the result comes up, with the music faded out under them |

Every track except the stings loops. Music starts on the first click or key press
(browsers insist), and tracks crossfade over about a second when the page changes.
If a file has a lead-in or a tail that should not repeat, put loop points beside it
as `<name>.json`, in seconds:

```json
{ "loopStart": 4.0, "loopEnd": 92.5 }
```

## Licensing

Only add sound you have the right to use: your own recordings, students' work
with their permission, or CC0 / CC-BY packs (credit CC-BY authors in this file).

### The placeholders in `sfx/` now

Stand-ins until real sound exists, from Kenney's **Interface Sounds** and **RPG
Audio** packs (kenney.nl, CC0 — `KENNEY-LICENSE.txt`), converted to 48 kHz mono
WAV and picked by name and by measuring each file (length, attack, brightness),
not by ear. Replace any of them by saving over the file. Which Kenney sound is
which:

`card-draw` bookFlip3 (+ bookFlip2) · `card-hover` tick_004 · `card-pickup` cloth2 ·
`card-play` bookPlace1–3 · `spell-cast` maximize_004 · `minion-land` dropLeather ·
`minion-land-heavy` doorClose_3 (+ doorClose_2) · `attack-swing` knifeSlice2 (+ knifeSlice) ·
`hit-light` footstep01, 08, 06 · `hit-heavy` chop · `hero-hurt` bookClose ·
`death` glass_004 · `shield-pop` glass_003 · `taunt-up` metalLatch · `freeze` glass_001 ·
`thaw` minimize_003 · `silence` switch_004 · `buff` maximize_002 · `heal` confirmation_003 ·
`armor` metalClick · `weapon-equip` drawKnife3 · `weapon-break` metalPot1 ·
`hero-power` bong_001 · `mana-fill` maximize_008 · `mana-new` maximize_006 ·
`no-mana` error_004 · `burn` scratch_005 · `fatigue` error_006 · `turn-start` confirmation_004 ·
`turn-end` switch_003 · `victory` maximize_001 · `defeat` error_005 · `pack-open` bookOpen ·
`card-flip` bookFlip3 · `reveal-rare` confirmation_001 · `reveal-epic` question_003 ·
`reveal-legendary` maximize_005 · `gold` handleCoins2 (+ handleCoins) ·
`quest-complete` confirmation_002 · `ui-click` click_002 (+ toggle_004) · `ui-hover` tick_002.

Still silent: `fuse` (neither pack has a loop that suits) and `emote` (unused).
There is no music yet.

## Checking your work

Settings has Volume, Music and Sounds sliders. In a dev build (`npm run dev`),
the browser console can audition anything:

```js
__fs.audio.play('hit-heavy')   // one sound
__fs.audio.music('match-1')    // a track
__fs.audio.heard               // the last sixty sounds the game asked for, file or not
```

`heard` is the quickest way to find out which name the game wanted at a moment —
play the moment, then read the end of the list.
