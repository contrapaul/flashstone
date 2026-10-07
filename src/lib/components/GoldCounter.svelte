<script lang="ts">
  import { tweened } from 'svelte/motion';
  import { cubicOut } from 'svelte/easing';
  import { settings } from '../settings';
  import { audio } from '../audio';

  /**
   * A gold total with its coin, which counts rather than jumps: a rise ticks up
   * over about a second and the coin glints, so a reward is seen arriving. The
   * first value is shown as it is — only a change counts.
   */
  export let value: number;
  /** Holds a rise back, so coins thrown at the counter can land first. */
  export let delay = 0;
  /** The counter itself, for something to aim at. */
  export let el: HTMLElement | undefined = undefined;

  const shown = tweened(value, { easing: cubicOut });
  let rising = false;

  $: count(value);

  function count(to: number) {
    const from = $shown;
    if (to === from) return;
    const calm = $settings.motion === 'reduced';
    const duration = calm ? 0 : Math.min(1400, 400 + Math.abs(to - from) * 10);
    if (to > from) setTimeout(() => audio().play('gold'), delay);
    if (to > from && !calm) {
      setTimeout(() => (rising = true), delay);
      setTimeout(() => (rising = false), delay + duration);
    }
    void shown.set(to, { duration, delay: calm ? 0 : delay });
  }
</script>

<span class="gold-counter" class:rising bind:this={el} aria-label={`${value} gold`}>
  <svg class="coin" viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="10.5" class="rim" />
    <circle cx="12" cy="12" r="7.5" class="face" />
    <path d="M12 7.5 L14.2 12 L12 16.5 L9.8 12 Z" class="mark" />
  </svg>
  <b>{Math.round($shown)}</b>
</span>

<style>
  .gold-counter {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-variant-numeric: tabular-nums;
  }

  .coin { width: 18px; height: 18px; flex: none; }
  .rim { fill: #b07a22; stroke: #4a2c08; stroke-width: 1.2; }
  .face { fill: #f2c65a; stroke: #8a5a14; stroke-width: 1; }
  .mark { fill: #fff3c4; stroke: #8a5a14; stroke-width: .8; }

  b {
    font-family: var(--display);
    font-weight: 700;
    color: var(--gold-bright);
  }

  .rising .coin { animation: fs-coin-glint .5s ease-in-out infinite; }
  .rising b { color: #fff3c4; text-shadow: 0 0 10px rgba(255, 210, 110, .8); }

  @keyframes fs-coin-glint {
    0%, 100% { transform: none; filter: none; }
    50% { transform: scale(1.18) rotate(-10deg); filter: brightness(1.5); }
  }
</style>
