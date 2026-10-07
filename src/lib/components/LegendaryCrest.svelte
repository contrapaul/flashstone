<script lang="ts" context="module">
  let instances = 0;
</script>

<script lang="ts">
  import { uiArtUrl } from '../../utils/art';

  /**
   * The crest over a Legendary: half a brass gear rising over the frame, with
   * filigree scrolling out to either side and an amber stone at its heart — the
   * Flashstone answer to Hearthstone's dragon. `art/ui/legendary-crest` replaces
   * it when drawn.
   */
  const id = `fs-crest-${instances++}`;
  const drawn = uiArtUrl('legendary-crest');

  /** Teeth round the top half of a gear centred at (60, 30). */
  const TEETH = Array.from({ length: 9 }, (_, i) => {
    const a = Math.PI + (i / 8) * Math.PI;
    const point = (r: number, da: number) => `${(60 + Math.cos(a + da) * r).toFixed(1)},${(30 + Math.sin(a + da) * r).toFixed(1)}`;
    return `${point(17, -0.13)} ${point(23, -0.08)} ${point(23, 0.08)} ${point(17, 0.13)}`;
  }).join(' ');
</script>

{#if drawn}
  <img class="crest-art" src={drawn} alt="" aria-hidden="true" />
{:else}
  <svg class="crest" viewBox="0 0 120 44" aria-hidden="true">
    <defs>
      <linearGradient id={`${id}-brass`} x1="0" x2="0" y1="0" y2="1">
        <stop offset="0" stop-color="#fff1b8" />
        <stop offset=".5" stop-color="#e0a531" />
        <stop offset="1" stop-color="#7a4c12" />
      </linearGradient>
      <radialGradient id={`${id}-stone`} cx=".38" cy=".32">
        <stop offset="0" stop-color="#fff3c4" />
        <stop offset=".45" stop-color="#ffb02e" />
        <stop offset="1" stop-color="#a14d06" />
      </radialGradient>
    </defs>
    <!-- Filigree: a scroll curling out from the gear on each side. -->
    <g class="scroll" stroke={`url(#${id}-brass)`}>
      <path d="M44 31 C 34 33, 26 25, 16 28 C 8 30, 8 39, 15 38 C 21 37, 20 30, 14 32" />
      <path d="M76 31 C 86 33, 94 25, 104 28 C 112 30, 112 39, 105 38 C 99 37, 100 30, 106 32" />
      <path d="M46 36 C 38 40, 30 38, 24 41" />
      <path d="M74 36 C 82 40, 90 38, 96 41" />
    </g>
    <polygon points={`37,31 ${TEETH} 83,31 83,36 37,36`} fill={`url(#${id}-brass)`} stroke="#3a2208" stroke-width="1.6" stroke-linejoin="round" />
    <circle cx="60" cy="31" r="9" fill={`url(#${id}-stone)`} stroke="#3a2208" stroke-width="1.6" />
    <circle cx="57" cy="28" r="2.4" fill="#fff" opacity=".75" />
  </svg>
{/if}

<style>
  .crest, .crest-art {
    display: block;
    width: 100%;
    height: 100%;
    overflow: visible;
    filter: drop-shadow(0 2px 3px rgba(0, 0, 0, .65));
  }
  .crest-art { object-fit: contain; }

  .scroll path { fill: none; stroke-width: 3.2; stroke-linecap: round; }
</style>
