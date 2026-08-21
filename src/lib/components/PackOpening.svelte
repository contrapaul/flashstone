<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import CardPreview from './CardPreview.svelte';
  import CardBack from './CardBack.svelte';
  import { cardById } from '$lib/data/cards';
  import type { Card } from '../../types/cards';

  /**
   * Five cards, face down, each flipping when clicked or tapped.
   *
   * Deliberately not automatic: the reveal is the thing you paid for, and
   * turning them over one at a time is most of the pleasure. "Reveal all" is
   * there for the fiftieth pack.
   */

  export let pack: { cardId: string; gold: boolean; isNew: boolean }[] = [];
  export let backId = 'default';

  const dispatch = createEventDispatcher<{ done: void }>();

  let flipped = new Set<number>();

  $: cards = pack.map((entry) => ({ ...entry, card: cardById(entry.cardId) }));
  $: allFlipped = flipped.size >= pack.length;

  function flip(index: number) {
    if (flipped.has(index)) return;
    // A new Set, not a mutation: Svelte 4 tracks assignment, not method calls.
    flipped = new Set(flipped).add(index);
  }

  function revealAll() {
    flipped = new Set(pack.map((_, i) => i));
  }

  function onKey(event: KeyboardEvent, index: number) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      flip(index);
    }
  }

  function label(entry: { gold: boolean; isNew: boolean }, card: Card | undefined): string {
    if (!card) return '';
    if (entry.gold) return 'Gold';
    return entry.isNew ? 'New' : 'Second copy';
  }
</script>

<div class="pack">
  <p class="lead">
    {allFlipped ? 'Added to your collection.' : 'Click each card to turn it over.'}
  </p>

  <div class="row">
    {#each cards as entry, i (i)}
      <div class="slot" class:flipped={flipped.has(i)}>
        <button
          class="flipper"
          on:click={() => flip(i)}
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
          <span class="tag" class:gold={entry.gold} class:dupe={!entry.isNew && !entry.gold}>
            {label(entry, entry.card)}
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
</div>

<style>
  .pack {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 20px;
  }

  .lead {
    margin: 0;
    font-family: var(--display);
    font-size: 11px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--gold);
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 18px;
  }

  .slot {
    position: relative;
    width: 134px;
    /* Room for the tag under the card. */
    padding-bottom: 26px;
  }

  /* The card itself is the button, so the whole face is the hit target — which
     is what makes this work by tap as well as by click. */
  .flipper {
    position: relative;
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
  .tag.gold {
    border-color: #f5cf5e;
    color: #f7dd93;
    box-shadow: 0 0 12px rgba(245, 207, 94, 0.35);
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

  @media (prefers-reduced-motion: reduce) {
    .flipper { transition: none; }
  }
</style>
