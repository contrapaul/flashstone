<script lang="ts">
  import { HERO_POWER_COST } from '../engine/state';
  import { heroPowerFor } from '../data/classes';
  import { uiArtUrl } from '../../utils/art';
  import type { CardClass } from '../../types/cards';

  /**
   * The hero power, beside its hero.
   *
   * Rendered for both sides: yours is usable, the opponent's is a read-only
   * indicator. Spending it **turns the disc over**, Hearthstone's tell, so a
   * used power reads as used from across the table without dimming to grey.
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
    <span class="disc">
      <span class="face front">
        <span class="glyph" aria-hidden="true">{heroClass[0]}</span>
        <span class="cost">{HERO_POWER_COST}</span>
      </span>
      <span class="face spent" aria-hidden="true"></span>
    </span>
    <span class="label">{power.name}</span>
  </button>
{/if}

<style>
  .power {
    position: relative;
    width: 62px;
    height: 62px;
    padding: 0;
    border: none;
    border-radius: 50%;
    background: none;
    cursor: default;
    color: var(--text-dim);
    perspective: 400px;
    transition: transform .12s ease;
  }

  /* The disc that turns over: front is the power, back is the spent side. */
  .disc {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    transform-style: preserve-3d;
    transition: transform .5s cubic-bezier(.3, 1.4, .5, 1);
  }

  .power.used .disc { transform: rotateY(180deg); }

  .face {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    border-radius: 50%;
    border: 2px solid var(--frame);
    backface-visibility: hidden;
    box-shadow: 0 8px 16px rgba(0, 0, 0, .55), inset 0 1px 0 rgba(255, 228, 170, .2);
  }

  /* Drawn art replaces the disc when a file exists; without one this is
     exactly the shape it has always been. */
  .front {
    background: var(--power-art, none) center / cover no-repeat,
      radial-gradient(circle at 38% 30%, #4a3620, #241810 72%);
    transition: box-shadow .16s ease;
  }

  .spent {
    transform: rotateY(180deg);
    background:
      repeating-conic-gradient(from 0deg, rgba(255, 255, 255, .04) 0 10deg, transparent 10deg 20deg),
      radial-gradient(circle at 38% 30%, #2e241a, #120c07 72%);
    border-color: #3d2e1c;
  }

  /* The same green language a ready minion and an armed hero use. */
  .power.usable {
    color: var(--gold-bright);
    cursor: pointer;
  }
  .power.usable .front {
    border-color: var(--good);
    box-shadow: 0 0 0 2px rgba(126, 214, 140, .55), 0 0 20px rgba(126, 214, 140, .4),
      0 8px 16px rgba(0, 0, 0, .55);
  }
  .power.usable:hover { transform: translateY(-2px); }

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
    /* Sits directly on the play field, so it follows the field's ink rather
       than the dark-UI faint grey. Falls back for the collection and review
       screens, where there is no field. */
    color: var(--field-ink, var(--text-faint));
  }
</style>
