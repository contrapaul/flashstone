<script lang="ts">
  import { onMount } from 'svelte';
  import type { Rarity } from '../../types/cards';
  import {
    DECK_SIZE,
    MAX_COPIES,
    addCard,
    autoBuild,
    canAdd,
    deckEntries,
    deckProblems,
    emptyDeck,
    groupByTemplate,
    maxDeckSize,
    pruneDeck,
    removeCard,
    removeCards,
    templateCount,
    type Collection,
    type Deck
  } from '$lib/decks/deck';
  import { loadCollection, loadDeck, saveCollection, saveDeck } from '$lib/decks/storage';

  let collection: Collection | null = null;
  let deck: Deck = emptyDeck();
  let saved = false;

  let search = '';
  let costFilter = 'all';
  let rarityFilter: Rarity | 'all' = 'all';
  let expanded: string | null = null;
  let selected = new Set<string>();

  const RARITIES: Rarity[] = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'];

  onMount(() => {
    collection = loadCollection();
    const stored = loadDeck();
    if (stored) deck = stored;
  });

  $: groups = collection ? groupByTemplate(deck, collection) : [];

  // Filters apply to the flashcards inside a template, so searching narrows
  // which versions you see without hiding the card itself.
  $: visible = groups
    .map((group) => {
      const term = search.trim().toLowerCase();
      const cards = term
        ? group.cards.filter(
            (c) =>
              c.name.toLowerCase().includes(term) ||
              c.description.toLowerCase().includes(term)
          )
        : group.cards;
      return { ...group, cards };
    })
    .filter((group) => group.cards.length > 0)
    .filter((group) => costFilter === 'all' || group.sample.cost === Number(costFilter))
    .filter((group) => rarityFilter === 'all' || group.sample.rarity === rarityFilter);

  $: entries = collection ? deckEntries(deck, collection) : [];
  $: problems = collection ? deckProblems(deck, collection) : [];
  $: capacity = collection ? maxDeckSize(collection) : 0;
  $: distinct = collection ? templateCount(collection) : 0;

  function add(id: string) {
    if (!collection) return;
    deck = addCard(deck, collection, id);
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

  function toggleExpand(templateId: string) {
    expanded = expanded === templateId ? null : templateId;
  }

  function toggleSelect(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selected = next;
  }

  /** Deletion is always explicit — nothing is ever removed by importing. */
  function deleteSelected() {
    if (!collection || selected.size === 0) return;
    const count = selected.size;
    if (!confirm(`Delete ${count} card${count === 1 ? '' : 's'} from your library?`)) return;

    const next = removeCards(collection, selected);
    collection = next;
    deck = pruneDeck(deck, next);
    saveCollection(next);
    saveDeck(deck);
    selected = new Set();
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
          {collection.cards.length} flashcards across {distinct} cards. Max {MAX_COPIES} copies
          of a card, whichever flashcards you pick.
        </p>
      </div>
      <div class="controls">
        {#if selected.size > 0}
          <button class="danger" on:click={deleteSelected}>Delete {selected.size}</button>
        {/if}
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
          <span class="tally">{visible.length} shown</span>
        </div>

        <div class="filters">
          <input placeholder="Search question or answer…" bind:value={search} />
          <select bind:value={costFilter} aria-label="Filter by cost">
            <option value="all">Any cost</option>
            {#each [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as cost}
              <option value={String(cost)}>{cost} mana</option>
            {/each}
          </select>
          <select bind:value={rarityFilter} aria-label="Filter by rarity">
            <option value="all">Any rarity</option>
            {#each RARITIES as rarity}<option value={rarity}>{rarity}</option>{/each}
          </select>
        </div>

        <ul>
          {#each visible as group (group.templateId)}
            {@const card = group.sample}
            <li>
              <div class="row group" class:maxed={group.inDeck >= MAX_COPIES}>
                <button
                  class="pick"
                  disabled={!canAdd(deck, collection, group.cards[0].id)}
                  on:click={() => add(group.cards[0].id)}
                  title="Add {group.cards[0].name}"
                >
                  <span class="cost">{card.cost}</span>
                  <span class="stat big">{card.attack}/{card.health}</span>
                  <span class="rarity {card.rarity.toLowerCase()}">{card.rarity[0]}</span>
                  {#if card.keywords.length > 0}
                    <span class="kw">{card.keywords.join(' ')}</span>
                  {/if}
                  <span class="name">{group.cards[0].name}</span>
                </button>

                <button
                  class="expand"
                  on:click={() => toggleExpand(group.templateId)}
                  title="Choose which flashcard to use"
                >
                  {group.cards.length}
                  {expanded === group.templateId ? '▾' : '▸'}
                </button>

                {#if group.inDeck > 0}<span class="have">{group.inDeck}</span>{/if}
              </div>

              {#if expanded === group.templateId}
                <ul class="versions">
                  {#each group.cards as version (version.id)}
                    <li>
                      <label class="version">
                        <input
                          type="checkbox"
                          checked={selected.has(version.id)}
                          on:change={() => toggleSelect(version.id)}
                        />
                        <button
                          class="version-add"
                          disabled={!canAdd(deck, collection, version.id)}
                          on:click={() => add(version.id)}
                        >
                          <span class="v-name">{version.name}</span>
                          <span class="v-answer">{version.description}</span>
                        </button>
                      </label>
                    </li>
                  {/each}
                </ul>
              {/if}
            </li>
          {:else}
            <li class="none">No cards match those filters.</li>
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
  .row.maxed { opacity: 0.45; }

  .filters {
    display: flex;
    gap: 8px;
    margin-bottom: 10px;
    flex-wrap: wrap;
  }
  .filters input { flex: 1 1 150px; max-width: none; }
  .filters select {
    background: var(--ink);
    border: 1px solid var(--frame);
    border-radius: 3px;
    color: var(--text);
    padding: 6px 8px;
    font-family: var(--body);
    font-size: 13px;
  }

  /* A template row: one game card, however many flashcards wear it. */
  .row.group { padding: 0; gap: 0; }

  .pick,
  .expand,
  .version-add {
    background: none;
    border: none;
    font-family: var(--body);
    color: var(--text);
    text-align: left;
    cursor: pointer;
    text-transform: none;
    letter-spacing: 0;
    font-weight: 400;
  }

  .pick {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 7px 9px;
    font-size: 14px;
    min-width: 0;
  }
  .pick:disabled { cursor: default; }

  .stat.big {
    font-family: var(--display);
    font-weight: 700;
    color: var(--text);
    flex: 0 0 auto;
  }

  .expand {
    flex: 0 0 auto;
    padding: 7px 10px;
    border-left: 1px solid var(--rule);
    font-family: var(--display);
    font-size: 11px;
    color: var(--text-dim);
  }
  .expand:hover { color: var(--gold-bright); }

  .row.group .have { padding-right: 9px; }

  .versions {
    list-style: none;
    margin: 2px 0 8px 20px;
    padding: 0 0 0 10px;
    border-left: 1px solid var(--rule);
    max-height: none;
    overflow: visible;
  }

  .version {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 3px 0;
  }
  .version input { width: 13px; height: 13px; flex: 0 0 auto; margin-top: 4px; }

  .version-add {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 1px;
    padding: 2px 6px;
    border-radius: 3px;
    min-width: 0;
  }
  .version-add:hover:not(:disabled) { background: rgba(74, 54, 32, 0.4); }
  .version-add:disabled { opacity: 0.45; cursor: default; }

  .v-name {
    font-size: 13px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .v-answer {
    font-size: 11px;
    color: var(--text-faint);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  button.danger {
    background: linear-gradient(180deg, var(--blood), var(--blood-deep));
    border-color: var(--blood-deep);
    color: #f7e3df;
  }

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
