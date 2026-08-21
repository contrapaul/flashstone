# Flashstone art

Everything here is optional. **Nothing breaks if a file is missing** — each
element falls back to the CSS version the game draws today, so art can arrive one
file at a time.

Adding art is a file drop. There is no manifest to edit and no code to change:
`src/utils/art.ts` builds its index from this directory at build time. Restart
the dev server after adding a file so Vite re-scans.

---

## 1. Card art — `art/cards/<card-id>.webp`

The illustration inside a card's art window.

| | |
|---|---|
| **Filename** | the card's id, exactly — `ergonomics.webp`, `user-centred-design-ucd.webp` |
| **Format** | `.webp` preferred, `.png` accepted |
| **Aspect ratio** | **2.36 : 1** (landscape) |
| **Source size** | **708 × 300 px** — 6× the 118 × 50 CSS window, which covers the card at 2.5× in the inspector on a 2× display |
| **Transparency** | not needed; the window is fully covered |
| **Colour** | sRGB |

The window is a wide letterbox strip across the upper half of the card, and it is
filled with `cover` — so the image is **cropped to fill**, centred, if its ratio
differs. Keep anything essential away from the outer 6%.

Card ids are listed in `src/lib/data/slTerms.ts`. To see them with their stats,
run `npm run dev` and open `/decks`.

> A card with no file keeps its generated gradient and its letter sigil. Once a
> file exists the sigil is hidden automatically.

## 2. Card backs — `art/backs/<back-id>.webp`

| | |
|---|---|
| **Filename** | any slug — `slate.webp`, `blueprint.webp`. `default.webp` replaces the standard back |
| **Aspect ratio** | **1 : 1.254** (portrait — the card is 134 × 168) |
| **Source size** | **536 × 672 px** (4×) |
| **Transparency** | not needed |

Four backs ship: one default plus three purchasable. A back appears in the shop
as soon as its file exists.

## 3. UI elements — `art/ui/<name>.webp`

Each replaces a shape the game currently draws in CSS. All are square unless
noted, and all sit inside a border the CSS still draws — so **draw the face, not
the frame**, and leave the outer 8% clear.

`.svg` is accepted here and is the better choice for the flat marks.

| Name | Replaces | Source size | Transparency |
|---|---|---|---|
| `cost-crystal` | the mana gem on a card's top-left corner | 228 × 252 px | **yes** |
| `attack-gem` | the attack diamond, bottom-left of a card | 138 × 138 px | **yes** |
| `health-gem` | the health drop, bottom-right of a card | 138 × 138 px | **yes** |
| `rarity-gem` | the small rarity lozenge on the nameplate | 66 × 66 px | **yes** |
| `mana-crystal` | one crystal in the mana tray | 132 × 132 px | **yes** |
| `mana-crystal-spent` | a spent crystal in the tray | 132 × 132 px | **yes** |
| `taunt` | the Taunt shield behind a minion | 480 × 480 px | **yes** |
| `divine-shield` | the Divine Shield halo around a minion | 480 × 480 px | **yes** |
| `charge` | the Charge mark on a minion | 144 × 144 px | **yes** |
| `windfury` | the Windfury mark | 144 × 144 px | **yes** |
| `stealth` | the Stealth mark | 144 × 144 px | **yes** |
| `deathrattle` | the Deathrattle mark | 144 × 144 px | **yes** |
| `spell-mark` | the type line's mark on a Spell card | 144 × 144 px | **yes** |
| `weapon-mark` | the type line's mark on a Weapon card (Phase 1B) | 144 × 144 px | **yes** |

Sizes are 6× the CSS size the element occupies, which covers a 2× display with
the card inspected at 2.5×.

> **Currently wired:** `cost-crystal`, `attack-gem`, `health-gem` and
> `rarity-gem`, on the card face. The rest are specified and indexed but not yet
> read by a component — the board and tray elements get wired when the table is
> rebuilt (`docs/plan/PHASE-2-TABLE-UX.md` §6). Drawing them now is safe; they
> will light up without needing to be redrawn.

## 4. Gold (foil) variants — `art/ui/`

Gold cards are a **treatment, not a second illustration.** They reuse the
standard card's art. Two assets cover all 155 cards:

| Name | What it is | Source size | Transparency |
|---|---|---|---|
| `foil-frame` | the gold card border, drawn as a 9-slice-able frame | 536 × 672 px | **yes** |
| `foil-sheen` | the highlight band that sweeps across the face | 1072 × 672 px | **yes** |

**Do not draw 155 gold illustrations.** The current CSS treatment — a gold border
plus an animated sheen — already works; these two files replace it with drawn
versions.

---

## Checking your work

```bash
npm run dev
```

Then open `/decks` to see every card at hand size, and `/play` to see them on the
table. Deleting every file in this directory must return the game to exactly its
current appearance — if it does not, something has been wired without a fallback.
