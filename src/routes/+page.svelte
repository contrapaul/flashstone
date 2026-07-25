<script lang="ts">
  import { onMount } from 'svelte';
  import { DECK_SIZE, isLegal, type Collection, type Deck } from '$lib/decks/deck';
  import { loadCollection, loadDeck } from '$lib/decks/storage';

  let collection: Collection | null = null;
  let deck: Deck | null = null;
  let ready = false;

  onMount(() => {
    collection = loadCollection();
    deck = loadDeck();
    ready = true;
  });

  $: deckPlayable = Boolean(collection && deck && isLegal(deck, collection));

  $: status = !ready
    ? ''
    : deckPlayable
      ? `Playing “${deck?.name}” — ${DECK_SIZE} cards.`
      : collection
        ? `${collection.cards.length} cards imported, but no legal deck yet.`
        : 'No cards imported yet — you can still try the demo deck.';

  const menu = [
    {
      href: '/play',
      title: 'Play',
      blurb: 'Take on the AI with your deck.'
    },
    {
      href: '/decks',
      title: 'Decks',
      blurb: 'Build a deck from your collection, or auto-build one.'
    },
    {
      href: '/import',
      title: 'Import',
      blurb: 'Turn a CSV or Markdown flashcard export into cards.'
    },
    {
      href: '/learn',
      title: 'Learn to play',
      blurb: 'The rules, the keywords, and how your cards are made.'
    }
  ];
</script>

<svelte:head><title>Flashstone</title></svelte:head>

<main>
  <section class="hero">
    <h1>Flashstone</h1>
    <p class="tagline">Your flashcards, as a card game.</p>
    <p class="status" class:playable={deckPlayable}>{status}</p>
  </section>

  <nav class="menu">
    {#each menu as item}
      <a href={item.href} class:primary={item.title === 'Play'}>
        <span class="title">{item.title}</span>
        <span class="blurb">{item.blurb}</span>
      </a>
    {/each}
  </nav>
</main>

<style>
  main {
    max-width: 760px;
    margin: 0 auto;
    padding: 56px 16px 60px;
  }

  .hero { text-align: center; margin-bottom: 36px; }

  h1 {
    font-size: 44px;
    margin: 0;
    letter-spacing: -0.01em;
  }

  .tagline {
    color: #9ca3cf;
    font-size: 15px;
    margin: 8px 0 0;
  }

  .status {
    font-size: 12px;
    color: #6b7280;
    margin: 14px 0 0;
    min-height: 16px;
  }
  .status.playable { color: #6ee7b7; }

  .menu {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
  }

  @media (max-width: 620px) {
    .menu { grid-template-columns: 1fr; }
  }

  a {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 18px 20px;
    border-radius: 10px;
    background: #16162e;
    border: 1px solid #2a2a4a;
    text-decoration: none;
    color: inherit;
    transition: border-color 0.12s, transform 0.12s, background 0.12s;
  }

  a:hover {
    border-color: #4f46e5;
    background: #1a1a38;
    transform: translateY(-2px);
  }

  a.primary {
    background: #2b2596;
    border-color: #4f46e5;
  }
  a.primary:hover { background: #352ec0; }

  .title { font-size: 17px; font-weight: 600; }
  .blurb { font-size: 12px; color: #9ca3cf; line-height: 1.4; }
  a.primary .blurb { color: #c7d2fe; }
</style>
