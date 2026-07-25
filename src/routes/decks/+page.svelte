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

<svelte:head><title>Decks — Flashstone</title></svelte:head>

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

  h1 {
    font-family: var(--display);
    font-size: 26px;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--gold-bright);
    margin: 0;
  }

  h2 {
    font-family: var(--display);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--gold);
    margin: 0;
  }

  .sub {
    font-family: var(--body);
    color: var(--text-dim);
    font-size: 14px;
    margin: 6px 0 0;
  }

  .controls { display: flex; gap: 10px; }

  button {
    padding: 9px 18px;
    border: 1px solid #8a6c3c;
    border-radius: 4px;
    background: linear-gradient(180deg, var(--gold), #9c7c3c);
    color: #2a1d10;
    font-family: var(--display);
    font-size: 10.5px;
    font-weight: 700;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    cursor: pointer;
  }
  button:hover:not(:disabled) {
    background: linear-gradient(180deg, var(--gold-bright), var(--gold));
  }
  button.ghost {
    background: linear-gradient(180deg, var(--panel), var(--ink-2));
    border-color: var(--frame);
    color: var(--gold);
  }
  button.ghost:hover:not(:disabled) { border-color: var(--frame-lit); color: var(--gold-bright); }
  button:disabled {
    background: var(--ink-2);
    border-color: var(--rule);
    color: var(--text-faint);
    cursor: default;
  }

  .warn, .ok {
    font-family: var(--body);
    font-size: 14px;
    border-radius: 4px;
    padding: 10px 13px;
    margin: 18px 0 0;
  }
  .warn {
    background: rgba(240, 184, 64, 0.08);
    border: 1px solid #78581d;
    color: var(--attack);
  }
  .ok {
    background: rgba(126, 214, 140, 0.08);
    border: 1px solid #2f6b42;
    color: var(--good);
  }

  .columns {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 18px;
    margin-top: 20px;
  }

  @media (max-width: 780px) {
    .columns { grid-template-columns: 1fr; }
  }

  section {
    background: linear-gradient(180deg, var(--panel), var(--ink-2));
    border: 1px solid var(--frame);
    border-radius: 4px;
    padding: 14px;
    box-shadow: inset 0 1px 0 rgba(240, 214, 138, 0.06);
  }

  .col-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 12px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--rule);
  }

  input {
    background: var(--ink);
    border: 1px solid var(--frame);
    border-radius: 3px;
    color: var(--text);
    padding: 6px 9px;
    font-family: var(--body);
    font-size: 13px;
    max-width: 170px;
  }
  input:focus { outline: none; border-color: var(--frame-lit); }

  .tally {
    font-family: var(--display);
    font-size: 13px;
    color: var(--text-dim);
    font-weight: 700;
  }
  .tally.full { color: var(--good); }

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
    gap: 9px;
    width: 100%;
    background: rgba(11, 8, 5, 0.55);
    border: 1px solid transparent;
    border-radius: 3px;
    padding: 7px 9px;
    margin-bottom: 4px;
    font-family: var(--body);
    font-size: 14px;
    text-align: left;
    color: var(--text);
  }
  .row:hover { border-color: var(--frame-lit); background: rgba(74, 54, 32, 0.35); }
  .row.maxed { opacity: 0.4; }

  .cost {
    flex: 0 0 22px;
    height: 22px;
    background: linear-gradient(180deg, var(--mana-lit), var(--mana));
    clip-path: polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%);
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--display);
    font-weight: 700;
    font-size: 11px;
    color: #06121f;
  }

  .name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .kw {
    font-family: var(--display);
    font-size: 8.5px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    background: rgba(107, 79, 46, 0.5);
    border: 1px solid var(--frame);
    color: var(--gold);
    padding: 1px 5px;
    border-radius: 2px;
  }

  .stat { color: var(--text-dim); font-variant-numeric: tabular-nums; }
  .count { color: var(--attack); font-weight: 700; }
  .have { color: var(--good); font-weight: 700; }

  .rarity {
    font-family: var(--display);
    font-weight: 700;
    font-size: 10px;
  }
  .rarity.common { color: #b9ac93; }
  .rarity.uncommon { color: #5fbf6a; }
  .rarity.rare { color: #4a8fe0; }
  .rarity.epic { color: #a457e8; }
  .rarity.legendary { color: #f0a020; }

  .none {
    font-family: var(--body);
    color: var(--text-faint);
    font-size: 13px;
    padding: 10px;
  }

  .empty-state { text-align: center; padding: 80px 20px; }
  .empty-state p {
    font-family: var(--body);
    color: var(--text-dim);
    font-size: 16px;
  }
  .cta {
    display: inline-block;
    margin-top: 16px;
    padding: 11px 24px;
    border: 1px solid #8a6c3c;
    border-radius: 4px;
    background: linear-gradient(180deg, var(--gold), #9c7c3c);
    color: #2a1d10;
    font-family: var(--display);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.16em;
    text-transform: uppercase;
  }
  .cta:hover { background: linear-gradient(180deg, var(--gold-bright), var(--gold)); }
</style>
