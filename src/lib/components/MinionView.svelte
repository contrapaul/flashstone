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
  /** Its text is firing — a Battlecry, a Deathrattle, a turn trigger. */
  export let triggered = false;
  /** A 7-cost or bigger arrival: it drops from above and slams down. */
  export let heavy = false;

  // Drawn art when the card has a file, the generated gradient when not — the
  // same two layers as CardPreview, so a card looks like itself on the board.
  $: drawnArt = artUrlFor(minion.card.id);

  $: enraged = minion.health < minion.maxHealth;
  $: taunt = minion.keywords.includes('Taunt');
  $: stealth = minion.keywords.includes('Stealth');

  /**
   * Summoning sickness, shown rather than implied. Hearthstone's "z z z": a
   * minion that cannot swing yet looks asleep, on either side of the board.
   */
  $: asleep =
    minion.summonedThisTurn && !minion.keywords.includes('Charge') && !minion.frozen && minion.attack > 0;

  /** Taunt and Divine Shield are drawn as shapes, so they no longer need a label. */
  const SHOWN_AS_SHAPE = new Set(['Taunt', 'DivineShield']);
  $: chips = minion.keywords.filter((k) => !SHOWN_AS_SHAPE.has(k));

  // The bubble bursts when the shield goes, rather than simply vanishing.
  let hadShield = minion.divineShield;
  let popping = false;
  $: {
    if (hadShield && !minion.divineShield) {
      popping = true;
      setTimeout(() => (popping = false), 460);
    }
    hadShield = minion.divineShield;
  }
</script>

<!--
  The unit, not the button, carries the animations, so the Taunt frame behind
  the minion shakes, lifts and shatters with it.
-->
<div
  class="unit"
  class:selected
  class:summoning
  class:heavy
  class:dying
  class:struck
