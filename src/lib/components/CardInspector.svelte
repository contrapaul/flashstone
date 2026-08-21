<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import CardPreview from './CardPreview.svelte';
  import type { Card } from '../../types/cards';

  /**
   * A card, enlarged and centred, with its definition beside it.
   *
   * The one place a definition is ever shown next to a card, and the same
   * component in all three contexts — a match, the collection, and review. The
   * card itself is never rebuilt for a context: it is the ordinary CardPreview
   * at scale, so a card looks identical wherever you meet it.
   */

  export let card: Card | null = null;
  /** Show the definition panel. Always on in the collection and in review. */
  export let showDefinition = true;
  /** Gold (foil) treatment, when the player's copy is gold. */
  export let gold = false;

  const dispatch = createEventDispatcher<{ close: void }>();

  function close() {
    dispatch('close');
  }

  /**
   * Dismiss only when the backdrop itself was hit, rather than putting a
   * stopPropagation handler on the panel — a listener on a non-interactive
   * container is exactly what the a11y rule warns about, and this needs no
   * listener at all.
   */
  function onScrimClick(event: MouseEvent) {
    if (event.target === event.currentTarget) close();
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') close();
  }

  $: definition = card?.definition ?? '';
  $: sections = card?.sections ?? [];
</script>

<svelte:window on:keydown={onKeydown} />

{#if card}
  <!-- The backdrop is the dismiss target; the panel stops the click. -->
  <div
    class="scrim"
    role="button"
    tabindex="-1"
    aria-label="Close"
    on:click={onScrimClick}
    on:keydown={onKeydown}
  >
    <div class="panel" role="dialog" aria-modal="true" aria-label={card.name}>
      <div class="card-slot">
        <CardPreview {card} {gold} playable />
      </div>

      {#if showDefinition && definition}
        <aside class="meaning">
          <h2>{card.name}</h2>
          {#if sections.length > 0}
            <p class="sections">{sections.join(' · ')}{card.hl ? ' · HL' : ''}</p>
          {/if}
          <p class="definition">{definition}</p>
        </aside>
      {/if}
    </div>
  </div>
{/if}

<style>
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 300;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    border: none;
    background: rgba(8, 5, 3, 0.78);
    backdrop-filter: blur(3px);
    cursor: zoom-out;
    animation: fs-scrim 0.14s ease-out;
  }

  @keyframes fs-scrim {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .panel {
    display: flex;
    align-items: center;
    gap: 28px;
    cursor: default;
    animation: fs-inspect 0.18s cubic-bezier(0.2, 1, 0.3, 1);
  }

  @keyframes fs-inspect {
    from { transform: scale(0.86); opacity: 0; }
    to { transform: scale(1); opacity: 1; }
  }

  /*
   * 2.5x. The card keeps its own intrinsic 134x168 layout and is scaled as a
   * whole, so its type scale, gems and frame stay in exact proportion — the one
   * thing that would break "the cards are rock solid" is re-laying one out at a
   * different size.
   */
  .card-slot {
    flex: none;
    width: 335px;
    height: 420px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .card-slot :global(.card) {
    transform: scale(2.5);
    transform-origin: center;
  }

  /* Nothing about an inspected card is interactive, and its hover lift would
     fight the scale transform. */
  .card-slot :global(.card:hover) {
    transform: scale(2.5);
    box-shadow: 0 14px 26px rgba(0, 0, 0, .6), inset 0 1px 0 rgba(255, 232, 180, .28);
  }
  .card-slot :global(.card.playable) { animation: none; }

  .meaning {
    max-width: 380px;
    padding: 20px 22px;
    border: 1px solid var(--frame);
    border-radius: 8px;
    background: linear-gradient(180deg, rgba(38, 27, 16, 0.96), rgba(22, 15, 9, 0.96));
    box-shadow: 0 18px 40px rgba(0, 0, 0, 0.6);
  }

  h2 {
    margin: 0 0 4px;
    font-family: var(--display);
    font-size: 17px;
    font-weight: 700;
    letter-spacing: 0.06em;
    color: var(--gold-bright);
    text-wrap: balance;
  }

  .sections {
    margin: 0 0 12px;
    font-family: var(--display);
    font-size: 10px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--gold);
  }

  .definition {
    margin: 0;
    font-family: var(--body);
    font-size: 15px;
    line-height: 1.55;
    color: var(--text);
    text-wrap: pretty;
  }

  /* Portrait and small screens stack the definition under the card. iPad
     portrait is 768 wide, which cannot hold 335 + 28 + 380 side by side. */
  @media (max-width: 820px), (max-height: 620px) {
    .panel {
      flex-direction: column;
      gap: 14px;
    }
    .card-slot {
      width: 235px;
      height: 294px;
    }
    .card-slot :global(.card),
    .card-slot :global(.card:hover) { transform: scale(1.75); }
    .meaning {
      max-width: min(420px, 100%);
      padding: 14px 16px;
    }
    .definition { font-size: 14px; }
  }

  @media (prefers-reduced-motion: reduce) {
    .scrim, .panel { animation: none; }
  }
</style>
