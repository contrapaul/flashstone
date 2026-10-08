<script lang="ts">
  import { createEventDispatcher, tick } from 'svelte';
  import { audio } from '$lib/audio';
  import CardPreview from './CardPreview.svelte';
  import CardBack from './CardBack.svelte';
  import FxLayer from './FxLayer.svelte';
  import Logo from './Logo.svelte';
  import { cardById } from '$lib/data/cards';
  import { unseen } from '$lib/collection/unseen';
  import { settings } from '$lib/settings';
  import type { Fx } from '$lib/presentation/fx';
  import type { Card, Rarity } from '../../types/cards';

  /**
   * Opening a pack, as a ceremony (REVISIONS R10.1–R10.2).
   *
   * The sealed pack is dragged onto the socket — or tapped — and shakes, glows
   * and bursts. Five cards fan out face down, and **each one's rarity leaks out
   * from under it before it is turned**: nothing for a Common, green for an
   * Uncommon, blue beams for a Rare, a purple pulse for an Epic, orange god-rays
   * for a Legendary. That is the moment of hope this exists for.
   *
   * Turning one over is still a click or a tap (DECISIONS.md §3), and the reveal
   * scales with what it is: a clean flip, a burst, a shake — and for a Legendary
   * the room dims and the card comes forward with its name. "Reveal all" is
   * there for the fiftieth pack.
   */

  export let pack: { cardId: string; gold: boolean; isNew: boolean }[] = [];
  export let backId = 'default';

  const dispatch = createEventDispatcher<{ done: void }>();

  $: cards = pack.map((entry) => ({ ...entry, card: cardById(entry.cardId) }));
  $: calm = $settings.motion === 'reduced';

  let stage: 'sealed' | 'bursting' | 'dealt' = 'sealed';
  let flipped = new Set<number>();
  $: allFlipped = stage === 'dealt' && flipped.size >= pack.length;

  let fx: Fx | null = null;
  let packEl: HTMLElement | undefined;
  let socketEl: HTMLElement | undefined;
  let rowEl: HTMLElement | undefined;

  // ── The sealed pack ─────────────────────────────────────
  /** Where the pack has been dragged to, from where it started. */
  let drag: { id: number; x0: number; y0: number; dx: number; dy: number } | null = null;

  function grab(event: PointerEvent) {
    if (stage !== 'sealed') return;
    drag = { id: event.pointerId, x0: event.clientX, y0: event.clientY, dx: 0, dy: 0 };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function move(event: PointerEvent) {
    if (!drag || event.pointerId !== drag.id) return;
    drag = { ...drag, dx: event.clientX - drag.x0, dy: event.clientY - drag.y0 };
  }

  /** Let go over the socket, or barely moved at all (a tap): it opens. Anywhere else, it slides back. */
  function release(event: PointerEvent) {
    if (!drag || event.pointerId !== drag.id) return;
    const tapped = Math.hypot(drag.dx, drag.dy) < 8;
    const socket = socketEl?.getBoundingClientRect();
    const over = socket && Math.hypot(event.clientX - (socket.left + socket.width / 2), event.clientY - (socket.top + socket.height / 2)) < socket.width * 0.75;
    drag = null;
    if (tapped || over) void open();
  }

  function onPackKey(event: KeyboardEvent) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      void open();
    }
  }

  async function open() {
    if (stage !== 'sealed') return;
    stage = 'bursting';
    audio().play('pack-open');
    await wait(calm ? 100 : 650);
    const at = socketEl ? centre(socketEl) : null;
    if (at) {
      fx?.ring(at.x, at.y, { color: 'rgba(255, 214, 120, .95)', size: 320, life: 0.7 });
      fx?.sparks(at.x, at.y, { colors: ['#fff3c4', '#ffd36a', '#c78bff'], count: 40, speed: 700, gravity: 300 });
      fx?.shards(at.x, at.y, { colors: ['#7a4ad0', '#c9a46a', '#3a2a6a'], count: 24, speed: 520, size: 10 });
    }
    stage = 'dealt';
    // What came out is badged in the collection until it is looked at.
    unseen.add(pack.filter((p) => p.isNew).map((p) => p.cardId));
  }

  // ── The cards ────────────────────────────────────────────
  /** Each card's place in the fan: a gentle arc, the middle highest. */
  function fanAt(i: number, n: number) {
    const t = n === 1 ? 0 : i / (n - 1) - 0.5;
    return { rotate: t * 18, lift: Math.abs(t) * 34 };
  }

  const LIGHT: Record<Rarity, string> = {
    Common: '',
    Uncommon: 'uncommon',
    Rare: 'rare',
    Epic: 'epic',
    Legendary: 'legendary'
  };
  const PITCH: Record<Rarity, number> = { Common: 1, Uncommon: 1.06, Rare: 1.12, Epic: 1.2, Legendary: 1.3 };

  /** Hovering a hidden card swells its glow — and its sound, higher the rarer it is. */
  function hover(i: number) {
    const card = cards[i]?.card;
    if (!card || flipped.has(i)) return;
    audio().play('card-hover', { rate: PITCH[card.rarity], volume: card.rarity === 'Common' ? 0.4 : 0.7, spread: 0 });
  }

  /** The Legendary moment: the card brought forward, its name unfurled. */
  let spotlight: { card: Card; gold: boolean } | null = null;
  let shaking = false;

  async function flip(index: number) {
    if (stage !== 'dealt' || flipped.has(index)) return;
    // A new Set, not a mutation: Svelte 4 tracks assignment, not method calls.
    flipped = new Set(flipped).add(index);
    audio().play('card-flip');
    await reveal(index);
  }

  /** What a card does as it turns face up, scaled to what it is. */
  async function reveal(index: number) {
    const entry = cards[index];
    const card = entry?.card;
    if (!card) return;
    await wait(calm ? 0 : 260);
    await tick();
    const el = rowEl?.querySelectorAll<HTMLElement>('.slot')[index];
    const at = el ? centre(el) : null;
    if (entry.gold && at) {
      fx?.sparks(at.x, at.y, { colors: ['#fff3c4', '#f5cf5e', '#ffffff'], count: 22, speed: 380, gravity: 200 });
    }
    switch (card.rarity) {
      case 'Uncommon':
        if (at) fx?.motes(at.x, at.y, { colors: ['#b8ffc4', '#5fbf6a'], count: 10, speed: 120, gravity: -60 });
        return;
      case 'Rare':
        audio().play('reveal-rare');
        if (at) {
          fx?.ring(at.x, at.y, { color: 'rgba(110, 180, 255, .95)', size: 220 });
          fx?.sparks(at.x, at.y, { colors: ['#cfe6ff', '#4a8fe0'], count: 26, speed: 460, gravity: 120 });
        }
        return;
      case 'Epic':
        audio().play('reveal-epic');
        if (at) {
          fx?.ring(at.x, at.y, { color: 'rgba(196, 140, 255, .95)', size: 280 });
          fx?.sparks(at.x, at.y, { colors: ['#ecd4ff', '#a457e8'], count: 36, speed: 560, gravity: 120 });
        }
        if (!calm) {
          shaking = true;
          await wait(420);
          shaking = false;
        }
        return;
      case 'Legendary':
        audio().play('reveal-legendary');
        spotlight = { card, gold: entry.gold };
        if (at) fx?.ring(at.x, at.y, { color: 'rgba(255, 176, 46, .95)', size: 360, life: 0.8 });
        await wait(calm ? 1600 : 2200);
        spotlight = null;
        return;
    }
  }

  async function revealAll() {
    const left = cards.map((_, i) => i).filter((i) => !flipped.has(i));
    for (const i of left) {
      void flip(i);
      await wait(calm ? 60 : 240);
    }
  }

  function onKey(event: KeyboardEvent, index: number) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      void flip(index);
    }
  }

  function label(entry: { gold: boolean; isNew: boolean }): string {
    if (entry.gold) return 'Gold';
    return entry.isNew ? 'New' : 'Second copy';
  }

  const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
  function centre(el: Element) {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
</script>

<FxLayer bind:fx />

<div class="pack" class:calm>
  {#if stage !== 'dealt'}
    <p class="lead">Drag the pack onto the socket — or tap it.</p>
    <div class="stage">
      <!-- The sealed pack: a crimped foil packet with the mark on it. -->
      <div
        class="foil"
        class:bursting={stage === 'bursting'}
        class:dragging={drag !== null}
        bind:this={packEl}
        style:--dx={`${drag?.dx ?? 0}px`}
        style:--dy={`${drag?.dy ?? 0}px`}
        role="button"
        tabindex="0"
        aria-label="Open the pack"
        on:pointerdown={grab}
        on:pointermove={move}
        on:pointerup={release}
        on:pointercancel={() => (drag = null)}
        on:keydown={onPackKey}
      >
        <span class="crimp top" aria-hidden="true"></span>
        <span class="mark"><Logo height={44} /></span>
        <span class="count">5 cards</span>
        <span class="crimp bottom" aria-hidden="true"></span>
      </div>
      <div class="socket" class:ready={drag !== null} bind:this={socketEl} aria-hidden="true">
        <span class="ring"></span>
      </div>
    </div>
  {:else}
    <p class="lead">
      {allFlipped ? 'Added to your collection.' : 'Click each card to turn it over.'}
    </p>

    <div class="row" class:shaking bind:this={rowEl}>
      {#each cards as entry, i (i)}
        {@const at = fanAt(i, cards.length)}
        <div
          class="slot"
          class:flipped={flipped.has(i)}
          style:--rotate={`${at.rotate}deg`}
          style:--lift={`${at.lift}px`}
          style:--i={i}
        >
          {#if entry.card && LIGHT[entry.card.rarity] && !flipped.has(i)}
            <!-- Its rarity, leaking out from beneath it before it is turned. -->
            <span class="leak {LIGHT[entry.card.rarity]}" aria-hidden="true"></span>
          {/if}
          <button
            class="flipper"
            on:click={() => flip(i)}
            on:pointerenter={() => hover(i)}
            on:keydown={(e) => onKey(e, i)}
            aria-label={flipped.has(i) ? (entry.card?.name ?? 'Card') : 'Turn over'}
          >
            <span class="face back"><CardBack {backId} /></span>
            <span class="face front">
              {#if entry.card}
                <CardPreview card={entry.card} gold={entry.gold} playable />
              {/if}
            </span>
          </button>

          {#if flipped.has(i)}
            <span class="tag" class:gold={entry.gold} class:new={entry.isNew && !entry.gold} class:dupe={!entry.isNew && !entry.gold}>
              {label(entry)}
            </span>
          {/if}
        </div>
      {/each}
    </div>

    <div class="actions">
      {#if !allFlipped}
        <button class="ghost" on:click={revealAll}>Reveal all</button>
      {:else}
        <button on:click={() => dispatch('done')}>Done</button>
      {/if}
    </div>
  {/if}
</div>

{#if spotlight}
  <!-- A Legendary: the room dims, the card comes forward, and its name unfurls. -->
  <div class="spotlight" aria-live="polite">
    <span class="rays" aria-hidden="true"></span>
    <div class="hero-card"><CardPreview card={spotlight.card} gold={spotlight.gold} playable /></div>
    <div class="banner"><span>{spotlight.card.name}</span></div>
  </div>
{/if}

<style>
  .pack {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 22px;
    min-height: 360px;
  }

  .lead {
    margin: 0;
    font-family: var(--display);
    font-size: 11px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--gold);
  }

  /* ── Sealed ── */

  .stage {
    display: flex;
    align-items: center;
    gap: 120px;
    padding: 20px 0;
  }

  .foil {
    position: relative;
    z-index: 2;
    width: 170px;
    height: 236px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 14px;
    border-radius: 6px;
    background:
      linear-gradient(115deg, transparent 30%, rgba(255, 255, 255, .22) 45%, transparent 60%),
      radial-gradient(90% 70% at 50% 35%, #7a4ad0, #3a1f6a 70%, #1e0f3a);
    box-shadow: 0 0 0 2px #c9a46a, 0 18px 36px rgba(0, 0, 0, .7), 0 0 30px rgba(160, 110, 255, .35);
    cursor: grab;
    touch-action: none;
    transform: translate(var(--dx), var(--dy));
    transition: transform .3s cubic-bezier(.2, 1.3, .4, 1);
    animation: fs-foil-sheen 3s ease-in-out infinite;
  }
  .foil.dragging { cursor: grabbing; transition: none; }
  .foil:hover:not(.dragging) { box-shadow: 0 0 0 2px #ffe08a, 0 18px 36px rgba(0, 0, 0, .7), 0 0 44px rgba(190, 140, 255, .6); }

  @keyframes fs-foil-sheen {
    0%, 100% { background-position: 0 0, 0 0; }
    50% { filter: brightness(1.08); }
  }

  /* Opening: it shakes, glows white-hot, and goes. */
  .foil.bursting { animation: fs-pack-burst .65s ease-in forwards; }

  @keyframes fs-pack-burst {
    0% { transform: none; }
    15% { transform: rotate(-4deg) scale(1.03); }
    30% { transform: rotate(4deg) scale(1.05); }
    45% { transform: rotate(-5deg) scale(1.07); filter: brightness(1.5); }
    60% { transform: rotate(5deg) scale(1.1); filter: brightness(2.2); }
    100% { transform: scale(1.5); filter: brightness(4); opacity: 0; }
  }

  .crimp {
    position: absolute;
    left: 0;
    right: 0;
    height: 10px;
    background: repeating-linear-gradient(90deg, #c9a46a 0 6px, #8a6430 6px 12px);
  }
  .crimp.top { top: 0; clip-path: polygon(0 0, 100% 0, 100% 60%, 0 100%); }
  .crimp.bottom { bottom: 0; clip-path: polygon(0 40%, 100% 0, 100% 100%, 0 100%); }

  .mark { filter: drop-shadow(0 4px 8px rgba(0, 0, 0, .6)); }
  .mark :global(.logo) { max-width: 150px; }

  .count {
    font-family: var(--display);
    font-size: 11px;
    letter-spacing: .2em;
    text-transform: uppercase;
    color: #e6d4ff;
  }

  /* The socket the pack goes into: a ring of light that brightens while a pack is held. */
  .socket {
    position: relative;
    width: 180px;
    height: 180px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(255, 214, 120, .18), transparent 65%);
    box-shadow: inset 0 0 0 2px rgba(201, 164, 106, .5);
  }
  .socket .ring {
    position: absolute;
    inset: 14px;
    border-radius: 50%;
    border: 2px dashed rgba(255, 214, 120, .5);
    animation: fs-socket-turn 12s linear infinite;
  }
  .socket.ready { background: radial-gradient(circle, rgba(255, 214, 120, .45), transparent 70%); box-shadow: inset 0 0 0 2px #ffe08a, 0 0 40px rgba(255, 214, 120, .5); }

  @keyframes fs-socket-turn { to { transform: rotate(360deg); } }

  /* ── Dealt ── */

  .row {
    display: flex;
    justify-content: center;
    gap: 16px;
    padding: 50px 30px 10px;
  }
  .row.shaking { animation: fs-row-shake .42s ease-out; }

  @keyframes fs-row-shake {
    0%, 100% { transform: none; }
    20% { transform: translate(-7px, 3px); }
    40% { transform: translate(6px, -3px); }
    60% { transform: translate(-4px, 2px); }
    80% { transform: translate(3px, -1px); }
  }

  /* Each slot fans out of the socket into its place on the arc. */
  .slot {
    position: relative;
    width: 134px;
    padding-bottom: 26px;
    transform: rotate(var(--rotate)) translateY(var(--lift));
    animation: fs-deal .55s cubic-bezier(.2, 1.2, .4, 1) calc(var(--i) * 90ms) both;
  }

  @keyframes fs-deal {
    from { transform: translateY(-60px) scale(.3) rotate(0); opacity: 0; }
  }

  /* The card itself is the button, so the whole face is the hit target — which
     is what makes this work by tap as well as by click. */
  .flipper {
    position: relative;
    z-index: 1;
    display: block;
    width: 134px;
    height: 168px;
    padding: 0;
    border: none;
    background: none;
    cursor: pointer;
    transform-style: preserve-3d;
    transition: transform 0.55s cubic-bezier(0.3, 1, 0.4, 1);
  }
  .slot:not(.flipped) .flipper:hover { transform: translateY(-8px); }

  .slot.flipped .flipper {
    transform: rotateY(180deg);
    cursor: default;
  }

  .face {
    position: absolute;
    inset: 0;
    backface-visibility: hidden;
  }

  .front { transform: rotateY(180deg); }

  /* Rarity, leaking out from beneath a face-down card. */
  .leak {
    position: absolute;
    left: 50%;
    top: 84px;
    width: 0;
    height: 0;
    pointer-events: none;
    transition: transform .25s ease, filter .25s ease;
  }
  .leak::before,
  .leak::after {
    content: '';
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    border-radius: 50%;
  }
  .slot:hover .leak { transform: scale(1.35); filter: brightness(1.4); }

  .leak.uncommon::before { width: 190px; height: 220px; background: radial-gradient(closest-side, rgba(95, 220, 120, .55), transparent); }

  .leak.rare::before { width: 230px; height: 260px; background: radial-gradient(closest-side, rgba(90, 160, 255, .65), transparent); }
  .leak.rare::after {
    width: 300px;
    height: 300px;
    background: repeating-conic-gradient(rgba(140, 200, 255, .45) 0deg 6deg, transparent 6deg 30deg);
    -webkit-mask-image: radial-gradient(closest-side, #000 30%, transparent);
    mask-image: radial-gradient(closest-side, #000 30%, transparent);
    animation: fs-rays 9s linear infinite;
  }

  .leak.epic::before {
    width: 250px;
    height: 280px;
    background: radial-gradient(closest-side, rgba(190, 110, 255, .8), transparent);
    animation: fs-epic-pulse 1.3s ease-in-out infinite;
  }

  .leak.legendary::before {
    width: 280px;
    height: 300px;
    background: radial-gradient(closest-side, rgba(255, 176, 46, .9), transparent);
    animation: fs-epic-pulse 1.1s ease-in-out infinite;
  }
  .leak.legendary::after {
    width: 460px;
    height: 460px;
    background: repeating-conic-gradient(rgba(255, 200, 90, .55) 0deg 7deg, transparent 7deg 22deg);
    -webkit-mask-image: radial-gradient(closest-side, #000 25%, transparent);
    mask-image: radial-gradient(closest-side, #000 25%, transparent);
    animation: fs-rays 6s linear infinite;
  }

  @keyframes fs-rays { to { transform: translate(-50%, -50%) rotate(360deg); } }
  @keyframes fs-epic-pulse {
    0%, 100% { opacity: .65; transform: translate(-50%, -50%) scale(.92); }
    50% { opacity: 1; transform: translate(-50%, -50%) scale(1.08); }
  }

  .tag {
    position: absolute;
    left: 50%;
    bottom: 0;
    transform: translateX(-50%);
    padding: 2px 9px;
    border-radius: 9px;
    border: 1px solid var(--frame);
    background: var(--ink-2);
    font-family: var(--display);
    font-size: 9.5px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--good, #7ed68c);
    white-space: nowrap;
  }
  .tag.dupe { color: var(--text-faint); }
  .tag.new { animation: fs-new-glow 1.6s ease-in-out infinite; }
  .tag.gold {
    border-color: #f5cf5e;
    color: #f7dd93;
    box-shadow: 0 0 12px rgba(245, 207, 94, 0.35);
  }

  @keyframes fs-new-glow {
    0%, 100% { box-shadow: 0 0 4px rgba(126, 214, 140, .3); }
    50% { box-shadow: 0 0 14px rgba(126, 214, 140, .9); border-color: #7ed68c; }
  }

  .actions { display: flex; gap: 10px; }

  button.ghost,
  .actions button {
    padding: 10px 22px;
    border: 1px solid #8a6c3c;
    border-radius: 4px;
    background: linear-gradient(180deg, var(--gold), #9c7c3c);
    color: #2a1d10;
    cursor: pointer;
    font-family: var(--display);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.16em;
    text-transform: uppercase;
  }

  button.ghost {
    background: var(--ink-2);
    border-color: var(--rule);
    color: var(--text-dim);
  }
  button.ghost:hover { border-color: var(--frame-lit); color: var(--gold-bright); }

  /* ── The Legendary moment ── */

  .spotlight {
    position: fixed;
    inset: 0;
    z-index: 330;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 26px;
    background: radial-gradient(circle at 50% 45%, rgba(40, 24, 6, .55), rgba(5, 3, 1, .9) 70%);
    animation: fs-spot 2.2s ease both;
    pointer-events: none;
  }

  @keyframes fs-spot {
    0% { opacity: 0; }
    12%, 85% { opacity: 1; }
    100% { opacity: 0; }
  }

  .rays {
    position: absolute;
    left: 50%;
    top: 45%;
    width: 1100px;
    height: 1100px;
    transform: translate(-50%, -50%);
    background: repeating-conic-gradient(rgba(255, 200, 90, .25) 0deg 6deg, transparent 6deg 18deg);
    -webkit-mask-image: radial-gradient(closest-side, #000 20%, transparent);
    mask-image: radial-gradient(closest-side, #000 20%, transparent);
    animation: fs-rays 14s linear infinite;
  }

  .hero-card {
    position: relative;
    width: calc(134px * 2.2);
    height: calc(168px * 2.2);
    animation: fs-hero-card 2.2s cubic-bezier(.2, 1.2, .4, 1) both;
  }
  .hero-card :global(.card) { transform: scale(2.2); transform-origin: top left; animation: none; box-shadow: 0 0 60px rgba(255, 176, 46, .7); }

  @keyframes fs-hero-card {
    0% { transform: scale(.4) translateY(120px); }
    20% { transform: scale(1.04); }
    28%, 80% { transform: none; }
    100% { transform: scale(.5) translateY(140px); }
  }

  /* The name, on a ribbon that unrolls from the middle. */
  .banner {
    position: relative;
    padding: 10px 46px;
    background: linear-gradient(180deg, #d9962e, #8a5a14);
    border: 2px solid #ffe08a;
    clip-path: polygon(0 0, 100% 0, 96% 50%, 100% 100%, 0 100%, 4% 50%);
    animation: fs-banner .7s cubic-bezier(.2, 1, .4, 1) .45s both;
  }
  .banner span {
    font-family: var(--logo-face);
    font-size: 30px;
    color: #fff6d8;
    text-shadow: 0 2px 0 #4a2c08, 0 0 14px rgba(255, 220, 140, .8);
    white-space: nowrap;
  }

  @keyframes fs-banner {
    from { clip-path: polygon(50% 0, 50% 0, 50% 50%, 50% 100%, 50% 100%, 50% 50%); }
  }

  /* Reduced motion: lights stay, nothing spins, bursts or shakes. */
  .calm .foil, .calm .foil.bursting, .calm .slot, .calm .leak::after, .calm .leak::before { animation: none; }
  .calm .flipper { transition: none; }
</style>
