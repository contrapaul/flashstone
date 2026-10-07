<script lang="ts">
  import CardBack from './CardBack.svelte';

  /**
   * A player's deck, on the right edge of the table.
   *
   * Its **thickness** is its count — a stack of edges that thins as the match
   * goes on — and at three or fewer it flickers red: fatigue is close. Your own
   * draws fly out of it (the director measures it through `el`).
   */
  export let count: number;
  export let backId = 'default';
  export let label = 'Deck';
  export let el: HTMLElement | undefined = undefined;

  /** One visible edge per five cards, up to six. */
  $: layers = Math.min(6, Math.ceil(count / 5));
  $: edges = Array.from({ length: layers }, (_, i) => {
    const o = (i + 1) * 2;
    return `${o}px ${o}px 0 -1px ${i % 2 ? '#2c1f12' : '#4a3620'}`;
  });
  $: shadow = [...edges, '0 10px 18px rgba(0, 0, 0, .6)'].join(', ');
</script>

<div
  class="deck-pile"
  class:low={count > 0 && count <= 3}
  class:empty={count === 0}
  bind:this={el}
  style:box-shadow={shadow}
  title={`${label}: ${count} ${count === 1 ? 'card' : 'cards'}`}
>
  {#if count > 0}<CardBack {backId} scale={0.42} />{/if}
  <span class="count">{count}</span>
</div>

<style>
  .deck-pile {
    position: relative;
    width: 56px;
    height: 70px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    border: 1px solid #7a5c30;
    background: linear-gradient(180deg, #4a3620, #241810);
    overflow: hidden;
  }

  /* CardBack scales from its own corner; centred here instead. */
  .deck-pile :global(.back) { position: absolute; transform-origin: center; }

  .count {
    position: relative;
    z-index: 1;
    min-width: 22px;
    padding: 1px 5px;
    border-radius: 9px;
    background: rgba(12, 8, 4, .78);
    font-family: var(--display);
    font-size: 13px;
    font-weight: 700;
    text-align: center;
    color: #f0dcae;
  }

  .deck-pile.empty { background: rgba(20, 14, 8, .4); border-style: dashed; }
  .deck-pile.empty .count { color: #c9b4ff; }

  /* Three or fewer: the pile flickers — fatigue is close. */
  .deck-pile.low { animation: fs-low-deck 1.4s ease-in-out infinite; }
  .deck-pile.low .count { color: #ff8a70; }

  @keyframes fs-low-deck {
    0%, 100% { outline: 2px solid rgba(255, 90, 70, 0); outline-offset: 2px; }
    50% { outline: 2px solid rgba(255, 90, 70, .85); outline-offset: 4px; }
  }
</style>
