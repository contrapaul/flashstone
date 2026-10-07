<script lang="ts">
  import type { CardClass } from '../../types/cards';

  /**
   * A class's emblem, as line art in `currentColor`:
   *   Designer — a compass and a pen nib
   *   Engineer — a gear and a wrench
   *   Consumer — a price tag and a coin
   *   Manufacturer — a robot arm
   * It stands in for a hero portrait until one is drawn, and marks the class
   * on its hero power. Neutral gets a cut stone.
   */
  export let heroClass: CardClass = 'Neutral';
</script>

<svg class="emblem" viewBox="0 0 64 64" aria-hidden="true">
  {#if heroClass === 'Designer'}
    <!-- Compass: hinge, two legs, the drawing arc; a nib crossing it. -->
    <circle cx="32" cy="12" r="4" />
    <path d="M30 15 L18 50 M34 15 L46 50" />
    <path class="thin" d="M16 46 Q32 58 48 46" />
    <path class="fill" d="M44 22 L52 30 L40 44 L34 46 L36 40 Z" />
    <path class="cut" d="M40 34 L44 30" />
  {:else if heroClass === 'Engineer'}
    <!-- A gear, and a wrench laid across it. -->
    <path
      class="fill"
      d="M24 10 h8 l1 5 l4 2 l4-3 l6 6 l-3 4 l2 4 l5 1 v8 l-5 1 l-2 4 l3 4 l-6 6 l-4-3 l-4 2 l-1 5 h-8 l-1-5 l-4-2 l-4 3 l-6-6 l3-4 l-2-4 l-5-1 v-8 l5-1 l2-4 l-3-4 l6-6 l4 3 l4-2 Z"
      transform="translate(4 4) scale(.85)"
    />
    <circle class="hole" cx="31" cy="31" r="7" />
    <path d="M40 44 L54 58" />
    <path d="M36 40 a6 6 0 1 1 8 -8 l-3 3 l1 4 l4 1 l3 -3 a6 6 0 0 1 -8 8" />
  {:else if heroClass === 'Consumer'}
    <!-- A price tag on its string, and a coin. -->
    <path class="fill" d="M10 26 L28 8 L48 8 L48 28 L30 46 Z" />
    <circle class="hole" cx="40" cy="16" r="3.5" />
    <path class="thin" d="M40 16 Q50 6 58 10" />
    <circle cx="42" cy="46" r="11" />
    <path class="thin" d="M42 40 V52 M38.5 43 Q42 40 45.5 43 Q42 46 38.5 49 Q42 52 45.5 49" />
  {:else if heroClass === 'Manufacturer'}
    <!-- A robot arm: base, two segments, a claw. -->
    <path class="fill" d="M14 54 h22 v-6 h-22 Z" />
    <circle cx="25" cy="44" r="4" />
    <path d="M25 44 L22 26 L42 16" />
    <circle cx="22" cy="26" r="3.5" />
    <circle cx="42" cy="16" r="3" />
    <path d="M42 16 L52 12 M42 16 L50 24 M52 12 L56 18 M50 24 L56 20" />
  {:else}
    <path class="fill" d="M32 8 L50 22 L42 52 L22 52 L14 22 Z" />
    <path class="thin" d="M14 22 H50 M32 8 L26 22 L32 52 L38 22 Z" />
  {/if}
</svg>

<style>
  .emblem {
    width: 100%;
    height: 100%;
    overflow: visible;
  }

  .emblem path,
  .emblem circle {
    fill: none;
    stroke: currentColor;
    stroke-width: 3.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .emblem .thin { stroke-width: 2.2; }
  .emblem .fill { fill: currentColor; fill-opacity: .22; }
  .emblem .hole { fill: rgba(0, 0, 0, .35); }
  .emblem .cut { stroke-width: 2; }
</style>
