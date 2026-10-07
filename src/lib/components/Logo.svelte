<script lang="ts" context="module">
  /** Gradient and path ids must be unique per instance: the nav and the title both draw one. */
  let instances = 0;
</script>

<script lang="ts">
  import { settings } from '../settings';
  import { uiArtUrl } from '../../utils/art';

  /**
   * The Flashstone mark, drawn rather than set: FLASHSTONE on a gentle arch in
   * Hearthstone's gold treatment — a bevelled gradient, a thin highlight, a dark
   * outline and a deep shadow — split by the emblem: a cut gemstone, the flash
   * *stone*, in a cog-toothed bezel (D&T's gear where Hearthstone has its
   * medallion), cracked through by a bolt of light.
   *
   * It moves a little: with `intro`, the emblem flashes and the words drop into
   * place; a light sweeps the letters every few seconds; the gem breathes.
   * Reduced motion keeps it still.
   *
   * `word` sets another word in the same treatment — VICTORY, DEFEAT — with the
   * emblem as a keystone above it. `art/ui/logo.webp` replaces the main mark
   * when it is drawn.
   */
  /** Height in px at full size; it shrinks to fit a narrower container. */
  export let height = 32;
  export let intro = false;
  export let word: string | null = null;
  /** Gold, or cold steel for a defeat — its gem dark and its flash gone out. */
  export let tone: 'gold' | 'steel' = 'gold';

  const id = `fs-logo-${instances++}`;

  $: drawn = word ? null : uiArtUrl('logo');
  $: calm = $settings.motion === 'reduced';

  /*
   * Geometry, in the SVG's own units. The words sit on one shallow arc; the
   * emblem fills the gap between them, or stands above the single word.
   */
  const SIZE = 150;
  $: layout = word ? keystone(word.length) : { width: 1110, height: 300, chord: 1070, sag: 44, base: 230, emblem: { x: 555, y: 170, r: 112 } };

  /** As wide as the word needs (about 80 units a letter), never narrower than the emblem. */
  function keystone(letters: number) {
    const width = Math.max(300, letters * 80 + 100);
    const chord = width - 40;
    return { width, height: 380, chord, sag: Math.round((34 * chord) / 760), base: 340, emblem: { x: width / 2, y: 112, r: 104 } };
  }

  /** The arc the letters stand on: a circle through both ends and the apex. */
  $: arc = (() => {
    const { width, chord, sag, base } = layout;
    const radius = (chord * chord) / (8 * sag) + sag / 2;
    const x0 = (width - chord) / 2;
    const y0 = base + sag;
    const length = 2 * radius * Math.asin(chord / (2 * radius));
    return { d: `M ${x0} ${y0} A ${radius} ${radius} 0 0 1 ${x0 + chord} ${y0}`, mid: length / 2 };
  })();

  /** Each word's place on the arc, measured out from the middle. */
  $: words = word
    ? [{ text: word, offset: arc.mid, anchor: 'middle' }]
    : [
        { text: 'FLASH', offset: arc.mid - layout.emblem.r - 18, anchor: 'end' },
        { text: 'STONE', offset: arc.mid + layout.emblem.r + 18, anchor: 'start' }
      ];

  /** The letters are drawn four times over: shadow, outline, gilded face, highlight. */
  $: layers = [
    { name: 'shadow', fill: '#000', stroke: '#000', 'stroke-width': 14, filter: `url(#${id}-blur)`, transform: 'translate(0 12)' },
    { name: 'outline', fill: '#241205', stroke: '#241205', 'stroke-width': 13 },
    { name: 'face', fill: `url(#${id}-face)` },
    { name: 'bevel', fill: 'none', stroke: `url(#${id}-bevel)`, 'stroke-width': 2.5 }
  ];

  /** A gear's outline: teeth round a ring. */
  function gear(r: number, root: number, teeth: number): string {
    const step = (Math.PI * 2) / teeth;
    const points: string[] = [];
    for (let i = 0; i < teeth; i++) {
      const a = i * step;
      for (const [t, rr] of [[0, root], [0.18, r], [0.5, r], [0.68, root]] as const) {
        const angle = a + t * step;
        points.push(`${(Math.cos(angle) * rr).toFixed(1)},${(Math.sin(angle) * rr).toFixed(1)}`);
      }
    }
    return points.join(' ');
  }

  /** The cut stone: a table octagon inside a girdle octagon, with a facet between each pair of edges. */
  const ring = (r: number) =>
    Array.from({ length: 8 }, (_, i) => {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      return [Math.cos(a) * r, Math.sin(a) * r] as const;
    });
  const GIRDLE = ring(68);
  const TABLE = ring(36);
  const FACETS = GIRDLE.map((g, i) => {
    const j = (i + 1) % 8;
    return [g, GIRDLE[j], TABLE[j], TABLE[i]].map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  });
  const TABLE_POINTS = TABLE.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  /** Light from the upper left: facets facing it are pale, those facing away deep. */
  const FACET_TONES = ['#1d57b8', '#0f2f78', '#174a9e', '#3f9cf0', '#7fd2ff', '#bff0ff', '#5cb8ff', '#2a74d6'];

  const TEETH = gear(112, 92, 16);
  const BOLT = '18,-74 -14,-6 6,-4 -18,74 22,-10 2,-12 30,-74';
