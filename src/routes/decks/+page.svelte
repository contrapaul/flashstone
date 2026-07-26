<script lang="ts">
  import { onMount } from 'svelte';
  import CardPreview from '$lib/components/CardPreview.svelte';
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
    type Deck,
    type TemplateGroup
  } from '$lib/decks/deck';
  import { loadCollection, loadDeck, saveCollection, saveDeck } from '$lib/decks/storage';

  let collection: Collection | null = null;
  let deck: Deck = emptyDeck();
  let saved = false;

  let search = '';
  let costFilter = 'all';
  let rarityFilter: Rarity | 'all' = 'all';
  let selected = new Set<string>();

  const RARITIES: Rarity[] = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'];

  onMount(() => {
    collection = loadCollection();
    const stored = loadDeck();
    if (stored) deck = stored;
  });

  $: groups = collection ? groupByTemplate(deck, collection) : [];

  // Filters apply to the flashcards inside a template, so searching narrows
  // which versions count without hiding the card itself.
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

  /** Clicking a tile adds its default flashcard — the first, alphabetically. */
  function tileClick(group: TemplateGroup) {
    if (!collection) return;
    const preferred = group.cards[0];
    if (!canAdd(deck, collection, preferred.id)) return;
    add(preferred.id);
  }

  // ── Choosing a specific flashcard ─────────────────────────────
  // A template can have many flashcards bound to it. Clicking a tile adds the
  // default one; this popover is where you pick a different one instead, or
  // select versions to delete from the library.

  let popover: { group: TemplateGroup; rect: DOMRect } | null = null;
  let popoverEl: HTMLElement | undefined;

  function openPopover(event: MouseEvent, group: TemplateGroup) {
    event.stopPropagation();
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    popover = popover?.group.templateId === group.templateId ? null : { group, rect };
  }

  function closePopover() {
    popover = null;
  }

  function onWindowPointerDown(event: PointerEvent) {
    if (!popover || !popoverEl) return;
    if (!popoverEl.contains(event.target as Node)) closePopover();
  }

  function onWindowKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') closePopover();
  }

  const POPOVER_WIDTH = 260;

  $: popoverPos = popover
    ? {
        left: Math.min(Math.max(popover.rect.left, 10), window.innerWidth - POPOVER_WIDTH - 10),
        top: Math.min(popover.rect.bottom + 6, window.innerHeight - 220)
      }
    : null;

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
    closePopover();
  }
</script>

<svelte:head><title>Collection — Flashstone</title></svelte:head>

<svelte:window on:pointerdown={onWindowPointerDown} on:keydown={onWindowKeydown} />

