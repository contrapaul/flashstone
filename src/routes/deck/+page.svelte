<script lang="ts">
  import { onMount } from 'svelte';
  import {
    DECK_SIZE,
    MAX_COPIES,
    addCard,
    autoBuild,
    canAdd,
    countOf,
    deckEntries,
    deckProblems,
    emptyDeck,
    maxDeckSize,
    removeCard,
    type Collection,
    type Deck
  } from '$lib/decks/deck';
  import { loadCollection, loadDeck, saveDeck } from '$lib/decks/storage';

  let collection: Collection | null = null;
  let deck: Deck = emptyDeck();
  let search = '';
  let saved = false;

  onMount(() => {
    collection = loadCollection();
    const stored = loadDeck();
    if (stored) deck = stored;
  });

  $: pool = collection
    ? collection.cards
        .filter((c) => c.name.toLowerCase().includes(search.trim().toLowerCase()))
        .sort((a, b) => a.cost - b.cost || a.name.localeCompare(b.name))
    : [];

  $: entries = collection ? deckEntries(deck, collection) : [];
  $: problems = collection ? deckProblems(deck, collection) : [];
  $: capacity = collection ? maxDeckSize(collection) : 0;

  function add(id: string) {
    deck = addCard(deck, id);
    saved = false;
  }

  function remove(id: string) {
    deck = removeCard(deck, id);
    saved = false;
  }

  function build() {
    if (!collection) return;
    deck = autoBuild(collection);
    saved = false;
  }

  function clear() {
    deck = { ...deck, cardIds: [] };
    saved = false;
  }

  function persist() {
    saveDeck(deck);
    saved = true;
  }
</script>

<svelte:head><title>Deck — Flashstone</title></svelte:head>