</script>

{#if drawn}
  <img class="drawn" class:intro={intro && !calm} src={drawn} alt="Flashstone" style:height={`${height}px`} />
{:else}
  <svg
    class="logo {tone}"
    class:intro={intro && !calm}
    class:calm
    viewBox={`0 0 ${layout.width} ${layout.height}`}
    style:width={`${(height * layout.width) / layout.height}px`}
    style:--sweep-from={`${-0.25 * layout.width}px`}
    style:--sweep-to={`${1.1 * layout.width}px`}
    role="img"
    aria-label={word ?? 'Flashstone'}
  >
    <defs>
      <path id={`${id}-arc`} d={arc.d} />
      <!-- Gold: bright crown, a hard bevel line at the waist, a warm lower half lit at the rim. -->
      <linearGradient id={`${id}-face`} gradientUnits="userSpaceOnUse" x1="0" x2="0" y1={layout.base - SIZE * 0.72} y2={layout.base + layout.sag}>
        {#if tone === 'gold'}
          <stop offset="0" stop-color="#fffbe6" />
          <stop offset=".42" stop-color="#f7d777" />
          <stop offset=".5" stop-color="#b8741d" />
          <stop offset=".8" stop-color="#d9962e" />
          <stop offset="1" stop-color="#ffe08a" />
        {:else}
          <stop offset="0" stop-color="#f4f8fb" />
          <stop offset=".42" stop-color="#b9c6d0" />
          <stop offset=".5" stop-color="#4c5a66" />
          <stop offset=".8" stop-color="#6f7f8c" />
          <stop offset="1" stop-color="#c9d4dc" />
        {/if}
      </linearGradient>
      <linearGradient id={`${id}-bevel`} gradientUnits="userSpaceOnUse" x1="0" x2="0" y1={layout.base - SIZE * 0.72} y2={layout.base + layout.sag}>
        <stop offset="0" stop-color="#fffef4" stop-opacity=".95" />
        <stop offset=".45" stop-color="#fff3c4" stop-opacity=".35" />
        <stop offset=".55" stop-color="#fff3c4" stop-opacity="0" />
      </linearGradient>
      <linearGradient id={`${id}-sweep`} x1="0" x2="1" y1="0" y2="0">
        <stop offset="0" stop-color="#fff" stop-opacity="0" />
        <stop offset=".5" stop-color="#fff" stop-opacity=".85" />
        <stop offset="1" stop-color="#fff" stop-opacity="0" />
      </linearGradient>
      <linearGradient id={`${id}-bezel`} x1="0" x2="0" y1="0" y2="1">
        <stop offset="0" stop-color="#fff0b8" />
        <stop offset=".45" stop-color="#d9a441" />
        <stop offset=".55" stop-color="#8a5a1a" />
        <stop offset="1" stop-color="#e2b45a" />
      </linearGradient>
      <linearGradient id={`${id}-table`} x1="0" x2="1" y1="0" y2="1">
        <stop offset="0" stop-color="#e8fbff" />
        <stop offset=".5" stop-color="#7cd0ff" />
        <stop offset="1" stop-color="#2a7fe0" />
      </linearGradient>
      <linearGradient id={`${id}-bolt`} x1="0" x2="0" y1="0" y2="1">
        <stop offset="0" stop-color="#ffffff" />
        <stop offset="1" stop-color="#fff0a8" />
      </linearGradient>
      <radialGradient id={`${id}-glow`}>
        <stop offset="0" stop-color="#9fe6ff" stop-opacity=".9" />
        <stop offset=".6" stop-color="#3fa0ff" stop-opacity=".35" />
        <stop offset="1" stop-color="#3fa0ff" stop-opacity="0" />
      </radialGradient>
      <filter id={`${id}-blur`} x="-10%" y="-30%" width="120%" height="160%">
        <feGaussianBlur stdDeviation="9" />
      </filter>
      <filter id={`${id}-shine`} x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="5" result="soft" />
        <feMerge><feMergeNode in="soft" /><feMergeNode in="SourceGraphic" /></feMerge>
      </filter>
      <clipPath id={`${id}-letters`}>
        {#each words as w}
          <text font-size={SIZE}><textPath href={`#${id}-arc`} startOffset={w.offset} text-anchor={w.anchor}>{w.text}</textPath></text>
        {/each}
      </clipPath>
    </defs>

    {#each layers as { name, ...attrs }}
      <g class="layer {name}" {...attrs}>
        {#each words as w, i}
          <text class={`w${i}`} font-size={SIZE}><textPath href={`#${id}-arc`} startOffset={w.offset} text-anchor={w.anchor}>{w.text}</textPath></text>
        {/each}
      </g>
    {/each}

    <!-- The light that crosses the letters now and then. -->
    <g clip-path={`url(#${id}-letters)`}>
      <rect class="sweep" x="0" y="0" width={layout.width * 0.16} height={layout.height} fill={`url(#${id}-sweep)`} />
    </g>

    <g class="emblem" transform={`translate(${layout.emblem.x} ${layout.emblem.y}) scale(${layout.emblem.r / 112})`}>
      <g class="emblem-body">
        <circle class="flash" r="112" fill="#fff" />
        <circle r="122" fill="#000" opacity=".45" filter={`url(#${id}-blur)`} transform="translate(0 10)" />
        <polygon points={TEETH} fill={`url(#${id}-bezel)`} stroke="#241205" stroke-width="6" stroke-linejoin="round" />
        <circle r="84" fill="none" stroke="#241205" stroke-width="5" />
        <circle r="80" fill="#160c04" />
        <circle class="gem-glow" r="80" fill={`url(#${id}-glow)`} />
        <g class="gem">
          {#each FACETS as facet, i}
            <polygon points={facet} fill={FACET_TONES[i]} stroke="#0a1a3a" stroke-width="1.5" stroke-linejoin="round" />
          {/each}
          <polygon points={TABLE_POINTS} fill={`url(#${id}-table)`} stroke="#0a1a3a" stroke-width="1.5" stroke-linejoin="round" />
          <polygon points="-30,-22 -14,-34 -8,-28 -24,-14" fill="#fff" opacity=".7" />
        </g>
        {#if tone === 'gold'}
          <polygon class="bolt" points={BOLT} fill={`url(#${id}-bolt)`} stroke="#fff7d0" stroke-width="2" stroke-linejoin="round" filter={`url(#${id}-shine)`} />
        {/if}
      </g>
    </g>
  </svg>
{/if}

<style>
  /* Sized by its width, so a narrow column shrinks it whole rather than letterboxing it. */
  .logo {
    display: block;
    height: auto;
    max-width: 100%;
    overflow: visible;
    font-family: var(--logo-face);
    /* Germania One comes in one weight; asking for more would fake a bold. */
    font-weight: 400;
  }

  .logo text { letter-spacing: .02em; }

  /* A defeat: the gem goes dark. */
  .steel .gem { filter: grayscale(.85) brightness(.55); }
  .steel .gem-glow { display: none; }

  /* ── Motion ── */
  .gem-glow { animation: fs-logo-breathe 3.6s ease-in-out infinite; }

  @keyframes fs-logo-breathe {
    0%, 100% { opacity: .35; }
    50% { opacity: 1; }
  }

  .sweep {
    transform: translateX(var(--sweep-from));
    animation: fs-logo-sweep 6.5s ease-in-out 1.8s infinite;
  }

  @keyframes fs-logo-sweep {
    0% { transform: translateX(var(--sweep-from)); }
    24%, 100% { transform: translateX(var(--sweep-to)); }
  }

  .flash { opacity: 0; }

  .intro .emblem-body {
    transform-box: fill-box;
    transform-origin: center;
    animation: fs-logo-emblem .7s cubic-bezier(.2, 1.6, .4, 1) both;
  }

  @keyframes fs-logo-emblem {
    0% { transform: scale(.2) rotate(-40deg); opacity: 0; }
    100% { transform: none; opacity: 1; }
  }

  .intro .flash {
    transform-box: fill-box;
    transform-origin: center;
    animation: fs-logo-flash .8s ease-out .35s both;
  }

  @keyframes fs-logo-flash {
    0% { opacity: .95; transform: scale(.6); }
    100% { opacity: 0; transform: scale(2.4); }
  }

  .intro .layer text { animation: fs-logo-settle .75s cubic-bezier(.2, 1.5, .4, 1) both; }
  .intro .layer text.w0 { animation-delay: .3s; }
  .intro .layer text.w1 { animation-delay: .42s; }

  @keyframes fs-logo-settle {
    0% { transform: translateY(-70px); opacity: 0; }
    60% { opacity: 1; }
    100% { transform: none; opacity: 1; }
  }

  .calm .gem-glow, .calm .sweep { animation: none; }
  .calm .gem-glow { opacity: .7; }

  .drawn { display: block; width: auto; max-width: 100%; }
  .drawn.intro { animation: fs-logo-emblem .7s cubic-bezier(.2, 1.6, .4, 1) both; }
</style>
