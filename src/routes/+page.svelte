<script lang="ts">
  import { onMount } from 'svelte';
  import { DECK_SIZE, isLegal, type Deck } from '$lib/decks/deck';
  import { distinctCount } from '$lib/decks/deck';
  import { ALL_CARDS } from '$lib/data/cards';
  import { starterCollection } from '$lib/data/starter';
  import type { Owned } from '$lib/collection/owned';
  import { loadCollection, loadDeck } from '$lib/decks/storage';

  let owned: Owned = {};
  let deck: Deck | null = null;
  let ready = false;

  onMount(() => {
    owned = loadCollection() ?? starterCollection();
    deck = loadDeck();
    ready = true;
  });

  $: deckPlayable = Boolean(deck && isLegal(deck, owned));

  $: status = !ready
    ? ''
    : deckPlayable
      ? `Playing “${deck?.name}” — ${DECK_SIZE} cards.`
      : `${distinctCount(owned)} of ${ALL_CARDS.length} cards collected — playing the starter deck.`;

  const menu = [
    { href: '/play', title: 'Play' },
    { href: '/decks', title: 'Collection' },
    { href: '/review', title: 'Review' },
    { href: '/learn', title: 'Learn to play' }
  ];
</script>

<svelte:head><title>Flashstone</title></svelte:head>

<main>
  <section class="hero">
    <h1>Flashstone</h1>
    <p class="tagline">Design &amp; Technology, as a card game.</p>
    <p class="status" class:playable={deckPlayable}>{status}</p>
  </section>

  <nav class="menu">
    {#each menu as item}
      <a href={item.href} class:primary={item.title === 'Play'}>
        <span class="title">{item.title}</span>
      </a>
    {/each}
  </nav>
</main>

<style>
  main {
    position: relative;
    min-height: calc(100vh - 55px);
    box-sizing: border-box;
    max-width: 780px;
    margin: 0 auto;
    padding: 72px 16px 60px;
  }

  .hero { text-align: center; margin-bottom: 44px; }

  h1 {
    font-family: var(--display);
    font-size: 58px;
    font-weight: 700;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    margin: 0;
    color: var(--gold-bright);
    text-shadow: 0 0 34px rgba(232, 197, 106, 0.32);
  }

  .tagline {
    font-family: var(--body);
    font-size: 17px;
    font-style: italic;
    color: var(--text-dim);
    margin: 10px 0 0;
  }

  .status {
    font-family: var(--display);
    font-size: 10.5px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--text-faint);
    margin: 18px 0 0;
    min-height: 16px;
  }
  .status.playable { color: var(--good); }

  .menu {
    display: flex;
    flex-direction: column;
    gap: 12px;
    max-width: 420px;
    margin: 0 auto;
  }

  @media (max-width: 620px) {
    h1 { font-size: 40px; }
  }

  a {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px 24px;
    border: 1px solid var(--frame);
    border-radius: 4px;
    background: linear-gradient(180deg, var(--panel), var(--ink-2));
    color: inherit;
    box-shadow: inset 0 1px 0 rgba(240, 214, 138, 0.06);
    transition: border-color 0.14s, transform 0.14s, box-shadow 0.14s;
  }

  a:hover {
    border-color: var(--frame-lit);
    transform: translateY(-2px);
    box-shadow: 0 6px 22px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(240, 214, 138, 0.12);
  }

  a:hover .title { color: var(--gold-bright); }

  a.primary {
    background: linear-gradient(180deg, #4a3620, #2a1d10);
    border-color: #8a6c3c;
  }
  a.primary .title { color: var(--gold-bright); }

  .title {
    font-family: var(--display);
    font-size: 22px;
    font-weight: 600;
    letter-spacing: 0.2em;
    /* The tracking is on the right of each glyph; nudge back to stay centred. */
    text-indent: 0.2em;
    text-transform: uppercase;
    text-align: center;
    color: var(--gold);
    transition: color 0.14s;
  }

  @media (max-width: 620px) {
    .title { font-size: 18px; }
  }
</style>