<main>
  {#if !collection}
    <div class="empty-state">
      <h1>No cards yet</h1>
      <p>Import a flashcard export first and it becomes your collection.</p>
      <a class="cta" href="/import">Import flashcards</a>
    </div>
  {:else}
    <header>
      <div>
        <h1>Deck builder</h1>
        <p class="sub">
          {collection.cards.length} cards in “{collection.name}”. Max {MAX_COPIES} copies of
          any card.
        </p>
      </div>
      <div class="controls">
        <button class="ghost" on:click={build}>Auto-build</button>
        <button class="ghost" on:click={clear} disabled={deck.cardIds.length === 0}>
          Clear
        </button>
        <button on:click={persist} disabled={problems.length > 0}>
          {saved ? 'Saved' : 'Save deck'}
        </button>
      </div>
    </header>

    {#if capacity < DECK_SIZE}
      <p class="warn">
        Your collection can only field {capacity} cards. Import at least
        {Math.ceil(DECK_SIZE / MAX_COPIES)} flashcards to build a full deck.
      </p>
    {:else if problems.length > 0}
      <p class="warn">{problems.join(' ')}</p>
    {:else}
      <p class="ok">Deck is legal and ready to play.</p>
    {/if}

    <div class="columns">
      <section class="pool">
        <div class="col-head">
          <h2>Collection</h2>
          <input placeholder="Search cards…" bind:value={search} />
        </div>
        <ul>
          {#each pool as card (card.id)}
            {@const inDeck = countOf(deck, card.id)}
            <li>
              <button
                class="row"
                class:maxed={!canAdd(deck, card.id)}
                on:click={() => add(card.id)}
                title={card.description}
              >
                <span class="cost">{card.cost}</span>
                <span class="name">{card.name}</span>
                {#if card.keywords.length > 0}
                  <span class="kw">{card.keywords.join(' ')}</span>
                {/if}
                <span class="rarity {card.rarity.toLowerCase()}">{card.rarity[0]}</span>
                <span class="stat">{card.attack}/{card.health}</span>
                {#if inDeck > 0}<span class="have">{inDeck}</span>{/if}
              </button>
            </li>
          {:else}
            <li class="none">No cards match “{search}”.</li>
          {/each}
        </ul>
      </section>

      <section class="deck">
        <div class="col-head">
          <h2>Deck</h2>
          <span class="tally" class:full={deck.cardIds.length === DECK_SIZE}>
            {deck.cardIds.length}/{DECK_SIZE}
          </span>
        </div>
        <ul>
          {#each entries as entry (entry.card.id)}
            <li>
              <button class="row" on:click={() => remove(entry.card.id)} title="Remove one">
                <span class="cost">{entry.card.cost}</span>
                <span class="name">{entry.card.name}</span>
                <span class="stat">{entry.card.attack}/{entry.card.health}</span>
                <span class="count">×{entry.count}</span>
              </button>
            </li>
          {:else}
            <li class="none">Empty. Click cards to add them, or hit Auto-build.</li>
          {/each}
        </ul>
      </section>
    </div>
  {/if}
</main>

<style>
  main {
    max-width: 1100px;
    margin: 0 auto;
    padding: 20px 16px 60px;
  }

  header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
  }

  h1 { font-size: 22px; margin: 0; }
  h2 { font-size: 14px; margin: 0; }
  .sub { color: #9ca3cf; font-size: 13px; margin: 4px 0 0; }

  .controls { display: flex; gap: 8px; }

  button {
    padding: 8px 16px;
    border-radius: 8px;
    border: none;
    background: #4f46e5;
    color: #fff;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
  }
  button.ghost { background: #1e1e3c; color: #cbd5f5; border: 1px solid #3f3f6b; }
  button:disabled { background: #2a2a4a; color: #6b7280; cursor: default; }

  .warn, .ok {
    font-size: 13px;
    border-radius: 8px;
    padding: 9px 12px;
    margin: 16px 0 0;
  }
  .warn { background: #2a2416; border: 1px solid #78581d; color: #fbbf24; }
  .ok { background: #14251d; border: 1px solid #1f5f43; color: #6ee7b7; }

  .columns {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    margin-top: 18px;
  }

  @media (max-width: 780px) {
    .columns { grid-template-columns: 1fr; }
  }

  section {
    background: #16162e;
    border: 1px solid #2a2a4a;
    border-radius: 10px;
    padding: 12px;
  }

  .col-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 10px;
  }

  input {
    background: #1e1e3c;
    border: 1px solid #3f3f6b;
    border-radius: 6px;
    color: #e5e7eb;
    padding: 5px 8px;
    font-size: 12px;
    max-width: 160px;
  }

  .tally { font-size: 13px; color: #9ca3cf; font-weight: 600; }
  .tally.full { color: #6ee7b7; }

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: 60vh;
    overflow-y: auto;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    background: #12122a;
    border: 1px solid transparent;
    border-radius: 6px;
    padding: 6px 8px;
    margin-bottom: 4px;
    font-size: 12px;
    text-align: left;
    font-weight: 400;
    color: #e5e7eb;
  }
  .row:hover { border-color: #4f46e5; background: #1a1a38; }
  .row.maxed { opacity: 0.45; }

  .cost {
    flex: 0 0 20px;
    height: 20px;
    border-radius: 50%;
    background: #4f46e5;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    font-size: 11px;
  }

  .name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .kw { font-size: 9px; background: #3b3b6d; padding: 1px 4px; border-radius: 3px; }
  .stat { color: #9ca3cf; font-variant-numeric: tabular-nums; }
  .count { color: #fbbf24; font-weight: 700; }
  .have { color: #6ee7b7; font-weight: 700; }

  .rarity { font-weight: 700; font-size: 10px; }
  .rarity.common { color: #6b7280; }
  .rarity.uncommon { color: #22c55e; }
  .rarity.rare { color: #3b82f6; }
  .rarity.epic { color: #a855f7; }
  .rarity.legendary { color: #ff8c00; }

  .none { color: #3f3f6b; font-size: 12px; padding: 8px; }

  .empty-state { text-align: center; padding: 60px 20px; }
  .empty-state p { color: #9ca3cf; font-size: 14px; }
  .cta {
    display: inline-block;
    margin-top: 12px;
    padding: 10px 20px;
    background: #4f46e5;
    color: #fff;
    border-radius: 8px;
    text-decoration: none;
    font-size: 14px;
    font-weight: 600;
  }
</style>
