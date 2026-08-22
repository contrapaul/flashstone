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
| **Aspect ratio** | **4 : 3** (landscape) |
| **Source size** | **640 × 480 px** — just over 6× the 104 × 78 CSS window, which covers the card at 2.5× in the inspector on a 2× display |
| **Transparency** | not needed; the window is fully covered |
| **Colour** | sRGB |

The window sits in the upper half of the card with a mount of frame around it,
and is filled with `cover` — so the image is **cropped to fill**, centred, if its
ratio differs. Keep anything essential away from the outer 6%.

It was a 2.36:1 letterbox until playtesting, which is a cinematic crop and a poor
one for a single subject: one object or one figure had to be squeezed into a band.
**Art drawn to the old 708 × 300 will still work** — it is cropped to fill, so it
loses its left and right ends rather than breaking.

The **nameplate overlaps the bottom of the window**, as a nameplate on a real card
does. Keep the lower ~18% clear of anything that must be read.

**`FILENAMES.md` next to this file lists every filename to draw**, in the order
that pays off fastest, with each card's rarity, type and syllabus section. Card
ids also live in `src/lib/data/slTerms.ts`; to see them with their stats, run
`npm run dev` and open `/decks`.

> A card with no file keeps its generated gradient and its letter sigil. Once a
> file exists the sigil is hidden automatically.

## 2. Card backs — `art/backs/<back-id>.webp`

| | |
|---|---|
| **Filename** | any slug — `slate.webp`, `blueprint.webp`. `default.webp` replaces the standard back |
| **Aspect ratio** | **1 : 1.254** (portrait — the card is 134 × 168) |
| **Source size** | **536 × 672 px** (4×) |
| **Transparency** | not needed |

Five backs ship: one default, three purchasable at 300 gold, and `ascendant`,
which is **not for sale** — it is unlocked by winning three games, so it should
read as earned. A back appears in the shop as soon as its file exists.

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

> There was a `rarity-gem` here, an 11px lozenge on the nameplate. It has been
> removed: **rarity is the card's border colour now**, which can be read across a
> board rather than only up close. Nothing needs drawing for it.

> **Currently wired:** `cost-crystal`, `attack-gem` and `health-gem`, on the card
> face. The rest are specified and indexed but not yet read by a component — the board and tray elements get wired when the table is
> rebuilt (`docs/plan/PHASE-2-TABLE-UX.md` §6). Drawing them now is safe; they
> will light up without needing to be redrawn.

## 4. Backdrops — `art/scene/`

Full-bleed backgrounds. These are the **largest files in the game** and the only
ones that are not lazy-loaded, so size matters more here than pixel count.

| Name | Where | Source size | Format |
|---|---|---|---|
| `table` | behind the play field | **2560 × 1440** | `.webp`, lossy |
| `menu` | behind every other page | **2560 × 1440** | `.webp`, lossy |

**Why 2560 × 1440.** The board is height-locked to the viewport and the image is
drawn with `cover`, so it is always scaled to fill rather than shown at native
size. 2560 wide covers a 1280px-wide layout at 2× device pixel ratio, and
downscales cleanly to the 1920 × 1080 most desktops actually use. Going to
3840 × 2160 roughly doubles the file for a difference nobody will see through a
vignette — do it only if a specific 4K display looks soft.

**Two constraints that matter more than resolution:**

- **Keep the centre quiet.** Cards, minions and the hero portraits sit in the
  middle of the screen, over parchment-coloured text panels. A busy or bright
  centre makes card text unreadable, and the existing `.vignette` overlay only
  darkens the edges. Put the detail in the outer thirds and keep the middle dark
  and low-contrast.
- **Design for a 4:3 safe area.** The board runs from iPad portrait (768 × 1024,
  taller than it is wide) to ultrawide desktop. A 16:9 image cropped to fill a
  3:4 viewport loses about **44% of its width**, so anything essential must sit
  inside the central 4:3 region. If a scene really needs the full width, supply
  `table-portrait.webp` at 1536 × 2048 and it will be used below 820px wide.

**Budget: aim for under 500 KB each**, which quality 78–85 comfortably allows for
a dark painterly scene. This is a study tool that will be opened on school wifi;
a 3 MB background is felt on every single page load.

The current CSS gradient stays underneath as the fallback, so a missing or
still-loading backdrop looks deliberate rather than blank.

## 5. Gold (foil) variants — `art/ui/`

Gold cards are a **treatment, not a second illustration.** They reuse the
standard card's art. Two assets cover all 210 cards:

| Name | What it is | Source size | Transparency |
|---|---|---|---|
| `foil-frame` | the gold card border, drawn as a 9-slice-able frame | 536 × 672 px | **yes** |
| `foil-sheen` | the highlight band that sweeps across the face | 1072 × 672 px | **yes** |

**Do not draw 210 gold illustrations.** The current CSS treatment — a gold border
plus an animated sheen — already works; these two files replace it with drawn
versions.

## 6. Is WebP the right format?

**Yes, for all of it** — with one exception worth knowing.

- **Backdrops and card art: lossy WebP, quality 78–85.** These are painterly,
  full-colour images where lossy compression is invisible and the saving over PNG
  is large — typically 4–8× smaller at the same perceived quality. This is the
  case WebP is best at.
- **UI elements and card backs: WebP too**, and it supports alpha, which those
  need. But if an element is *flat* — hard edges, few colours, no gradients, like
  a keyword mark — try **lossless WebP or PNG** as well and keep whichever is
  smaller. Lossy compression puts soft halos around hard edges, and at 144 px a
  halo is visible.
- **`.svg` is accepted for `art/ui/` and is the better choice for the flat marks**
  — it stays crisp at any zoom, including the inspector's 2.5× enlargement, and is
  usually a fraction of the size.

**Browser support is not a concern.** Every browser this game targets has
supported WebP for years, and the app already loads `.webp` for card art.

**AVIF would be roughly 20% smaller and is not worth it here** — slower to
encode, more awkward tooling, and the saving is small against a 500 KB budget.
Stay on WebP.

**Export settings, concretely:** sRGB, 8-bit, no embedded colour profile beyond
sRGB, and strip metadata. From most editors: *Export As → WebP → Quality 80*.
If you are exporting from a PNG master, `cwebp -q 80 in.png -o out.webp` does the
same job and reports the file size.

---

## Checking your work

```bash
npm run dev
```

Then open `/decks` to see every card at hand size, and `/play` to see them on the
table. Deleting every file in this directory must return the game to exactly its
current appearance — if it does not, something has been wired without a fallback.
