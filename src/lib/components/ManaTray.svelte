<script lang="ts">
  import { MAX_MANA } from '../engine/state';

  export let mana: number;
  export let maxMana: number;

  $: pips = Array.from({ length: MAX_MANA }, (_, i) => i < mana);
</script>

<div class="tray">
  <div class="pips">
    {#each pips as filled}
      <span class="slot" class:glow={filled}>
        <span class="pip" class:filled></span>
      </span>
    {/each}
  </div>
  <span class="count">{mana}/{maxMana}</span>
</div>

<style>
  .tray {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .pips {
    display: flex;
    align-items: flex-end;
    gap: 3px;
  }

  /* 20% down from the original 12x17. */
  .pip {
    position: relative;
    width: 9.6px;
    height: 13.6px;
    clip-path: polygon(50% 0, 100% 30%, 100% 72%, 50% 100%, 0 72%, 0 30%);
    background: linear-gradient(160deg, #2a2620, #15120d);
    border: 1px solid #33291c;
  }

  /*
   * A filled crystal reads as neon light trapped in glass: a white-hot core,
   * a saturated blue body, a specular highlight across the top facet, and a
   * halo that spills past the silhouette. clip-path would crop an outer glow,
   * so the spill is a drop-shadow on the wrapper instead.
   */
  .pip.filled {
    border: none;
    background:
      radial-gradient(58% 42% at 50% 28%, #ffffff 0%, rgba(190, 240, 255, .95) 22%, transparent 62%),
      radial-gradient(80% 70% at 50% 62%, #63c8ff 0%, #2f7fe0 55%, #1b4fa8 100%);
    box-shadow:
      inset 0 1px 2px rgba(255, 255, 255, .95),
      inset 0 -2px 4px rgba(10, 40, 90, .8);
  }

  .pip.filled::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(150deg, rgba(255, 255, 255, .55) 0 34%, transparent 52%);
    mix-blend-mode: screen;
  }

  /* clip-path crops the gem's own shadows, so the bloom sits on a wrapper. */
  .slot { display: inline-flex; }

  .slot.glow {
    filter: drop-shadow(0 0 3px rgba(120, 210, 255, .95))
      drop-shadow(0 0 7px rgba(70, 160, 255, .7));
  }

  .count {
    font-family: var(--display);
    font-size: 13px;
    letter-spacing: .06em;
    color: #8fc4ff;
  }
</style>
