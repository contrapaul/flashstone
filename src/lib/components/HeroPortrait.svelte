<script lang="ts">
  import { HERO_HEALTH } from '../engine/state';

  export let label: string;
  export let health: number;
  export let armor = 0;
  /** 'you' | 'foe' — only changes the portrait tint. */
  export let side: 'you' | 'foe' = 'you';
  export let glyph = side === 'you' ? 'Ψ' : 'Ω';
  /** Legal attack target — red ring and crosshair. */
  export let targetable = false;
  /** Just took damage — shake once. */
  export let hit = false;
</script>

<div class="hero" class:hit>
  <button
    class="ring"
    class:targetable
    disabled={!targetable}
    on:click
    aria-label={targetable ? `Attack ${label}` : label}
  >
    <span class="portrait {side}">{glyph}</span>
  </button>

  <div class="gems">
    <span class="armor" class:none={armor === 0}>{armor}</span>
    <span class="hp" title={`${health} of ${HERO_HEALTH}`}>{health}</span>
  </div>
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

  .armor.none {
    background: linear-gradient(160deg, #2e2a24, #1a1712);
    color: #4a4238;
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