>
  {#if taunt}
    <span class="taunt-frame" aria-hidden="true"><span></span></span>
  {/if}

  <button
    class="minion"
    class:ready
    class:selected
    class:targetable
    class:enraged
    class:taunt
    class:stealth
    class:frozen={minion.frozen}
    class:silenced={minion.silenced}
    class:triggered
    style:--art={drawnArt
      ? `url("${drawnArt}") center / cover no-repeat`
      : artFor(minion.card.name)}
    on:click
    on:pointerdown
    on:pointerenter
    on:pointerleave
  >
    <span class="ring">
      <span class="art">
        {#if !drawnArt}<span class="sigil">{sigil(minion.card.name)}</span>{/if}
      </span>
    </span>

    <span class="name">{minion.card.name}</span>

    <span class="chips">
      {#each chips as keyword}
        <span class="chip {keyword.toLowerCase()}">{keyword}</span>
      {/each}
      {#if minion.frozen}<span class="chip frozen">Frozen</span>{/if}
      {#if minion.silenced}<span class="chip silenced">Silenced</span>{/if}
    </span>

    {#if minion.frozen}<span class="ice" aria-hidden="true"></span>{/if}
    {#if minion.silenced}<span class="wash" aria-hidden="true"></span>{/if}

    {#if minion.divineShield || popping}
      <span class="bubble" class:pop={popping && !minion.divineShield} aria-hidden="true"></span>
    {/if}

    {#if asleep}
      <span class="zzz" aria-label="Asleep — can attack next turn"><i>z</i><i>z</i><i>z</i></span>
    {/if}

    <span class="attack" class:buffed={minion.buffed}><span>{minion.attack}</span></span>
    <!-- Overkill takes health below zero; the gem shows the 0 it shatters at. -->
    <span class="health" class:buffed={minion.buffed}>{Math.max(0, minion.health)}</span>
  </button>
</div>

<style>
  .unit {
    position: relative;
    flex: 0 0 116px;
    width: 116px;
    transition: transform .12s ease;
  }

  .unit.selected { transform: translateY(-8px); }
  /* `--pace` is the table's playback speed, so these keep time with it. */
  .unit.summoning { animation: fs-summon calc(.62s * var(--pace, 1)) cubic-bezier(.2, 1.3, .4, 1); }
  .unit.summoning.heavy { animation: fs-slam calc(.76s * var(--pace, 1)) cubic-bezier(.5, 0, .2, 1); }
  .unit.struck { animation: fs-shake calc(.5s * var(--pace, 1)) ease-out; }

  /* Dropped from height: it hangs, falls, squashes on impact, and settles. */
  @keyframes fs-slam {
    0% { transform: translateY(-90px) scale(1.35); opacity: 0; filter: brightness(2); }
    35% { transform: translateY(-80px) scale(1.3); opacity: 1; }
    55% { transform: translateY(0) scale(1.08, .88); filter: brightness(1.4); }
    72% { transform: translateY(-6px) scale(.97, 1.04); }
    100% { transform: none; filter: none; }
  }
  .unit.dying { animation: fs-shatter calc(.6s * var(--pace, 1)) ease-in forwards; }

  /*
   * Taunt: the Hearthstone silhouette — a heavy shield standing behind the
   * minion, wider than it and pointed below, so a Taunt wall reads from across
   * the room without a word on it. Two clipped layers make the rim and the face.
   */
  .taunt-frame {
    position: absolute;
    left: -12px;
    right: -12px;
    top: -11px;
    bottom: -17px;
    clip-path: polygon(10% 0, 90% 0, 100% 9%, 100% 60%, 50% 100%, 0 60%, 0 9%);
    background: linear-gradient(180deg, #f1dca6, #9c7f4c 45%, #5b4527);
    pointer-events: none;
  }

  .taunt-frame span {
    position: absolute;
    inset: 4px;
    clip-path: inherit;
    background:
      linear-gradient(160deg, rgba(255, 255, 255, .22), transparent 40%),
      linear-gradient(180deg, #7d7a74, #4f4c47 50%, #2f2c28);
  }

  .minion {
    position: relative;
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
    border: 2px solid var(--gold-bright);
    box-shadow: 0 16px 30px rgba(0, 0, 0, .6), 0 0 26px rgba(240, 214, 138, .65);
  }

  /* Its text firing: a gold flare from inside, over whatever else it wears. */
  .minion.triggered::after {
    content: '';
    position: absolute;
    inset: -3px;
    z-index: 4;
    border-radius: 13px;
    pointer-events: none;
    box-shadow: 0 0 0 2px rgba(255, 226, 140, .95), 0 0 26px rgba(255, 206, 90, .9),
      inset 0 0 24px rgba(255, 220, 130, .7);
    animation: fs-flare calc(.52s * var(--pace, 1)) ease-out forwards;
  }

  @keyframes fs-flare {
    0% { opacity: 0; transform: scale(.94); }
    30% { opacity: 1; transform: scale(1.04); }
    100% { opacity: 0; transform: scale(1.08); }
  }

  .minion.targetable {
    cursor: crosshair;
    border: 2px solid var(--blood);
    box-shadow: 0 10px 22px rgba(0, 0, 0, .6), 0 0 22px rgba(226, 96, 74, .6);
  }

  /*
   * Divine Shield: a golden bubble around the whole minion, with light sliding
   * across it. Drawn over the portrait at low alpha; the stat gems sit above it
   * so the numbers never fog.
   */
  .bubble {
    position: absolute;
    z-index: 2;
    inset: -9px -8px -7px;
    border-radius: 30px;
    border: 2px solid rgba(255, 228, 140, .95);
    background: radial-gradient(70% 60% at 50% 40%, transparent 55%, rgba(255, 214, 110, .28) 82%, rgba(255, 236, 170, .55) 100%);
    box-shadow: 0 0 18px rgba(255, 208, 90, .85), 0 0 34px rgba(255, 190, 60, .4),
      inset 0 0 20px rgba(255, 222, 130, .55);
    overflow: hidden;
    pointer-events: none;
  }

  .bubble::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(115deg, transparent 35%, rgba(255, 255, 240, .55) 48%, transparent 60%);
    background-size: 260% 100%;
    animation: fs-sheen 2.8s ease-in-out infinite;
  }

  /* The burst when it breaks. */
  .bubble.pop { animation: fs-bubble-pop .46s ease-out forwards; }

  @keyframes fs-sheen {
    0%, 100% { background-position: 130% 0; }
    50% { background-position: -30% 0; }
  }

  @keyframes fs-bubble-pop {
    0% { transform: scale(1); opacity: 1; filter: brightness(1.6); }
    35% { transform: scale(1.14); opacity: .9; filter: brightness(2.4); }
    100% { transform: scale(1.32); opacity: 0; filter: brightness(1); }
  }

  /* Asleep: three letters drifting up and off the portrait's shoulder. */
  .zzz {
    position: absolute;
    z-index: 3;
    top: 4px;
    right: 6px;
    width: 30px;
    height: 34px;
    pointer-events: none;
  }

  .zzz i {
    position: absolute;
    font-family: var(--display);
    font-style: normal;
    font-weight: 700;
    color: #f4ecd8;
    text-shadow: 0 0 6px rgba(140, 190, 255, .9), 0 2px 3px rgba(0, 0, 0, .7);
    opacity: 0;
    animation: fs-zzz 2.4s ease-in-out infinite;
  }
  .zzz i:nth-child(1) { left: 0; bottom: 0; font-size: 11px; }
  .zzz i:nth-child(2) { left: 8px; bottom: 9px; font-size: 14px; animation-delay: .8s; }
  .zzz i:nth-child(3) { left: 17px; bottom: 19px; font-size: 17px; animation-delay: 1.6s; }

  @keyframes fs-zzz {
    0% { opacity: 0; transform: translate(0, 4px) scale(.7); }
    25% { opacity: 1; }
    100% { opacity: 0; transform: translate(6px, -10px) scale(1.1); }
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
    z-index: 3;
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
