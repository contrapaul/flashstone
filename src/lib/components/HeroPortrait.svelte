<script lang="ts">
  import { cubicOut } from 'svelte/easing';
  import { HERO_HEALTH } from '../engine/state';
  import { hashText } from '../../utils/hash';
  import { uiArtUrl } from '../../utils/art';

  export let label: string;
  export let health: number;
  /** Armor: a steel plate beside the health gem, hidden at zero. */
  export let armor = 0;
  /** 'you' | 'foe' — the portrait's tint, and which side the weapon hangs on. */
  export let side: 'you' | 'foe' = 'you';
  export let glyph = side === 'you' ? 'Ψ' : 'Ω';
  /** Legal attack target — red ring and crosshair. */
  export let targetable = false;
  /** Just took damage — it flashes and shakes. */
  export let hit = false;
  /** The equipped weapon, if any. */
  export let weapon: { name: string; attack: number; durability: number } | null = null;
  /** This hero can swing its weapon right now — green pulse, like a ready minion. */
  export let armed = false;
  /** Brought to 0: the portrait breaks apart. */
  export let destroyed = false;
  /** Picked as an illegal attack target: it shakes its head. */
  export let refused = false;

  /**
   * Wear on the portrait as health falls: hairline cracks at 10, deep ones at
   * 5. The state of the match, readable without reading the number.
   */
  $: wear = health <= 5 ? 2 : health <= 10 ? 1 : 0;

  // ── Numbers ticking, and the weapon breaking ──────────────
  function briefly(set: (on: boolean) => void, ms: number) {
    set(true);
    setTimeout(() => set(false), ms);
  }

  let hpTick = false;
  let lastHealth = health;
  $: {
    if (health !== lastHealth) briefly((v) => (hpTick = v), 420);
    lastHealth = health;
  }

  let armorTick = false;
  let lastArmor = armor;
  $: {
    if (armor !== lastArmor) briefly((v) => (armorTick = v), 420);
    lastArmor = armor;
  }

  let wearTick = false;
  let lastDurability = weapon?.durability ?? 0;
  $: {
    const now = weapon?.durability ?? 0;
    if (weapon && now !== lastDurability) briefly((v) => (wearTick = v), 420);
    lastDurability = now;
  }

  /** The last weapon held, kept on screen long enough to watch it break. */
  let held = weapon;
  let breaking = false;
  $: {
    if (held && !weapon) {
      breaking = true;
      setTimeout(() => {
        breaking = false;
        held = weapon;
      }, 520);
    } else if (weapon) {
      held = weapon;
    }
  }
  $: shownWeapon = weapon ?? (breaking ? held : null);

  /**
   * A weapon is a **tool**: hammer, calipers or soldering iron, picked by its
   * name so one weapon always looks the same. Drawn art replaces it when
   * `ui/weapon-<id>` exists for the tool.
   */
  const TOOLS = ['hammer', 'calipers', 'iron'] as const;
  $: tool = shownWeapon ? TOOLS[hashText(shownWeapon.name) % TOOLS.length] : 'hammer';
  $: toolArt = uiArtUrl(`weapon-${tool}`);

  function arrive(_node: Element) {
    return {
      duration: 420,
      easing: cubicOut,
      css: (t: number) => `transform: scale(${1.6 - 0.6 * t}) rotate(${(1 - t) * -40}deg); opacity: ${t}`
    };
  }
</script>

