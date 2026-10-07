<script lang="ts">
  import { onDestroy } from 'svelte';
  import FxLayer from './FxLayer.svelte';
  import type { Fx } from '../presentation/fx';
  import { settings } from '../settings';
  import { sceneUrl } from '../../utils/art';

  /**
   * Behind every page but the table: `art/scene/menu.webp` when it is drawn,
   * and until then a deep layered gradient — warm light from above, dark at
   * the edges. With `dust`, motes drift up through it, as dust does in the
   * light over a workbench.
   */
  export let dust = false;

  const art = sceneUrl('menu');

  let fx: Fx | null = null;
  let timer: ReturnType<typeof setInterval> | undefined;

  $: calm = $settings.motion === 'reduced';
  $: if (dust && !calm && fx) start();
  else stop();

  function start() {
    if (timer) return;
    timer = setInterval(() => {
      // Hidden tabs do not animate, and must not bank motes for later.
      if (!fx || document.hidden || fx.alive > 70) return;
      fx.motes(Math.random() * window.innerWidth, window.innerHeight * (0.25 + Math.random() * 0.8), {
        count: 1,
        speed: 14,
        gravity: -10,
        life: 7,
        size: 2.4,
        colors: ['rgba(255, 228, 170, .5)', 'rgba(255, 200, 130, .35)']
      });
    }, 260);
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = undefined;
  }

  onDestroy(stop);
</script>

<div class="backdrop" style:--art={art ? `url("${art}")` : null} aria-hidden="true">
  <FxLayer bind:fx />
</div>

<style>
  /* Behind the page, in front of the body's ink. */
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: -1;
    /* Stays put while the page over it changes. */
    view-transition-name: backdrop;
    background:
      radial-gradient(70% 55% at 50% 0%, rgba(255, 190, 110, .16), transparent 70%),
      radial-gradient(120% 90% at 50% 120%, rgba(60, 120, 200, .08), transparent 60%),
      radial-gradient(140% 120% at 50% 40%, transparent 45%, rgba(0, 0, 0, .65)),
      repeating-linear-gradient(115deg, rgba(255, 236, 200, .015) 0 2px, transparent 2px 9px),
      linear-gradient(180deg, #23170c, #120c06 60%, #0b0805);
  }

  .backdrop::before {
    content: '';
    position: absolute;
    inset: 0;
    background: var(--art, none) center / cover no-repeat;
    opacity: .9;
  }
</style>
