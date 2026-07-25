# Fonts

Flashstone makes **no external font requests**. Both families are self-hosted from
this folder, which SvelteKit serves at `/fonts/…`.

Until the files below exist, `flashstone.css` falls back to Georgia — the app looks
plainer but nothing breaks.

## Files to place here

Exact filenames — `flashstone.css` references these paths verbatim.

| Filename | Family | Weight | Style |
|---|---|---|---|
| `cinzel-500.woff2` | Cinzel | 500 Medium | normal |
| `cinzel-600.woff2` | Cinzel | 600 SemiBold | normal |
| `cinzel-700.woff2` | Cinzel | 700 Bold | normal |
| `eb-garamond-400.woff2` | EB Garamond | 400 Regular | normal |
| `eb-garamond-500.woff2` | EB Garamond | 500 Medium | normal |
| `eb-garamond-600.woff2` | EB Garamond | 600 SemiBold | normal |
| `eb-garamond-400-italic.woff2` | EB Garamond | 400 Regular | *italic* |

Seven files. `.woff2` only — every browser Flashstone targets supports it, and a
second format would double the bytes for nothing.

## Where they're used

- **Cinzel** (`--display`) — the wordmark, nav, card names, turn banners, buttons.
  Display sizes only, which is why it needs 500/600/700 and no italic.
- **EB Garamond** (`--body`) — card body text, answers, the Chronicle, rules copy.
  The italic is used for flavour text.

## Licensing

Both are under the SIL Open Font License 1.1, so self-hosting and redistribution
in this repo are fine. Please drop the upstream `OFL.txt` in beside them.

Upstream sources (download the static `.woff2` weights, not the variable font —
the `@font-face` rules declare single weights):

- Cinzel — <https://github.com/googlefonts/cinzel>
- EB Garamond — <https://github.com/octaviopardo/EBGaramond12>

## If you'd rather use a variable font

Swap the seven rules in `flashstone.css` for two, each with a range:

```css
@font-face {
  font-family: 'Cinzel';
  src: url('/fonts/cinzel-variable.woff2') format('woff2-variations');
  font-weight: 400 900;
  font-display: swap;
}
```

Fewer requests and smaller total, but it changes the filenames — tell me and
I'll rewrite the CSS to match.
