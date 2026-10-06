<script lang="ts">
  import { MAX_MANA } from '../engine/state';

  export let mana: number;
  export let maxMana: number;
  /**
   * Yours is large and sits beside End Turn, where your eyes are when you
   * decide whether a turn is over. The opponent's mirrors it at the top, smaller.
   */
  export let side: 'you' | 'foe' = 'you';

  /**
   * Three states, not two: a crystal you can spend, one you have but have spent,
   * and a socket you have not grown into yet. The old tray drew the last two the
   * same, so "7 of 10" and "spent 5 of 7" looked alike.
   */
  $: slots = Array.from({ length: MAX_MANA }, (_, i) =>
    i < mana ? 'full' : i < maxMana ? 'spent' : 'locked'
  );
</script>

<div class="tray {side}" aria-label={`${mana} of ${maxMana} mana`}>
  {#if side === 'foe'}<span class="count">{mana}<small>/{maxMana}</small></span>{/if}
  <div class="crystals">
    {#each slots as state, i}
      <span class="slot {state}" style:--i={i}>
        <span class="glass"></span>
        <span class="charge"></span>
      </span>
    {/each}
  </div>
  {#if side === 'you'}<span class="count">{mana}<small>/{maxMana}</small></span>{/if}
</div>

<style>
  /*
   * A dark plate of its own. Saturated light needs dark ground, and the field
   * under this is warm mid-tone — on it, the blue read as muddy rather than lit.
   */
  .tray {
    --w: 22px;
    --h: 30px;
    display: inline-flex;
    align-items: center;
    gap: 10px;
    padding: 7px 12px 7px 10px;
    border-radius: 22px;
    border: 1px solid rgba(120, 180, 255, .28);
    background: linear-gradient(180deg, rgba(14, 22, 38, .92), rgba(6, 10, 20, .94));
    box-shadow: 0 10px 22px rgba(0, 0, 0, .45), inset 0 1px 0 rgba(170, 215, 255, .18);
  }

  .tray.foe {
    --w: 15px;
    --h: 20px;
    gap: 7px;
    padding: 5px 9px;
    border-radius: 16px;
  }

  .crystals { display: flex; align-items: center; gap: 4px; }
  .foe .crystals { gap: 3px; }

  .slot {
    position: relative;
    width: var(--w);
    height: var(--h);
  }

  .glass,
  .charge {
    position: absolute;
    inset: 0;
    clip-path: polygon(50% 0, 100% 28%, 100% 72%, 50% 100%, 0 72%, 0 28%);
  }

  /* An empty socket: dark glass with a cold rim. */
  .glass {
    background:
      linear-gradient(160deg, rgba(120, 170, 230, .35), transparent 45%),
      linear-gradient(180deg, #13243d, #08111f);
  }
  .slot.locked .glass { opacity: .38; }

  /*
   * A full crystal: a white-hot core in a saturated blue body with a highlight
   * across the top facet. clip-path would crop an outer glow, so the bloom is
   * a drop-shadow on the slot.
   */
  .charge {
    opacity: 0;
    transform: scale(.6);
    background:
      radial-gradient(55% 40% at 50% 30%, #ffffff 0%, rgba(205, 240, 255, .95) 24%, transparent 64%),
      linear-gradient(150deg, rgba(255, 255, 255, .6) 0 30%, transparent 48%),
      radial-gradient(85% 75% at 50% 62%, #4fc3ff 0%, #1677ff 55%, #0a3fc0 100%);
    /* Emptying is instant: spending should feel like a cost, not a fade. */
    transition: opacity .12s ease, transform .12s ease;
  }

  /* Filling staggers left to right — the delay lives on the destination state,
     so only refilling waits; spending does not. */
  .slot.full .charge {
    opacity: 1;
    transform: none;
    transition: opacity .22s ease calc(var(--i) * 55ms),
      transform .32s cubic-bezier(.2, 1.6, .4, 1) calc(var(--i) * 55ms);
  }

  .slot.full {
    filter: drop-shadow(0 0 3px rgba(110, 200, 255, .95)) drop-shadow(0 0 9px rgba(30, 130, 255, .75));
  }

  .count {
    min-width: 44px;
    font-family: var(--display);
    font-size: 22px;
    font-weight: 700;
    line-height: 1;
    color: #eaf6ff;
    text-shadow: 0 0 10px rgba(60, 160, 255, .9), 0 2px 3px rgba(0, 0, 0, .7);
    font-variant-numeric: tabular-nums;
  }

  .count small { font-size: 15px; color: #8fc4ff; }

  .foe .count { min-width: 0; font-size: 15px; }
  .foe .count small { font-size: 11px; }
</style>
