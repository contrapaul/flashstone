<script lang="ts">
  import type { MinionInstance } from '../engine/state';
  import { artFor, artUrlFor, sigil } from '../../utils/art';

  export let minion: MinionInstance;
  /** Can swing this turn — green pulse. */
  export let ready = false;
  /** Currently picked as the attacker. */
  export let selected = false;
  /** A legal target for the selected attacker. */
  export let targetable = false;
  /** Playing its summon-in animation. */
  export let summoning = false;
  /** Judders on a heavy hit. */
  export let struck = false;
  /** Dying — plays the shatter, then the parent removes it. */
  export let dying = false;

  // Drawn art when the card has a file, the generated gradient when not — the
  // same two layers as CardPreview, so a card looks like itself on the board.
  $: drawnArt = artUrlFor(minion.card.id);

  $: enraged = minion.health < minion.maxHealth;
  $: taunt = minion.keywords.includes('Taunt');
  $: stealth = minion.keywords.includes('Stealth');
</script>

<button
  class="minion"
  class:ready
  class:selected
  class:targetable
  class:summoning
  class:dying
  class:enraged
  class:taunt
  class:stealth
  class:frozen={minion.frozen}
  class:silenced={minion.silenced}
  class:struck
  style:--art={drawnArt
    ? `url("${drawnArt}") center / cover no-repeat`
    : artFor(minion.card.name)}
  on:click
  on:pointerdown
  on:pointerenter
  on:pointerleave
