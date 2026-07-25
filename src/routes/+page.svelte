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
      title: 'Collection',
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
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 14px;
  }

  @media (max-width: 620px) {
    .menu { grid-template-columns: 1fr; }
    h1 { font-size: 40px; }
  }

  a {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 20px 22px;
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

  a.primary {
    background: linear-gradient(180deg, #4a3620, #2a1d10);
    border-color: #8a6c3c;
  }
  a.primary .title { color: var(--gold-bright); }

  .title {
    font-family: var(--display);
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--gold);
  }

  .blurb {
    font-family: var(--body);
    font-size: 14px;
    line-height: 1.45;
    color: var(--text-dim);
  }
</style>
