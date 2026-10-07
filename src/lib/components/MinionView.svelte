<script lang="ts">
  import { backOut, cubicOut } from 'svelte/easing';
  import type { MinionInstance } from '../engine/state';
  import { artFor, artUrlFor, sigil, uiArtUrl } from '../../utils/art';

  /**
   * A minion on the board — a portrait, not a card.
   *
   * Everything it is reads as a **shape**: Taunt is a shield behind it, Divine
   * Shield a bubble round it, Stealth smoke over it, Frozen a block of ice,
   * Windfury wind at its feet, and its text is a badge — recycling arrows for a
   * Deathrattle, a cog for a turn trigger, a violet spark for Spell Damage. Its
   * name and the words for all of these live in the inspector and the
   * Chronicle; on the board there is nothing to read but two numbers.
   *
   * Each shape is drawn in CSS or SVG, and each gives way to drawn art from
   * `static/art/ui/` when a file exists (`static/art/README.md` §3).
   */

  export let minion: MinionInstance;
  /** Can swing this turn — green pulse. */
  export let ready = false;
  /** Currently picked as the attacker. */
  export let selected = false;
  /** A legal target for the selected attacker. */
  export let targetable = false;
  /** Playing its summon-in animation. */
  export let summoning = false;
  /** Just took a hit — the portrait flashes. */
  export let struck = false;
  /** Dying — cracks, then shatters; the parent removes it after. */
  export let dying = false;
  /** Its text is firing — a Battlecry, a Deathrattle, a turn trigger. */
  export let triggered = false;
  /** A 7-cost or bigger arrival: it drops from above and slams down. */
  export let heavy = false;
  /** Its Attack and Health are trading places: the numbers cross over. */
  export let swapping = false;
  /** Picked as an illegal attack target: it shakes its head. */
  export let refused = false;

  // Drawn art when the card has a file, the generated gradient when not — the
  // same two layers as CardPreview, so a card looks like itself on the board.
  $: drawnArt = artUrlFor(minion.card.id);

  const ui = (name: string) => {
    const url = uiArtUrl(name);
    return url ? `url("${url}")` : null;
  };
  const art = {
    frame: ui('minion-frame'),
    frameLegendary: ui('minion-frame-legendary'),
    taunt: ui('taunt'),
    shield: ui('divine-shield'),
    stealth: ui('stealth'),
    frozen: ui('frozen'),
    windfury: ui('windfury'),
    deathrattle: ui('deathrattle'),
    trigger: ui('trigger'),
    spellDamage: ui('spell-damage')
  };

  $: taunt = minion.keywords.includes('Taunt');
  $: stealth = minion.keywords.includes('Stealth');
  $: windfury = minion.keywords.includes('Windfury');
  $: legendary = minion.card.rarity === 'Legendary';

  /** Its text, as badges. Silence strips text, so a silenced minion wears none. */
  $: deathrattle = minion.card.effects.some((e) => e.trigger === 'Deathrattle');
  $: turnTrigger = minion.card.effects.some(
    (e) => e.trigger === 'StartOfTurn' || e.trigger === 'EndOfTurn' || e.trigger === 'OnAttack'
  );
  $: spellDamage = minion.card.spellDamage ?? 0;
  $: hasBadges = deathrattle || turnTrigger || spellDamage > 0;

  /**
   * Hearthstone's colour code on the numbers: green when above what the card
   * says, red when health is below its most. Damage wins.
   */
  $: attackUp = minion.attack > (minion.card.attack ?? 0);
  $: damaged = minion.health < minion.maxHealth;
  $: healthUp = !damaged && minion.health > (minion.card.health ?? 0);

  /**
   * Summoning sickness, shown rather than implied. Hearthstone's "z z z": a
   * minion that cannot swing yet looks asleep, on either side of the board.
   */
  $: asleep =
    minion.summonedThisTurn && !minion.keywords.includes('Charge') && !minion.frozen && minion.attack > 0;

  // ── Changes that get a moment of their own ──────────────────
  // Each watches one value and plays something as it changes, rather than
  // letting the new state simply appear.

  /** Sets a flag for `ms`, so a class can play its animation once. */
  function briefly(set: (on: boolean) => void, ms: number) {
    set(true);
    setTimeout(() => set(false), ms);
  }

  let popping = false;
  let hadShield = minion.divineShield;
  $: {
    if (hadShield && !minion.divineShield) briefly((v) => (popping = v), 460);
    hadShield = minion.divineShield;
  }

  let puffing = false;
  let hadStealth = stealth;
  $: {
    if (hadStealth && !stealth) briefly((v) => (puffing = v), 520);
    hadStealth = stealth;
  }

  let thawing = false;
  let wasFrozen = minion.frozen;
  $: {
    if (wasFrozen && !minion.frozen) briefly((v) => (thawing = v), 620);
    wasFrozen = minion.frozen;
  }

  let hushing = false;
  let wasSilenced = minion.silenced;
  $: {
    if (!wasSilenced && minion.silenced) briefly((v) => (hushing = v), 480);
    wasSilenced = minion.silenced;
  }

  let attackTick = false;
  let lastAttack = minion.attack;
  $: {
    if (minion.attack !== lastAttack) briefly((v) => (attackTick = v), 420);
    lastAttack = minion.attack;
  }

  let healthTick = false;
  let lastHealth = minion.health;
  $: {
    if (minion.health !== lastHealth) briefly((v) => (healthTick = v), 420);
    lastHealth = minion.health;
  }

  // ── Arrivals ────────────────────────────────────────────────
  // Local transitions: they play when a keyword is gained on the board, not
  // when a minion that already has it is summoned.

  /** The Taunt shield drops in behind it and lands. */
  function dropIn(_node: Element) {
    return {
      duration: 380,
      easing: backOut,
      css: (t: number) => `transform: translateY(${(1 - t) * -40}px) scale(${1.15 - 0.15 * t}); opacity: ${Math.min(1, t * 2)}`
    };
  }

  /** A bubble or a block of ice forms around it. */
  function form(_node: Element) {
    return {
      duration: 420,
      easing: cubicOut,
      css: (t: number) => `transform: scale(${1.25 - 0.25 * t}); opacity: ${t}; filter: brightness(${1 + (1 - t) * 1.5})`
    };
  }

  /** Points of a cog's outline, centred on 12,12 — one shape, computed once. */
  const COG = Array.from({ length: 16 }, (_, i) => {
    const a = (i / 16) * Math.PI * 2;
    const r = i % 2 === 0 ? 10.5 : 8;
    return `${(12 + Math.cos(a) * r).toFixed(2)},${(12 + Math.sin(a) * r).toFixed(2)}`;
  }).join(' ');