<main>
  {#if !collection}
    <div class="empty-state">
      <h1>No cards yet</h1>
      <p>Import a flashcard export first and it becomes your collection.</p>
      <a class="cta" href="/import">Import flashcards</a>
    </div>
  {:else}
    <header>
      <h1>Collection</h1>
      <p class="sub">
        {collection.cards.length} flashcards across {distinct} cards. Max {MAX_COPIES} copies
        of a card, whichever flashcards you pick.
      </p>
    </header>

    <div class="layout">
      <section class="browser">
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
          <span class="shown">{visible.length} shown</span>
        </div>

        <div class="grid">
          {#each visible as group (group.templateId)}
            {@const preferred = group.cards[0]}
            {@const maxed = group.inDeck >= MAX_COPIES}
            <div class="tile">
              <button
                class="tile-btn"
                disabled={maxed}
                on:click={() => tileClick(group)}
                title={maxed ? `${preferred.name} — already at ${MAX_COPIES} copies` : `Add ${preferred.name}`}
              >
                <CardPreview card={preferred} playable={true} />
              </button>

              {#if group.inDeck > 0}
                <span class="badge" class:max={maxed}>{maxed ? 'MAX' : group.inDeck}</span>
              {/if}

              {#if group.cards.length > 1}
                <button
                  class="versions-btn"
                  on:click={(e) => openPopover(e, group)}
                  title="{group.cards.length} flashcards use this card"
                >
                  {group.cards.length}
                </button>
              {/if}
            </div>
          {:else}
            <p class="none">No cards match those filters.</p>
          {/each}
        </div>
      </section>

      <section class="deck-panel">
        <div class="col-head">
          <h2>Deck</h2>
          <span class="tally" class:full={deck.cardIds.length === DECK_SIZE}>
            {deck.cardIds.length}/{DECK_SIZE}
          </span>
        </div>

        {#if capacity < DECK_SIZE}
          <p class="warn">
            Collection can field {capacity}. Import {Math.ceil(DECK_SIZE / MAX_COPIES)}+ cards
            for a full deck.
          </p>
        {:else if problems.length > 0}
          <p class="warn">{problems.join(' ')}</p>
        {:else}
          <p class="ok">Legal — ready to play.</p>
        {/if}

        <ul class="deck-list">
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
            <li class="none">Empty. Click cards to add them, or Auto-build.</li>
          {/each}
        </ul>

        <div class="deck-actions">
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
      </section>
    </div>

    {#if popover && popoverPos && collection}
      <div class="popover" bind:this={popoverEl} style:left={`${popoverPos.left}px`} style:top={`${popoverPos.top}px`}>
        <div class="popover-head">{popover.group.cards.length} flashcards use this card</div>
        <ul class="versions">
          {#each popover.group.cards as version (version.id)}
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
      </div>
    {/if}
  {/if}
</main>

<style>
  main {
    max-width: 1400px;
    margin: 0 auto;
    padding: 20px 16px 60px;
  }

  header { margin-bottom: 16px; }

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
  button.danger {
    background: linear-gradient(180deg, var(--blood), var(--blood-deep));
    border-color: var(--blood-deep);
    color: #f7e3df;
  }

  .warn, .ok {
    font-family: var(--body);
    font-size: 13px;
    border-radius: 4px;
    padding: 8px 11px;
    margin: 0 0 12px;
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

  /* Wide browsing grid on the left, a narrow deck list on the right — the
     Hearthstone layout, in place of two equal, mostly-empty text columns. */
  .layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 300px;
    gap: 18px;
    align-items: start;
  }

  @media (max-width: 900px) {
    .layout { grid-template-columns: 1fr; }
  }

  .browser {
    background: linear-gradient(180deg, var(--panel), var(--ink-2));
    border: 1px solid var(--frame);
    border-radius: 4px;
    padding: 14px;
    box-shadow: inset 0 1px 0 rgba(240, 214, 138, 0.06);
  }

  .filters {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 14px;
    flex-wrap: wrap;
  }
  .filters input {
    flex: 1 1 200px;
    background: var(--ink);
    border: 1px solid var(--frame);
    border-radius: 3px;
    color: var(--text);
    padding: 7px 10px;
    font-family: var(--body);
    font-size: 13px;
  }
  .filters input:focus { outline: none; border-color: var(--frame-lit); }
  .filters select {
    background: var(--ink);
    border: 1px solid var(--frame);
    border-radius: 3px;
    color: var(--text);
    padding: 7px 8px;
    font-family: var(--body);
    font-size: 13px;
  }
  .shown {
    margin-left: auto;
    font-family: var(--display);
    font-size: 11px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--text-faint);
    white-space: nowrap;
  }

  /* The actual cards, at native size — this is the point: you can read a
     card's cost, stats, keywords and text at a glance, the way a physical
     collection binder or Hearthstone's set browser reads. */
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, 134px);
    justify-content: start;
    gap: 14px 10px;
    max-height: 74vh;
    overflow-y: auto;
    padding: 4px 2px 4px 4px;
  }

  .tile {
    position: relative;
    width: 134px;
  }

  .tile-btn {
    display: block;
    padding: 0;
    border: none;
    background: none;
    cursor: pointer;
  }
  .tile-btn:disabled { cursor: default; }
  .tile-btn:disabled :global(.card) { opacity: 0.5; }

  /* A grid of dozens of cards all mid-swirl reads as noise; the glow that
     marks a playable card in-hand stays, the motion doesn't. */
  .tile :global(.card.playable) { animation: none; }

  .badge {
    position: absolute;
    top: -6px;
    right: -6px;
    z-index: 5;
    min-width: 18px;
    height: 18px;
    padding: 0 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 9px;
    border: 1px solid #2f6b42;
    background: var(--good);
    color: #0b1f13;
    font-family: var(--display);
    font-size: 10px;
    font-weight: 700;
  }
  .badge.max { background: var(--blood); border-color: var(--blood-deep); color: #2a0d09; }

  /* The card's own art already fills every corner — cost top-left, attack
     bottom-left, health bottom-right, and the in-deck badge takes top-right.
     The only clear spot left is a tab on the right edge, at the card's
     vertical centre, poking out the same way the stat gems do. */
  .versions-btn {
    position: absolute;
    top: 50%;
    right: -6px;
    transform: translateY(-50%);
    z-index: 5;
    min-width: 20px;
    height: 16px;
    padding: 0 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--frame);
    border-radius: 8px;
    background: rgba(11, 8, 5, 0.9);
    color: var(--gold);
    font-family: var(--display);
    font-size: 9px;
    font-weight: 700;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.5);
  }
  .versions-btn:hover { border-color: var(--frame-lit); color: var(--gold-bright); }

  .none {
    grid-column: 1 / -1;
    font-family: var(--body);
    color: var(--text-faint);
    font-size: 13px;
    padding: 20px 4px;
  }

  .deck-panel {
    background: linear-gradient(180deg, var(--panel), var(--ink-2));
    border: 1px solid var(--frame);
    border-radius: 4px;
    padding: 14px;
    box-shadow: inset 0 1px 0 rgba(240, 214, 138, 0.06);
    position: sticky;
    top: 16px;
  }

  .col-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 10px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--rule);
  }

  .tally {
    font-family: var(--display);
    font-size: 13px;
    color: var(--text-dim);
    font-weight: 700;
  }
  .tally.full { color: var(--good); }

  .deck-list {
    list-style: none;
    margin: 0 0 12px;
    padding: 0;
    max-height: 56vh;
    overflow-y: auto;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    background: rgba(11, 8, 5, 0.55);
    border: 1px solid transparent;
    border-radius: 3px;
    padding: 7px 8px;
    margin-bottom: 4px;
    font-family: var(--body);
    font-size: 13px;
    text-align: left;
    color: var(--text);
  }
  .row:hover { border-color: var(--frame-lit); background: rgba(74, 54, 32, 0.35); }

  .cost {
    flex: 0 0 20px;
    height: 20px;
    background: linear-gradient(180deg, var(--mana-lit), var(--mana));
    clip-path: polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%);
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--display);
    font-weight: 700;
    font-size: 10px;
    color: #06121f;
  }

  .name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .stat { color: var(--text-dim); font-variant-numeric: tabular-nums; font-size: 11px; }
  .count { color: var(--attack); font-weight: 700; }

  .deck-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .deck-actions button { flex: 1 1 auto; }

  /* The version picker — a small anchored panel, not a row that pushes the
     grid around every time you open one. */
  .popover {
    position: fixed;
    z-index: 300;
    width: 260px;
    max-height: 300px;
    overflow-y: auto;
    background: linear-gradient(180deg, var(--panel), var(--ink-2));
    border: 1px solid var(--frame-lit);
    border-radius: 6px;
    box-shadow: 0 16px 32px rgba(0, 0, 0, 0.6);
    padding: 8px;
  }

  .popover-head {
    font-family: var(--display);
    font-size: 10px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-faint);
    padding: 2px 4px 8px;
    border-bottom: 1px solid var(--rule);
    margin-bottom: 6px;
  }

  .versions {
    list-style: none;
    margin: 0;
    padding: 0;
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
    padding: 4px 6px;
    border: none;
    border-radius: 3px;
    background: none;
    min-width: 0;
    text-align: left;
    text-transform: none;
    letter-spacing: 0;
    font-weight: 400;
  }
  .version-add:hover:not(:disabled) { background: rgba(74, 54, 32, 0.4); }
  .version-add:disabled { opacity: 0.45; cursor: default; }

  .v-name {
    font-family: var(--body);
    font-size: 13px;
    color: var(--text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .v-answer {
    font-family: var(--body);
    font-size: 11px;
    color: var(--text-faint);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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
