<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { fly } from 'svelte/transition';
  import { backOut, cubicIn } from 'svelte/easing';
  import type { Reward } from '$lib/quests/rewards';
  import { settings } from '$lib/settings';

  /**
   * A claimed quest, sliding in as a card (REVISIONS R10.4): its bar fills, and
   * its gold flies off as coins into the nav's counter — which holds its count
   * until they land. Over in about three seconds, or at a click. Reduced
   * motion keeps the card and the count, and drops the slide and the flight.
   */
  export let reward: Reward;
  /** The nav's gold counter, for the coins to fly into. */
  export let target: HTMLElement | undefined = undefined;

  const dispatch = createEventDispatcher<{ done: void }>();
  const calm = $settings.motion === 'reduced';

  let coin: SVGSVGElement;
  let full = false;
  let coins: { from: DOMRect; to: DOMRect; i: number }[] = [];

  onMount(() => {
    const timers = [
      setTimeout(() => (full = true), 80),
      setTimeout(throwCoins, 820),
      setTimeout(() => dispatch('done'), 3400)
    ];
    return () => timers.forEach(clearTimeout);
  });

  function throwCoins() {
    if (calm || reward.gold <= 0 || !target?.isConnected) return;
    const from = coin.getBoundingClientRect();
    const to = target.getBoundingClientRect();
    const count = Math.min(10, 3 + Math.round(reward.gold / 15));
    coins = Array.from({ length: count }, (_, i) => ({ from, to, i }));
  }

  /** One coin's arc, from the card's coin up and over into the counter. */
  function flight(node: HTMLElement, { from, to, i }: { from: DOMRect; to: DOMRect; i: number }) {
    const x0 = from.left + from.width / 2 + (Math.random() - 0.5) * 14;
    const y0 = from.top + from.height / 2;
    const x1 = to.left + 10;
    const y1 = to.top + to.height / 2;
    const mx = (x0 + x1) / 2 - 40 - Math.random() * 60;
    const my = Math.min(y0, y1) - 30 - Math.random() * 40;
    const at = (x: number, y: number, s: number) => `translate(${x - 8}px, ${y - 8}px) scale(${s})`;
    node.animate(
      [
        { transform: at(x0, y0, 0.5), opacity: 0 },
        { transform: at(mx, my, 1.15), opacity: 1, offset: 0.45 },
        { transform: at(x1, y1, 0.7), opacity: 1 }
      ],
      { duration: 640, delay: i * 70, easing: 'cubic-bezier(.4,.1,.6,1)', fill: 'both' }
    ).onfinish = () => node.remove();
  }

  $: parts = [
    reward.gold > 0 ? `+${reward.gold}` : '',
    reward.packs > 0 ? (reward.packs === 1 ? '1 pack' : `${reward.packs} packs`) : '',
    reward.back ? 'a card back' : ''
  ].filter(Boolean);
</script>

<button
  class="toast"
  aria-live="polite"
  in:fly={calm ? { duration: 0 } : { x: 360, duration: 480, easing: backOut }}
  out:fly={calm ? { duration: 0 } : { x: 360, duration: 300, easing: cubicIn }}
  on:click={() => dispatch('done')}
>
  <span class="kicker">Quest complete</span>
  <span class="label">{reward.label}</span>
  <span class="bar"><span class="fill" class:full></span></span>
  <span class="pay">
    {#if reward.gold > 0}
      <svg class="coin" bind:this={coin} viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="10.5" class="rim" />
        <circle cx="12" cy="12" r="7.5" class="face" />
        <path d="M12 7.5 L14.2 12 L12 16.5 L9.8 12 Z" class="mark" />
      </svg>
    {/if}
    {parts.join(' · ')}
  </span>
</button>

{#each coins as c (c.i)}
  <span class="flying-coin" use:flight={c} aria-hidden="true"></span>
{/each}

<style>
  .toast {
    position: fixed;
    top: 72px;
    right: 18px;
    z-index: 80;
    display: grid;
    gap: 6px;
    width: 260px;
    padding: 14px 16px 12px;
    border: 2px solid #c9a24a;
    border-radius: 12px;
    background:
      radial-gradient(120% 90% at 50% 0%, rgba(255, 214, 120, .18), transparent 60%),
      linear-gradient(180deg, #3a2614, #1e130a);
    box-shadow:
      0 0 0 1px #000,
      0 0 22px rgba(255, 200, 80, .35),
      0 14px 30px rgba(0, 0, 0, .6);
    text-align: left;
    color: var(--text);
    cursor: pointer;
  }

  .kicker {
    font-family: var(--display);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: .2em;
    text-transform: uppercase;
    color: var(--gold);
  }

  .label {
    font-family: var(--display);
    font-size: 16px;
    font-weight: 700;
    color: #fff3c4;
  }

  .bar {
    height: 8px;
    border-radius: 4px;
    background: #120b05;
    box-shadow: inset 0 1px 2px rgba(0, 0, 0, .8);
    overflow: hidden;
  }
  .fill {
    display: block;
    width: 0;
    height: 100%;
    border-radius: 4px;
    background: linear-gradient(90deg, #c98a22, #ffd36a);
    box-shadow: 0 0 8px rgba(255, 210, 110, .8);
    transition: width .7s cubic-bezier(.3, .7, .3, 1);
  }
  .fill.full { width: 100%; }

  .pay {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-family: var(--display);
    font-size: 14px;
    font-weight: 700;
    color: var(--gold-bright);
  }

  .coin { width: 18px; height: 18px; }
  .rim { fill: #b07a22; stroke: #4a2c08; stroke-width: 1.2; }
  .face { fill: #f2c65a; stroke: #8a5a14; stroke-width: 1; }
  .mark { fill: #fff3c4; stroke: #8a5a14; stroke-width: .8; }

  .flying-coin {
    position: fixed;
    left: 0;
    top: 0;
    z-index: 81;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    border: 1.5px solid #8a5a14;
    background: radial-gradient(circle at 35% 30%, #fff3c4, #f2c65a 45%, #b07a22);
    box-shadow: 0 0 8px rgba(255, 210, 110, .9);
    pointer-events: none;
  }
</style>
