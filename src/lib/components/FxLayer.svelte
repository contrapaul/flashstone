<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { Fx } from '../presentation/fx';

  /**
   * The particle canvas over the table. Bound out as `fx` so playback can throw
   * sparks and shards at whatever it is animating. Never takes a click.
   */
  export let fx: Fx | null = null;

  let canvas: HTMLCanvasElement;

  function fitCanvas() {
    fx?.resize(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1);
  }

  onMount(() => {
    fx = new Fx(canvas);
    fitCanvas();
    window.addEventListener('resize', fitCanvas);
  });

  onDestroy(() => {
    if (typeof window !== 'undefined') window.removeEventListener('resize', fitCanvas);
    fx?.clear();
  });
</script>

<canvas class="fx" bind:this={canvas} aria-hidden="true"></canvas>

<style>
  .fx {
    position: fixed;
    inset: 0;
    width: 100vw;
    height: 100vh;
    /* Over the boards and the showcase, under the floating numbers. */
    z-index: 340;
    pointer-events: none;
  }
</style>
