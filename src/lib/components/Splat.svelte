<script lang="ts">
  import { uiArtUrl } from '../../utils/art';

  /**
   * A number pinned to whatever it happened to: a red starburst for damage, a
   * green seal for healing, a steel plate for armor. Replaces the floating
   * "-3", which drifted off the thing it described.
   *
   * Drawn art replaces each shape when `ui/splat-<kind>` exists.
   */
  export let kind: 'damage' | 'heal' | 'armor';
  export let amount: number;
  /** Viewport coordinates of the thing it landed on. */
  export let x = 0;
  export let y = 0;
  /** 0–1. A big hit gets a big splat. */
  export let intensity = 0.5;

  $: drawn = uiArtUrl(`splat-${kind}`);
  $: size = 46 + 34 * intensity;

  /** A sixteen-point starburst, ragged so it reads as an impact rather than a badge. */
  const BURST = Array.from({ length: 16 }, (_, i) => {
    const a = (i / 16) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 === 0 ? 50 : i % 4 === 1 ? 34 : 30;
    return `${(50 + Math.cos(a) * r).toFixed(1)},${(50 + Math.sin(a) * r).toFixed(1)}`;
  }).join(' ');
</script>

<div
  class="splat {kind}"
  style:left={`${x}px`}
  style:top={`${y}px`}
  style:--size={`${size}px`}
  aria-hidden="true"
>
  {#if drawn}
    <img src={drawn} alt="" />
  {:else if kind === 'damage'}
    <svg viewBox="0 0 100 100"><polygon points={BURST} /></svg>
  {:else if kind === 'heal'}
    <svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="44" /><path d="M50 26 V74 M26 50 H74" /></svg>
  {:else}
    <svg viewBox="0 0 100 100"><path d="M50 6 L90 20 V52 C90 74 72 88 50 96 C28 88 10 74 10 52 V20 Z" /></svg>
  {/if}
  <b>{kind === 'damage' ? `-${amount}` : `+${amount}`}</b>
</div>

<style>
  .splat {
    position: fixed;
    z-index: 360;
    width: var(--size);
    height: var(--size);
    display: grid;
    place-items: center;
    transform: translate(-50%, -50%);
    pointer-events: none;
    animation: fs-splat .95s ease-out forwards;
  }

  .splat svg,
  .splat img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    filter: drop-shadow(0 3px 6px rgba(0, 0, 0, .6));
  }

  .damage polygon { fill: #c4261a; stroke: #ffd7c8; stroke-width: 3; stroke-linejoin: round; }
  .heal circle { fill: #1f8a3a; stroke: #d6ffd8; stroke-width: 4; }
  .heal path { stroke: rgba(214, 255, 216, .35); stroke-width: 12; stroke-linecap: round; }
  .armor path { fill: #6f8394; stroke: #e6eef4; stroke-width: 4; stroke-linejoin: round; }

  b {
    position: relative;
    font-family: var(--display);
    font-weight: 700;
    font-size: calc(var(--size) * .42);
    line-height: 1;
    color: #fff;
    text-shadow: 0 0 3px #000, 0 2px 4px rgba(0, 0, 0, .8);
  }

  /* Slams on, holds while it is read, then lifts away. */
  @keyframes fs-splat {
    0% { transform: translate(-50%, -50%) scale(.2) rotate(-12deg); opacity: 0; }
    14% { transform: translate(-50%, -50%) scale(1.18) rotate(4deg); opacity: 1; }
    24% { transform: translate(-50%, -50%) scale(1) rotate(0); }
    75% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
    100% { transform: translate(-50%, -62%) scale(.9); opacity: 0; }
  }
</style>
