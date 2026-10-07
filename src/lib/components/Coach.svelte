<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  /**
   * A coach mark: a gold chevron bobbing over the thing to touch, and a few
   * words beside it — "Drag to play". The pattern is Tome of Secrets'
   * `ui/kit/coach.ts`: one step at a time, each ending when the player does
   * what it asks, never blocking the game, always skippable.
   */
  export let target: { x: number; y: number } | null = null;
  export let label = '';

  const dispatch = createEventDispatcher<{ skip: void }>();
</script>

{#if target}
  <div class="coach" style:--x={`${target.x}px`} style:--y={`${target.y}px`} aria-live="polite">
    <span class="chevron" aria-hidden="true"></span>
    <span class="label">
      {label}
      <button class="skip" on:click={() => dispatch('skip')}>skip</button>
    </span>
  </div>
{/if}

<style>
  .coach {
    position: fixed;
    left: var(--x);
    top: var(--y);
    z-index: 360;
    pointer-events: none;
  }

  .chevron {
    position: absolute;
    left: -16px;
    top: -34px;
    width: 32px;
    height: 26px;
    clip-path: polygon(0 0, 100% 0, 50% 100%);
    background: linear-gradient(180deg, #fff3c4, #ffc94a);
    filter: drop-shadow(0 0 8px rgba(255, 200, 80, .9));
    animation: fs-coach-bob 1s ease-in-out infinite;
  }

  @keyframes fs-coach-bob {
    0%, 100% { transform: translateY(-10px); }
    50% { transform: translateY(0); }
  }

  .label {
    position: absolute;
    left: 0;
    top: -70px;
    transform: translateX(-50%);
    display: flex;
    align-items: baseline;
    gap: 10px;
    padding: 7px 14px;
    border: 1.5px solid #ffd36a;
    border-radius: 16px;
    background: rgba(20, 13, 7, .9);
    box-shadow: 0 0 16px rgba(255, 200, 80, .4);
    font-family: var(--display);
    font-size: 14px;
    font-weight: 700;
    color: #fff3c4;
    white-space: nowrap;
    pointer-events: auto;
  }

  .skip {
    padding: 0;
    border: none;
    background: none;
    font-family: var(--body);
    font-size: 12px;
    font-style: italic;
    color: #a58d5f;
    cursor: pointer;
  }
  .skip:hover { color: #e6d9bd; }

  @media (prefers-reduced-motion: reduce) {
    .chevron { animation: none; }
  }
</style>