<div class="hero {side}" class:hit class:armed class:destroyed class:refused>
  <!--
    Enabled when the hero is a legal target OR is armed and can swing. Gating on
    `targetable` alone left an armed hero unclickable, because that prop is
    about being attacked, not about attacking.
  -->
  <button
    class="ring"
    class:targetable
    disabled={!targetable && !armed}
    on:click
    aria-label={targetable ? `Attack ${label}` : armed ? `Attack with ${weapon?.name ?? 'weapon'}` : label}
  >
    <span class="portrait {side}">
      {glyph}
      {#if wear > 0}
        <svg class="wear" viewBox="0 0 82 88" aria-hidden="true">
          <path d="M8 22 L22 30 L26 44 L38 50" />
          <path d="M74 60 L60 58 L52 68" />
          {#if wear > 1}
            <path d="M41 2 L36 18 L44 30 L40 44 L48 60 L42 86" />
            <path d="M80 30 L64 36 L58 50 L66 64" />
            <path d="M2 64 L16 62 L24 74 L22 86" />
          {/if}
        </svg>
      {/if}
    </span>
    {#if hit}<span class="flash" aria-hidden="true"></span>{/if}
  </button>

  <div class="gems">
    {#if armor > 0}<span class="armor" class:tick={armorTick}>{armor}</span>{/if}
    <span class="hp" class:tick={hpTick} title={`${health} of ${HERO_HEALTH}`}>{Math.max(0, health)}</span>
  </div>

  {#if shownWeapon}
    <div
      class="weapon-icon {tool}"
      class:breaking={breaking && !weapon}
      class:drawn={toolArt}
      style:--ui={toolArt ? `url("${toolArt}")` : null}
      title={`${shownWeapon.name} — ${shownWeapon.attack} attack, ${shownWeapon.durability} left`}
      in:arrive
    >
      {#if !toolArt}
        <svg viewBox="0 0 40 40" aria-hidden="true">
          {#if tool === 'hammer'}
            <path class="handle" d="M18 16 L18 36" />
            <path class="head" d="M8 8 H30 V16 H8 Z" />
          {:else if tool === 'calipers'}
            <path class="head" d="M8 8 H32 V12 H8 Z" />
            <path class="handle" d="M12 12 V32 M28 12 L28 26 L22 34" />
          {:else}
            <path class="handle" d="M10 32 L20 22" />
            <path class="head" d="M20 22 L30 12 L33 15 L23 25 Z" />
            <path class="tip" d="M31 13 L36 6" />
          {/if}
        </svg>
      {/if}
      <span class="w-attack"><span>{shownWeapon.attack}</span></span>
      <span class="w-durability" class:tick={wearTick}>{shownWeapon.durability}</span>
    </div>
  {/if}
</div>

<style>
  .hero {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 5px;
  }

  .hero.hit { animation: fs-shake .52s ease-out; }
  .hero.refused { animation: fs-shake .42s ease-out; }

  .ring {
    position: relative;
    width: 90px;
    height: 96px;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    clip-path: polygon(50% 0, 100% 26%, 100% 74%, 50% 100%, 0 74%, 0 26%);
    background: linear-gradient(160deg, var(--frame-lit), #7a5c30 55%, var(--gold));
    box-shadow: 0 8px 20px rgba(0, 0, 0, .6);
    cursor: default;
  }

  .ring.targetable {
    cursor: crosshair;
    background: linear-gradient(160deg, #ff9e86, #c0392b 55%, #ffb9a4);
    box-shadow: 0 0 26px rgba(226, 96, 74, .7);
    animation: fs-target 1.6s ease-in-out infinite;
  }

  .portrait {
    position: relative;
    width: 82px;
    height: 88px;
    display: flex;
    align-items: center;
    justify-content: center;
    clip-path: polygon(50% 0, 100% 26%, 100% 74%, 50% 100%, 0 74%, 0 26%);
    font-family: var(--display);
    font-size: 30px;
  }

  .portrait.you {
    background: conic-gradient(from 200deg at 50% 110%, #2f4a5a, #1e2f3a 40%, #3a5a6b);
    color: rgba(220, 240, 255, .42);
  }

  .portrait.foe {
    background: conic-gradient(from 200deg at 50% 110%, #5a2f2f, #3a1e1e 40%, #6b3a2a);
    color: rgba(255, 230, 200, .4);
  }

  /* Cracks in the portrait as it wears down. */
  .wear {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }

  .wear path {
    fill: none;
    stroke: rgba(10, 6, 4, .85);
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
    filter: drop-shadow(0 0 1px rgba(255, 210, 160, .6));
  }

  /* A hit: a red flash across the portrait. */
  .flash {
    position: absolute;
    inset: 0;
    background: radial-gradient(circle, rgba(255, 120, 90, .85), rgba(200, 30, 20, .55));
    mix-blend-mode: screen;
    animation: fs-flash .5s ease-out forwards;
    pointer-events: none;
  }

  @keyframes fs-flash {
    from { opacity: 1; }
    to { opacity: 0; }
  }

  /* Brought to 0: it whitens, cracks open and falls apart. The shards are the canvas's. */
  .hero.destroyed .ring { animation: fs-hero-break 1.1s ease-in forwards; }

  @keyframes fs-hero-break {
    0% { transform: none; filter: none; }
    30% { transform: scale(1.12) rotate(-3deg); filter: brightness(2.6) saturate(.2); }
    55% { transform: scale(1.05) rotate(2deg); filter: brightness(1.6) grayscale(1); }
    100% { transform: scale(.6) translateY(30px) rotate(10deg); filter: grayscale(1) brightness(.4) blur(4px); opacity: 0; }
  }

  .gems {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  /* Armed and able to swing — the same green language a ready minion uses. */
  .hero.armed .ring {
    box-shadow: 0 0 0 2px rgba(126, 214, 140, .7), 0 0 22px rgba(126, 214, 140, .45);
    cursor: pointer;
  }

  /*
   * The weapon: a tool in a steel disc beside the portrait, its attack on the
   * left gem and its durability on the right. Opposite side to the hero power.
   */
  .weapon-icon {
    position: absolute;
    top: 26px;
    width: 52px;
    height: 52px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    border: 2px solid #cfd8e0;
    background: radial-gradient(circle at 38% 30%, #6c7d8c, #2a333c 72%);
    box-shadow: 0 6px 14px rgba(0, 0, 0, .55), inset 0 1px 0 rgba(255, 255, 255, .25);
  }

  .hero.foe .weapon-icon { right: calc(100% + 14px); }
  .hero.you .weapon-icon { left: calc(100% + 14px); }

  .weapon-icon.drawn { background: var(--ui) center / cover no-repeat; }

  .weapon-icon svg { width: 32px; height: 32px; }
  .weapon-icon .head { fill: #e6eef4; stroke: #2a333c; stroke-width: 1.5; }
  .weapon-icon .handle { fill: none; stroke: #c9a46a; stroke-width: 4; stroke-linecap: round; }
  .weapon-icon .tip { fill: none; stroke: #ffb24a; stroke-width: 2.5; stroke-linecap: round; }

  /* At 0 durability it shatters. */
  .weapon-icon.breaking { animation: fs-weapon-break .52s ease-in forwards; }

  @keyframes fs-weapon-break {
    30% { transform: scale(1.2) rotate(8deg); filter: brightness(2); }
    100% { transform: scale(.4) rotate(-30deg) translateY(16px); opacity: 0; filter: grayscale(1); }
  }

  .w-attack,
  .w-durability {
    position: absolute;
    bottom: -8px;
    width: 22px;
    height: 22px;
    display: grid;
    place-items: center;
    font-family: var(--display);
    font-size: 13px;
    font-weight: 700;
    color: #fff;
    text-shadow: 0 0 2px #000, 0 1px 2px #000;
  }

  .w-attack {
    left: -8px;
    border-radius: 4px;
    transform: rotate(45deg);
    border: 2px solid #f6dd93;
    background: linear-gradient(135deg, var(--attack), #a9741a);
  }

  /* The diamond is turned; its numeral is turned back. */
  .w-attack span { transform: rotate(-45deg); }

  .w-durability {
    right: -8px;
    border-radius: 4px;
    border: 2px solid #e6eef4;
    background: linear-gradient(150deg, #9fb0c0, #4a5c6c 70%);
  }

  .armor {
    width: 30px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    clip-path: polygon(50% 0, 100% 22%, 100% 62%, 50% 100%, 0 62%, 0 22%);
    background: linear-gradient(160deg, #e6eef4, #8494a2 50%, #4f5d69);
    font-family: var(--display);
    font-weight: 700;
    font-size: 14px;
    color: #12171c;
    text-shadow: 0 1px 0 rgba(255, 255, 255, .5);
  }

  .hp {
    width: 44px;
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50% 50% 50% 50% / 42% 42% 58% 58%;
    border: 2px solid #f0a08c;
    background: radial-gradient(circle at 35% 28%, var(--blood), var(--blood-deep) 70%);
    box-shadow: 0 4px 12px rgba(0, 0, 0, .6), inset 0 2px 6px rgba(255, 190, 170, .5);
    font-family: var(--display);
    font-weight: 700;
    font-size: 19px;
    color: #fff3ec;
    text-shadow: 0 2px 4px rgba(0, 0, 0, .6);
  }

  /* A number changing: the gem swells and flashes as it ticks. */
  .tick { animation: fs-gem-tick .42s ease-out; }

  @keyframes fs-gem-tick {
    0% { transform: scale(1); }
    30% { transform: scale(1.35); filter: brightness(1.8); }
    100% { transform: scale(1); }
  }
</style>