>
  {#if minion.divineShield}
    <span class="halo" aria-hidden="true"></span>
  {/if}
  {#if taunt}
    <span class="crest" aria-hidden="true"></span>
  {/if}

  <span class="ring">
    <span class="art">
      {#if !drawnArt}<span class="sigil">{sigil(minion.card.name)}</span>{/if}
    </span>
  </span>

  <span class="name">{minion.card.name}</span>

  <span class="chips">
    {#each minion.keywords as keyword}
      <span class="chip {keyword.toLowerCase()}">{keyword}</span>
    {/each}
    {#if minion.frozen}<span class="chip frozen">Frozen</span>{/if}
    {#if minion.silenced}<span class="chip silenced">Silenced</span>{/if}
    {#if enraged}<span class="chip enraged">Enraged</span>{/if}
  </span>

  {#if minion.frozen}<span class="ice" aria-hidden="true"></span>{/if}
  {#if minion.silenced}<span class="wash" aria-hidden="true"></span>{/if}

  <span class="attack" class:buffed={minion.buffed}><span>{minion.attack}</span></span>
  <span class="health" class:buffed={minion.buffed}>{minion.health}</span>
</button>

<style>
  .minion {
    position: relative;
    flex: 0 0 116px;
    width: 116px;
    height: 134px;
    padding: 8px 0 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    border-radius: 11px;
    border: 1px solid var(--frame);
    background: linear-gradient(180deg, #3c2b1b 0%, #241811 62%, #1b120b 100%);
    box-shadow: 0 10px 20px rgba(0, 0, 0, .55), inset 0 1px 0 rgba(255, 224, 170, .22);
    color: var(--text);
    font-family: var(--body);
    cursor: default;
    transition: transform .12s ease, box-shadow .16s ease;
  }

  .minion.taunt {
    border: 2px solid #8d7444;
    box-shadow: 0 10px 22px rgba(0, 0, 0, .6), inset 0 1px 0 rgba(255, 232, 180, .3),
      0 0 0 3px rgba(90, 72, 42, .5);
  }

  .minion.enraged { box-shadow: 0 10px 20px rgba(0, 0, 0, .55), 0 0 16px rgba(214, 84, 60, .45); }

  .minion.stealth {
    opacity: .62;
    outline: 1px dashed rgba(164, 87, 232, .85);
    outline-offset: 3px;
  }

  .minion.silenced { filter: grayscale(.7); }

  .minion.ready { cursor: pointer; animation: fs-ready 1.9s ease-in-out infinite; }

  .minion.selected {
    transform: translateY(-8px);
    border: 2px solid var(--gold-bright);
    box-shadow: 0 16px 30px rgba(0, 0, 0, .6), 0 0 26px rgba(240, 214, 138, .65);
  }

  .minion.targetable {
    cursor: crosshair;
    border: 2px solid var(--blood);
    box-shadow: 0 10px 22px rgba(0, 0, 0, .6), 0 0 22px rgba(226, 96, 74, .6);
  }

  .minion.summoning { animation: fs-summon .62s cubic-bezier(.2, 1.3, .4, 1); }
  .minion.struck { animation: fs-shake .5s ease-out; }
  .minion.dying { animation: fs-shatter .6s ease-in forwards; }

  .halo {
    position: absolute;
    inset: -4px;
    border-radius: 14px;
    border: 2px solid #f6dd93;
    box-shadow: 0 0 14px rgba(246, 221, 147, .75), inset 0 0 12px rgba(246, 221, 147, .4);
    pointer-events: none;
  }

  .crest {
    position: absolute;
    left: 50%;
    top: -11px;
    width: 34px;
    height: 20px;
    transform: translateX(-50%);
    background: linear-gradient(#6d5738, #3b2c1a);
    border-top: 1px solid #a98a4e;
    clip-path: polygon(0 0, 100% 0, 100% 55%, 50% 100%, 0 55%);
    pointer-events: none;
  }

  .ring {
    position: relative;
    width: 86px;
    height: 92px;
    display: flex;
    align-items: center;
    justify-content: center;
    clip-path: polygon(50% 0, 100% 26%, 100% 74%, 50% 100%, 0 74%, 0 26%);
    background: linear-gradient(160deg, var(--frame-lit), #7a5c30 55%, var(--gold));
  }

  .art {
    width: 82px;
    height: 88px;
    display: flex;
    align-items: center;
    justify-content: center;
    clip-path: polygon(50% 0, 100% 26%, 100% 74%, 50% 100%, 0 74%, 0 26%);
    background: var(--art);
  }

  .sigil {
    font-family: var(--display);
    font-size: 34px;
    font-weight: 700;
    line-height: 1;
    color: rgba(255, 246, 224, .34);
    text-shadow: 0 2px 6px rgba(0, 0, 0, .6);
  }

  .name {
    position: relative;
    max-height: 20px;
    padding: 0 6px;
    overflow: hidden;
    font-family: var(--display);
    font-size: 8.5px;
    letter-spacing: .06em;
    line-height: 1.15;
    text-align: center;
    text-transform: uppercase;
    text-wrap: pretty;
    color: #e8d9b6;
  }

  .chips {
    position: relative;
    min-height: 11px;
    padding: 0 4px;
    display: flex;
    flex-wrap: wrap;
    gap: 2px;
    justify-content: center;
  }

  .chip {
    padding: 1px 4px;
    border-radius: 2px;
    border: 1px solid rgba(0, 0, 0, .35);
    font-family: var(--display);
    font-size: 7px;
    letter-spacing: .1em;
    text-transform: uppercase;
    background: rgba(141, 116, 68, .9);
    color: #1a1207;
  }
  .chip.windfury { background: rgba(74, 143, 224, .85); color: #08121e; }
  .chip.charge { background: rgba(126, 214, 140, .85); color: #08150c; }
  .chip.stealth { background: rgba(164, 87, 232, .8); color: #f4e9ff; }
  .chip.divineshield { background: rgba(246, 221, 147, .9); color: #1a1207; }
  .chip.frozen { background: rgba(150, 220, 255, .85); color: #062032; }
  .chip.silenced { background: rgba(120, 110, 98, .9); color: #15110b; }
  .chip.enraged { background: rgba(214, 84, 60, .85); color: #220905; }

  .ice {
    position: absolute;
    inset: 0;
    border-radius: 11px;
    border: 1px solid rgba(170, 230, 255, .75);
    background: linear-gradient(160deg, rgba(150, 220, 255, .34), rgba(70, 140, 220, .24) 55%, rgba(200, 240, 255, .3));
    box-shadow: inset 0 0 18px rgba(180, 235, 255, .5);
    animation: fs-frost 3.2s ease-in-out infinite;
    pointer-events: none;
  }

  .wash {
    position: absolute;
    inset: 0;
    border-radius: 11px;
    background: rgba(20, 18, 16, .5);
    pointer-events: none;
  }

  .attack,
  .health {
    position: absolute;
    bottom: -8px;
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--display);
    font-weight: 700;
    font-size: 15px;
    color: #fff6e6;
    text-shadow: 0 2px 3px rgba(0, 0, 0, .65);
  }

  .attack {
    left: -8px;
    transform: rotate(45deg);
    border-radius: 5px;
    border: 2px solid #f6dd93;
    background: linear-gradient(135deg, var(--attack), #a9741a);
    box-shadow: 0 3px 8px rgba(0, 0, 0, .6), inset 0 1px 4px rgba(255, 232, 170, .6);
  }

  .attack span { transform: rotate(-45deg); }

  .health {
    right: -8px;
    border-radius: 50% 50% 50% 50% / 42% 42% 58% 58%;
    border: 2px solid #f0a08c;
    background: radial-gradient(circle at 35% 28%, var(--blood), var(--blood-deep) 70%);
    box-shadow: 0 3px 8px rgba(0, 0, 0, .6), inset 0 2px 5px rgba(255, 190, 170, .5);
  }

  .enraged .health {
    border-color: #ffb9a4;
    background: radial-gradient(circle at 35% 28%, #ff8a6a, #a01a10 70%);
  }

  .attack.buffed,
  .health.buffed { box-shadow: 0 0 14px rgba(126, 214, 140, .8), 0 3px 8px rgba(0, 0, 0, .6); }
</style>
