<script lang="ts">
  import { HERO_HEALTH } from '../engine/state';

  export let label: string;
  export let health: number;
  /**
   * Armor. Still nothing grants it — the slot is hidden at zero rather than
   * showing a permanent 0, which is the smaller half of the fix HANDOVER §7
   * asked for. Weapons now occupy the visual space it was reserving.
   */
  export let armor = 0;
  /** 'you' | 'foe' — only changes the portrait tint. */
  export let side: 'you' | 'foe' = 'you';
  export let glyph = side === 'you' ? 'Ψ' : 'Ω';
  /** Legal attack target — red ring and crosshair. */
  export let targetable = false;
  /** Just took damage — shake once. */
  export let hit = false;
  /** The equipped weapon, if any. */
  export let weapon: { name: string; attack: number; durability: number } | null = null;
  /** This hero can swing its weapon right now — green pulse, like a ready minion. */
  export let armed = false;
</script>

<div class="hero" class:hit class:armed>
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
    <span class="portrait {side}">{glyph}</span>
  </button>

  <div class="gems">
    {#if armor > 0}<span class="armor">{armor}</span>{/if}
    <span class="hp" title={`${health} of ${HERO_HEALTH}`}>{health}</span>
  </div>

  {#if weapon}
    <div class="weapon" title={`${weapon.name} — ${weapon.attack} attack, ${weapon.durability} left`}>
      <span class="w-attack">{weapon.attack}</span>
      <span class="w-name">{weapon.name}</span>
      <span class="w-durability">{weapon.durability}</span>
    </div>
  {/if}
</div>

<style>
  .hero {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 5px;
  }

  .hero.hit { animation: fs-shake .52s ease-out; }

  .ring {
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

  .weapon {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 2px 7px;
    border-radius: 10px;
    border: 1px solid #7d8fa0;
    background: linear-gradient(180deg, rgba(60, 74, 88, .95), rgba(28, 36, 44, .95));
    font-family: var(--display);
    font-size: 9.5px;
    letter-spacing: .06em;
    color: #dbe6ef;
    white-space: nowrap;
  }

  .w-name {
    max-width: 92px;
    overflow: hidden;
    text-overflow: ellipsis;
    text-transform: uppercase;
    color: #a9bccd;
  }

  .w-attack,
  .w-durability {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 15px;
    height: 15px;
    border-radius: 3px;
    font-size: 10px;
    font-weight: 700;
  }
  .w-attack {
    background: linear-gradient(135deg, var(--attack), #a9741a);
    color: #fff6e6;
  }
  .w-durability {
    background: linear-gradient(150deg, #9fb0c0, #4a5c6c);
    color: #f2f7fb;
  }

  .armor {
    width: 30px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    clip-path: polygon(50% 0, 100% 22%, 100% 62%, 50% 100%, 0 62%, 0 22%);
    background: linear-gradient(160deg, #cfd6dd, #697683);
    font-family: var(--display);
    font-weight: 700;
    font-size: 13px;
    color: #1a1f24;
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
</style>
