<script lang="ts">
  import { HERO_POWER_COST } from '../engine/state';
  import { heroPowerFor } from '../data/classes';
  import { uiArtUrl } from '../../utils/art';
  import type { CardClass } from '../../types/cards';

  /**
   * The hero power, beside its hero.
   *
   * Rendered for both sides: yours is usable, the opponent's is a read-only
   * indicator that dims once they have spent it, so you can see it coming.
   */
  export let heroClass: CardClass = 'Neutral';
  export let usable = false;
  export let used = false;
  /** Read-only when it is the opponent's. */
  export let mine = true;

  $: power = heroPowerFor(heroClass);
  $: art = uiArtUrl(`power-${heroClass.toLowerCase()}`);
</script>

{#if power}
  <button
    class="power"
    class:usable
    class:used
    class:foe={!mine}
    disabled={!mine || !usable}
    style:--power-art={art ? `url("${art}")` : 'none'}
    title={`${power.name} — ${power.description} (${HERO_POWER_COST} mana)`}
    on:click
  >
    <span class="glyph" aria-hidden="true">{heroClass[0]}</span>
    <span class="cost">{HERO_POWER_COST}</span>
    <span class="label">{power.name}</span>
  </button>
{/if}

<style>
  .power {
    position: relative;
    width: 62px;
    height: 62px;
    padding: 0;
    border-radius: 50%;
    border: 2px solid var(--frame);
    /* Drawn art replaces the disc when a file exists; without one this is
       exactly the shape it has always been. */
    background: var(--power-art, none) center / cover no-repeat,
      radial-gradient(circle at 38% 30%, #4a3620, #241810 72%);
    box-shadow: 0 8px 16px rgba(0, 0, 0, .55), inset 0 1px 0 rgba(255, 228, 170, .2);
    cursor: default;
    color: var(--text-dim);
    transition: box-shadow .16s ease, transform .12s ease;
  }

  /* The same green language a ready minion and an armed hero use. */
  .power.usable {
    border-color: var(--good);
    color: var(--gold-bright);
    cursor: pointer;
    box-shadow: 0 0 0 2px rgba(126, 214, 140, .55), 0 0 20px rgba(126, 214, 140, .4),
      0 8px 16px rgba(0, 0, 0, .55);
  }
  .power.usable:hover { transform: translateY(-2px); }

  .power.used { opacity: .45; }
  .power.foe { cursor: default; }

  .glyph {
    display: block;
    font-family: var(--display);
    font-size: 22px;
    font-weight: 700;
    line-height: 1;
    color: inherit;
    text-shadow: 0 2px 5px rgba(0, 0, 0, .7);
  }

  .cost {
    position: absolute;
    top: -5px;
    right: -5px;
    width: 22px;
    height: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: linear-gradient(160deg, var(--mana-lit), #1f4d94 65%);
    border: 1px solid rgba(255, 240, 210, .5);
    font-family: var(--display);
    font-size: 12px;
    font-weight: 700;
    color: #fff;
  }

  /* Named, not just an icon — four powers is too many to learn by symbol. */
  .label {
    position: absolute;
    left: 50%;
    bottom: -15px;
    transform: translateX(-50%);
    white-space: nowrap;
    font-family: var(--display);
    font-size: 8px;
    letter-spacing: .1em;
    text-transform: uppercase;
    color: var(--text-faint);
  }
</style>