</script>

<!--
  The unit, not the button, carries the arrivals and departures, so the Taunt
  frame and the wind behind the minion lift, land and shatter with it.
-->
<div
  class="unit"
  class:selected
  class:summoning
  class:heavy
  class:dying
  class:refused
>
  {#if taunt}
    <span class="taunt-frame" class:drawn={art.taunt} style:--ui={art.taunt} in:dropIn aria-hidden="true"
      ><span></span></span
    >
  {/if}

  <button
    class="minion"
    class:ready
    class:selected
    class:targetable
    class:stealth
    class:silenced={minion.silenced}
    class:triggered
    class:struck
    class:legendary
    class:swapping
    aria-label={minion.card.name}
    on:click
    on:pointerdown
    on:pointerenter
    on:pointerleave
  >
    {#if legendary}
      <span class="crest" aria-hidden="true"></span>
      <span class="motes" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
    {/if}

    <span
      class="oval"
      style:--frame-art={legendary ? (art.frameLegendary ?? art.frame) : art.frame}
    >
      <span
        class="art"
        style:--art={drawnArt ? `url("${drawnArt}") center / cover no-repeat` : artFor(minion.card.name)}
      >
        {#if !drawnArt}<span class="sigil">{sigil(minion.card.name)}</span>{/if}
      </span>

      {#if stealth || puffing}
        <span class="smoke" class:puff={puffing && !stealth} style:--ui={art.stealth} aria-hidden="true"></span>
      {/if}

      {#if minion.frozen || thawing}
        <span
          class="ice"
          class:thaw={thawing && !minion.frozen}
          style:--ui={art.frozen}
          in:form
          aria-hidden="true"
        ></span>
      {/if}

      {#if dying}
        <!-- Cracks run out from the centre before it breaks apart. -->
        <svg class="cracks" viewBox="0 0 100 124" aria-hidden="true">
          <path pathLength="1" d="M50 62 L42 40 L46 22 L38 4" />
          <path pathLength="1" d="M50 62 L68 50 L80 54 L98 40" />
          <path pathLength="1" d="M50 62 L58 84 L52 100 L60 122" />
          <path pathLength="1" d="M50 62 L30 70 L18 66 L2 78" />
          <path pathLength="1" d="M50 62 L64 34 L74 24" />
        </svg>
      {/if}
    </span>

    {#if windfury}
      <!-- Two rings of wind swirling round its lower half; one is spent with its first swing. -->
      <span class="wind" class:spent={minion.attacksThisTurn >= 1} style:--ui={art.windfury} aria-hidden="true">
        <i></i><i></i>
      </span>
    {/if}

    {#if minion.divineShield || popping}
      <span
        class="bubble"
        class:pop={popping && !minion.divineShield}
        class:drawn={art.shield}
        style:--ui={art.shield}
        in:form
        aria-hidden="true"
      ></span>
    {/if}

    {#if asleep}
      <span class="zzz" aria-label="Asleep — can attack next turn"><i>z</i><i>z</i><i>z</i></span>
    {/if}

    {#if hasBadges && (!minion.silenced || hushing)}
      <span class="badges" class:hush={hushing} aria-hidden="true">
        {#if deathrattle}
          <span class="badge deathrattle" class:drawn={art.deathrattle} style:--ui={art.deathrattle}>
            {#if !art.deathrattle}
              <!-- Recycling arrows: the end of a life cycle, which is what a Deathrattle is. -->
              <svg viewBox="0 0 24 24">
                <path d="M12 4.5 L16.5 12 M16.5 12 L13.6 11.6 M16.5 12 L17.4 9.2" />
                <path d="M18 15.5 L9 15.5 M9 15.5 L10.8 17.8 M9 15.5 L10.8 13.2" />
                <path d="M7 15 L11.5 6.8 M11.5 6.8 L8.8 7.6 M11.5 6.8 L12.4 9.6" />
              </svg>
            {/if}
          </span>
        {/if}
        {#if turnTrigger}
          <span class="badge cog" class:drawn={art.trigger} style:--ui={art.trigger}>
            {#if !art.trigger}
              <svg viewBox="0 0 24 24"><polygon points={COG} /><circle cx="12" cy="12" r="3.2" /></svg>
            {/if}
          </span>
        {/if}
        {#if spellDamage > 0}
          <span class="badge spell" class:drawn={art.spellDamage} style:--ui={art.spellDamage}>
            <b>+{spellDamage}</b>
          </span>
        {/if}
      </span>
    {/if}

    {#if minion.silenced && hasBadges && !hushing}
      <!-- Where its text was: a single line through, so silence is seen, not told. -->
      <span class="hushed" aria-hidden="true"></span>
    {/if}

    <span class="attack" class:up={attackUp} class:tick={attackTick}><span>{minion.attack}</span></span>
    <!-- Overkill takes health below zero; the gem shows the 0 it shatters at. -->
    <span class="health" class:up={healthUp} class:down={damaged} class:tick={healthTick}
      ><span>{Math.max(0, minion.health)}</span></span
    >
  </button>
</div>

<style>
  .unit {
    position: relative;
    flex: 0 0 116px;
    width: 116px;
    height: 134px;
    transition: transform .12s ease;
  }

  .unit.selected { transform: translateY(-8px); }
  /* `--pace` is the table's playback speed, so these keep time with it. */
  .unit.summoning { animation: fs-summon calc(.62s * var(--pace, 1)) cubic-bezier(.2, 1.3, .4, 1); }
  .unit.summoning.heavy { animation: fs-slam calc(.76s * var(--pace, 1)) cubic-bezier(.5, 0, .2, 1); }
  .unit.dying { animation: fs-break calc(.6s * var(--pace, 1)) ease-in forwards; }
  .unit.refused { animation: fs-no .42s ease-out; }

  /* Dropped from height: it hangs, falls, squashes on impact, and settles. */
  @keyframes fs-slam {
    0% { transform: translateY(-90px) scale(1.35); opacity: 0; filter: brightness(2); }
    35% { transform: translateY(-80px) scale(1.3); opacity: 1; }
    55% { transform: translateY(0) scale(1.08, .88); filter: brightness(1.4); }
    72% { transform: translateY(-6px) scale(.97, 1.04); }
    100% { transform: none; filter: none; }
  }

  /* Cracks first, colour draining; then it comes apart. The canvas throws the shards. */
  @keyframes fs-break {
    0% { transform: none; filter: none; opacity: 1; }
    36% { transform: scale(1.04); filter: grayscale(.8) brightness(1.3); opacity: 1; }
    100% { transform: scale(.82) translateY(10px); filter: grayscale(1) brightness(.6) blur(3px); opacity: 0; }
  }

  /* "No": a quick shake of the head. */
  @keyframes fs-no {
    0%, 100% { transform: none; }
    20% { transform: translateX(-7px) rotate(-2deg); }
    45% { transform: translateX(6px) rotate(2deg); }
    70% { transform: translateX(-3px); }
  }

  /*
   * Taunt: the Hearthstone silhouette — a heavy shield standing behind the
   * minion, wider than it and pointed below, so a Taunt wall reads from across
   * the room without a word on it. Two clipped layers make the rim and the face.
   */
  .taunt-frame {
    position: absolute;
    left: -6px;
    right: -6px;
    top: -9px;
    bottom: -15px;
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

  .taunt-frame.drawn { clip-path: none; background: var(--ui) center / contain no-repeat; }
  .taunt-frame.drawn span { display: none; }

  /* Windfury: two rings of wind swirling round its lower half, over the portrait and under the gems. */
  /*
   * The rings are circles spinning inside a box squashed flat — so they turn
   * like rings lying on the table instead of swinging upright. Centred about
   * 26px above the bottom edge once squashed.
   */
  .wind {
    position: absolute;
    z-index: 1;
    left: 50%;
    bottom: -33px;
    width: 118px;
    height: 118px;
    transform: translateX(-50%) scaleY(.28);
    background: var(--ui, none) center / contain no-repeat;
    pointer-events: none;
  }

  .wind i {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    border: 3px solid transparent;
    border-top-color: rgba(225, 246, 255, .95);
    border-left-color: rgba(160, 215, 255, .7);
    /* A dark edge as well as a glow, so the wind reads on the warm field too. */
    filter: drop-shadow(0 0 1.5px rgba(20, 50, 90, .9)) drop-shadow(0 0 6px rgba(120, 200, 255, .9));
    animation: fs-orbit 1.8s linear infinite;
  }

  .wind i:nth-child(2) { inset: 12px; animation-duration: 1.3s; animation-direction: reverse; }
  .wind.spent i:nth-child(2) { opacity: 0; transition: opacity .4s ease; }

  @keyframes fs-orbit { to { transform: rotate(360deg); } }

  .minion {
    position: relative;
    display: block;
    width: 116px;
    height: 134px;
    padding: 0;
    border: none;
    background: none;
    color: var(--text);
    font-family: var(--body);
    cursor: default;
  }

  /*
   * The portrait: an oval in a gold ring. Every state that used to change the
   * box's border now changes the ring's glow, which follows the oval.
   */
  .oval {
    position: absolute;
    left: 8px;
    top: 2px;
    width: 100px;
    height: 124px;
    border-radius: 50%;
    padding: 4px;
    box-sizing: border-box;
    background:
      var(--frame-art, none) center / 100% 100% no-repeat,
      linear-gradient(160deg, #f3dc9c, #9c7a3c 45%, #e0be76 70%, #6b4f2e);
    box-shadow: 0 10px 18px rgba(0, 0, 0, .55), inset 0 1px 0 rgba(255, 240, 200, .5);
    transition: box-shadow .16s ease;
    overflow: hidden;
  }

  .art {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    border-radius: 50%;
    background: var(--art);
    box-shadow: inset 0 -16px 22px rgba(0, 0, 0, .45), inset 0 0 0 1px rgba(0, 0, 0, .4);
    transition: filter .3s ease;
  }

  .sigil {
    font-family: var(--display);
    font-size: 34px;
    font-weight: 700;
    line-height: 1;
    color: rgba(255, 246, 224, .34);
    text-shadow: 0 2px 6px rgba(0, 0, 0, .6);
  }

  .minion.ready { cursor: pointer; }
  .minion.ready .oval { animation: fs-ready-oval 1.9s ease-in-out infinite; }

  @keyframes fs-ready-oval {
    0%, 100% {
      box-shadow: 0 10px 18px rgba(0, 0, 0, .55), 0 0 0 2px rgba(110, 255, 150, .9), 0 0 14px rgba(90, 255, 130, .75);
    }
    50% {
      box-shadow: 0 10px 18px rgba(0, 0, 0, .55), 0 0 0 3px rgba(170, 255, 190, 1), 0 0 26px rgba(90, 255, 130, .95);
    }
  }

  .minion.selected .oval {
    box-shadow: 0 16px 30px rgba(0, 0, 0, .6), 0 0 0 3px var(--gold-bright), 0 0 26px rgba(240, 214, 138, .8);
  }

  .minion.targetable { cursor: crosshair; }
  .minion.targetable .oval {
    box-shadow: 0 10px 22px rgba(0, 0, 0, .6), 0 0 0 3px #ff5a46, 0 0 24px rgba(255, 90, 70, .8);
  }

  /* A hit: the portrait flashes hot. The knockback is the director's, in JS. */
  .minion.struck .art { animation: fs-hit-flash calc(.42s * var(--pace, 1)) ease-out; }

  @keyframes fs-hit-flash {
    0% { filter: brightness(2.4) saturate(.4) sepia(.6) hue-rotate(-30deg); }
    100% { filter: none; }
  }

  /* Legendary: a second ring, a crest over the top, and lights drifting up. */
  .minion.legendary .oval {
    padding: 6px;
    background:
      var(--frame-art, none) center / 100% 100% no-repeat,
      radial-gradient(circle at 50% 0, #fff3c4, transparent 40%),
      linear-gradient(160deg, #ffe7a0, #c08a2a 40%, #ffd36a 65%, #8a5a18);
    box-shadow: 0 10px 18px rgba(0, 0, 0, .55), 0 0 0 2px rgba(255, 170, 40, .9), 0 0 18px rgba(255, 160, 40, .55);
  }

  .crest {
    position: absolute;
    z-index: 2;
    left: 50%;
    top: -14px;
    width: 52px;
    height: 26px;
    transform: translateX(-50%);
    clip-path: polygon(50% 0, 62% 40%, 100% 26%, 74% 70%, 50% 100%, 26% 70%, 0 26%, 38% 40%);
    background: linear-gradient(180deg, #fff1b8, #e0a531 55%, #8a5a18);
    filter: drop-shadow(0 2px 3px rgba(0, 0, 0, .6));
    pointer-events: none;
  }

  .motes i {
    position: absolute;
    bottom: 20px;
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: #ffe7a0;
    box-shadow: 0 0 6px 2px rgba(255, 200, 90, .8);
    opacity: 0;
    animation: fs-mote 3s ease-in infinite;
    pointer-events: none;
  }
  .motes i:nth-child(1) { left: 22px; }
  .motes i:nth-child(2) { left: 48px; animation-delay: .8s; }
  .motes i:nth-child(3) { left: 70px; animation-delay: 1.6s; }
  .motes i:nth-child(4) { left: 90px; animation-delay: 2.3s; }

  @keyframes fs-mote {
    0% { opacity: 0; transform: translateY(0); }
    20% { opacity: 1; }
    100% { opacity: 0; transform: translateY(-90px); }
  }

  /* Its text firing: a gold flare from inside, over whatever else it wears. */
  .minion.triggered .oval::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: 50%;
    box-shadow: inset 0 0 26px rgba(255, 220, 130, .95);
    animation: fs-flare calc(.52s * var(--pace, 1)) ease-out forwards;
  }

  @keyframes fs-flare {
    0% { opacity: 0; }
    30% { opacity: 1; }
    100% { opacity: 0; }
  }

  /*
   * Stealth: smoke drifting across a darkened portrait. Two layers moving at
   * different speeds read as smoke rather than as a tint.
   */
  .minion.stealth .art { filter: saturate(.35) brightness(.75); }

  .smoke {
    position: absolute;
    inset: 4px;
    border-radius: 50%;
    background:
      var(--ui, none) center / cover no-repeat,
      radial-gradient(40% 30% at 30% 40%, rgba(200, 180, 230, .55), transparent 70%),
      radial-gradient(45% 35% at 70% 65%, rgba(170, 150, 210, .5), transparent 70%),
      radial-gradient(60% 40% at 50% 20%, rgba(120, 100, 160, .45), transparent 70%);
    background-size: 100% 100%, 180% 180%, 200% 200%, 160% 160%;
    animation: fs-smoke 6s ease-in-out infinite alternate;
    pointer-events: none;
  }

  .smoke.puff { animation: fs-puff .52s ease-out forwards; }

  @keyframes fs-smoke {
    0% { background-position: center, 0% 0%, 100% 100%, 50% 0%; }
    100% { background-position: center, 100% 60%, 0% 30%, 20% 100%; }
  }

  @keyframes fs-puff {
    to { transform: scale(1.5); opacity: 0; filter: blur(6px); }
  }

  /*
   * Frozen: a block of ice — facets catching the light, a frosted rim, and a
   * cold tint over the portrait. On a thaw it slips and drips away.
   */
  .ice {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    background:
      var(--ui, none) center / cover no-repeat,
      linear-gradient(115deg, rgba(255, 255, 255, .45) 0 12%, transparent 12% 30%, rgba(255, 255, 255, .25) 30% 34%, transparent 34%),
      linear-gradient(200deg, transparent 0 55%, rgba(200, 240, 255, .35) 55% 62%, transparent 62%),
      linear-gradient(160deg, rgba(150, 220, 255, .55), rgba(70, 150, 230, .4) 55%, rgba(210, 245, 255, .5));
    box-shadow: inset 0 0 0 3px rgba(225, 248, 255, .85), inset 0 0 20px rgba(200, 240, 255, .8);
    animation: fs-frost 3.2s ease-in-out infinite;
    pointer-events: none;
  }

  .ice.thaw { animation: fs-thaw .62s ease-in forwards; }

  @keyframes fs-thaw {
    0% { opacity: 1; transform: none; }
    100% { opacity: 0; transform: translateY(12px) scaleY(1.08); filter: blur(2px); }
  }

  /* Silence: the colour goes out of it. */
  .minion.silenced .art { filter: grayscale(.85) brightness(.85); }

  .cracks {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }

  .cracks path {
    fill: none;
    stroke: #fff4d0;
    stroke-width: 2.2;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-dasharray: 1;
    stroke-dashoffset: 1;
    filter: drop-shadow(0 0 3px rgba(255, 200, 120, .9));
    animation: fs-crack calc(.22s * var(--pace, 1)) ease-out forwards;
  }

  @keyframes fs-crack { to { stroke-dashoffset: 0; } }

  /*
   * Divine Shield: a golden bubble round the whole portrait, with light sliding
   * across it. Drawn over the portrait at low alpha; the stat gems sit above it
   * so the numbers never fog.
   */
  .bubble {
    position: absolute;
    z-index: 2;
    left: 1px;
    top: -6px;
    width: 114px;
    height: 138px;
    border-radius: 50%;
    border: 2px solid rgba(255, 228, 140, .95);
    background: radial-gradient(60% 60% at 50% 42%, transparent 58%, rgba(255, 214, 110, .3) 84%, rgba(255, 236, 170, .6) 100%);
    box-shadow: 0 0 18px rgba(255, 208, 90, .85), 0 0 34px rgba(255, 190, 60, .4),
      inset 0 0 20px rgba(255, 222, 130, .55);
    overflow: hidden;
    pointer-events: none;
  }

  .bubble.drawn { border: none; box-shadow: none; background: var(--ui) center / contain no-repeat; }

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

  /* Its text, as badges along the bottom of the portrait, between the gems. */
  .badges {
    position: absolute;
    z-index: 3;
    left: 50%;
    bottom: 0;
    display: flex;
    gap: 3px;
    transform: translateX(-50%);
  }

  .badge {
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    border: 1.5px solid rgba(255, 230, 170, .9);
    box-shadow: 0 2px 5px rgba(0, 0, 0, .6);
  }

  .badge.drawn { border: none; box-shadow: none; background: var(--ui) center / contain no-repeat; }

  .badge svg { width: 18px; height: 18px; }

  .badge.deathrattle { background: radial-gradient(circle at 40% 35%, #4a6b3a, #1f2e18); }
  .badge.deathrattle svg path { fill: none; stroke: #c9f5a8; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }

  .badge.cog { background: radial-gradient(circle at 40% 35%, #6a5636, #2a2012); }
  .badge.cog polygon { fill: #f0d38a; }
  .badge.cog circle { fill: #2a2012; }

  .badge.spell { background: radial-gradient(circle at 40% 35%, #b98cff, #4b1d8f); border-color: #e8d4ff; }
  .badge.spell b { font-family: var(--display); font-size: 10px; color: #fff; text-shadow: 0 1px 2px #000; }

  /* When its text fires, the badge says which: the cog turns, the arrows flare. */
  .minion.triggered .badge { animation: fs-badge-flare calc(.52s * var(--pace, 1)) ease-out; }
  .minion.triggered .badge.cog svg { animation: fs-orbit calc(.52s * var(--pace, 1)) ease-out; }

  @keyframes fs-badge-flare {
    0% { transform: scale(1); }
    35% { transform: scale(1.45); box-shadow: 0 0 16px rgba(255, 230, 150, 1); }
    100% { transform: scale(1); }
  }

  /* Silence: the badges pop off, and a line is left where they were. */
  .badges.hush .badge { animation: fs-hush .48s ease-in forwards; }

  @keyframes fs-hush {
    40% { transform: scale(1.3); opacity: 1; }
    100% { transform: scale(0) translateY(-10px); opacity: 0; }
  }

  .hushed {
    position: absolute;
    z-index: 3;
    left: 50%;
    bottom: 9px;
    width: 30px;
    height: 3px;
    border-radius: 2px;
    background: rgba(200, 190, 175, .9);
    box-shadow: 0 1px 3px rgba(0, 0, 0, .6);
    transform: translateX(-50%) rotate(-12deg);
  }

  /* The two numbers. */
  .attack,
  .health {
    position: absolute;
    z-index: 3;
    bottom: 0;
    width: 30px;
    height: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--display);
    font-weight: 700;
    font-size: 16px;
    color: #fff6e6;
    text-shadow: 0 0 2px #000, 0 2px 3px rgba(0, 0, 0, .8);
  }

  .attack {
    left: 2px;
    transform: rotate(45deg);
    border-radius: 5px;
    border: 2px solid #f6dd93;
    background: linear-gradient(135deg, var(--attack), #a9741a);
    box-shadow: 0 3px 8px rgba(0, 0, 0, .6), inset 0 1px 4px rgba(255, 232, 170, .6);
  }

  .attack span { transform: rotate(-45deg); }

  .health {
    right: 2px;
    border-radius: 50% 50% 50% 50% / 42% 42% 58% 58%;
    border: 2px solid #f0a08c;
    background: radial-gradient(circle at 35% 28%, var(--blood), var(--blood-deep) 70%);
    box-shadow: 0 3px 8px rgba(0, 0, 0, .6), inset 0 2px 5px rgba(255, 190, 170, .5);
  }

  /* Above what the card says: green. Damaged: red. */
  .attack.up span,
  .health.up span { color: #7dff96; }
  .health.down span { color: #ff6650; text-shadow: 0 0 2px #000, 0 0 3px #000, 0 2px 3px rgba(0, 0, 0, .8); }
  .health.down { background: radial-gradient(circle at 35% 28%, #6a1810, #2a0805 70%); }

  /* A number changing: the gem swells and flashes as it ticks. */
  .attack.tick { animation: fs-tick-diamond .42s ease-out; }
  .health.tick { animation: fs-tick .42s ease-out; }

  @keyframes fs-tick {
    0% { transform: scale(1); }
    30% { transform: scale(1.45); filter: brightness(1.8); }
    100% { transform: scale(1); }
  }

  @keyframes fs-tick-diamond {
    0% { transform: rotate(45deg) scale(1); }
    30% { transform: rotate(45deg) scale(1.45); filter: brightness(1.8); }
    100% { transform: rotate(45deg) scale(1); }
  }

  /* Swapping Attack and Health: the numbers cross over to each other's gems. */
  .minion.swapping .attack span { animation: fs-swap-right calc(.45s * var(--pace, 1)) ease-in-out forwards; }
  .minion.swapping .health span { animation: fs-swap-left calc(.45s * var(--pace, 1)) ease-in-out forwards; }

  /* The attack numeral sits in a 45°-rotated gem, so its path is rotated back. */
  @keyframes fs-swap-right {
    50% { transform: rotate(-45deg) translate(41px, -28px) scale(1.3); }
    100% { transform: rotate(-45deg) translate(82px, 0); }
  }

  @keyframes fs-swap-left {
    50% { transform: translate(-41px, -28px) scale(1.3); }
    100% { transform: translate(-82px, 0); }
  }
</style>
