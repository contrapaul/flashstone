<script lang="ts">
  import { onMount } from 'svelte';
  import CardPreview from '$lib/components/CardPreview.svelte';
  import CardInspector from '$lib/components/CardInspector.svelte';
  import type { Card, Rarity } from '../../types/cards';
  import { ALL_CARDS } from '$lib/data/cards';
  import { ownedCount, isGold, type Owned } from '$lib/collection/owned';
  import {
    DECK_SIZE,
    MAX_COPIES,
    addCard,
    allowedCopies,
    autoBuild,
    canAdd,
    copyLimitFor,
    countOf,
    deckEntries,
    deckProblems,
    distinctCount,
    emptyDeck,
    maxDeckSize,
    pruneDeck,
    removeCard,
    type Deck
  } from '$lib/decks/deck';
  import { cacheOwned, loadPlayer, savePlayerDeck } from '$lib/collection/sync';

  let owned: Owned = {};
  let deck: Deck = emptyDeck();
  let saved = false;
  let deckId: string | null = null;
  let signedIn = false;
  let saveError: string | null = null;

  let search = '';
  let costFilter = 'all';
  let rarityFilter: Rarity | 'all' = 'all';
  let sectionFilter = 'all';
  let ownedOnly = false;

  const RARITIES: Rarity[] = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'];

  /** Every syllabus section in the set, in syllabus order. */
  const SECTIONS = [...new Set(ALL_CARDS.flatMap((c) => c.sections ?? []))].sort();

  onMount(async () => {
    const player = await loadPlayer();
    owned = player.owned;
    deckId = player.deckId;
    signedIn = player.signedIn;
    // A saved deck can outlive a card leaving the set, or copies being spent.
    if (player.deck) deck = pruneDeck(player.deck, owned);
    // Keep an offline copy, so signing out does not empty the shelves.
    cacheOwned(owned);
  });

  // The whole set is browsable, not just what you own — seeing the cards you are
  // missing is half the point of a collection.
  $: visible = ALL_CARDS.filter((card) => {
    const term = search.trim().toLowerCase();
    if (
      term &&
      !card.name.toLowerCase().includes(term) &&
      !(card.definition ?? '').toLowerCase().includes(term)
    ) {
      return false;
    }
    if (costFilter !== 'all' && card.cost !== Number(costFilter)) return false;
    if (rarityFilter !== 'all' && card.rarity !== rarityFilter) return false;
    if (sectionFilter !== 'all' && !(card.sections ?? []).includes(sectionFilter)) return false;
    if (ownedOnly && ownedCount(owned, card.id) === 0) return false;
    return true;
  });

  $: entries = deckEntries(deck);
  $: problems = deckProblems(deck, owned);
  $: capacity = maxDeckSize(owned);
  $: distinct = distinctCount(owned);

  function add(id: string) {
    deck = addCard(deck, owned, id);
    saved = false;
  }

  function remove(id: string) {
    deck = removeCard(deck, id);
    saved = false;
  }

  function build() {
    deck = autoBuild(owned);
    saved = false;
  }

  function clear() {
    deck = { ...deck, cardIds: [] };
    saved = false;
  }

  async function persist() {
    saveError = null;
    const result = await savePlayerDeck(deck, deckId, signedIn);
    deckId = result.deckId;
    saved = result.ok;
    saveError = result.error ?? null;
  }

  /** Why a card cannot be added — shown as the tile's tooltip. */
  function tileTitle(card: Card): string {
    const have = ownedCount(owned, card.id);
    if (have === 0) return `${card.name} — not in your collection`;
    if (countOf(deck, card.id) >= allowedCopies(owned, card.id)) {
      return card.rarity === 'Legendary'
        ? `${card.name} — Legendaries are limited to 1 per deck`
        : `${card.name} — already at ${allowedCopies(owned, card.id)} copies`;
    }
    return `Add ${card.name}`;
  }

  // ── Inspecting ────────────────────────────────────────────────
  // The same enlarged card and definition panel the match uses. Definitions
  // always show here — this is one of the two places studying happens
  // (DECISIONS.md §8), so the in-game setting does not apply.

  let inspected: Card | null = null;

  function inspect(event: MouseEvent, card: Card) {
    event.stopPropagation();
    inspected = card;
  }
</script>

<svelte:head><title>Collection — Flashstone</title></svelte:head>

<main>
  <header>
    <h1>Collection</h1>
    <p class="sub">
      {distinct} of {ALL_CARDS.length} cards collected. Two copies of a card per deck —
      Legendaries one.
    </p>
  </header>

  <div class="layout">
    <section class="browser">
      <div class="filters">
        <input placeholder="Search term or definition…" bind:value={search} />
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
        <select bind:value={sectionFilter} aria-label="Filter by section">
          <option value="all">Any section</option>
          {#each SECTIONS as section}<option value={section}>{section}</option>{/each}
        </select>
        <label class="owned-only">
          <input type="checkbox" bind:checked={ownedOnly} /> Owned only
        </label>
        <span class="shown">{visible.length} shown</span>
      </div>

      <div class="grid">
        {#each visible as card (card.id)}
          {@const have = ownedCount(owned, card.id)}
          {@const limit = Math.min(copyLimitFor(card.rarity), have)}
          {@const inDeck = countOf(deck, card.id)}
          {@const maxed = have > 0 && inDeck >= limit}
          <div class="tile" class:locked={have === 0}>
            <button
              class="tile-btn"
              disabled={!canAdd(deck, owned, card.id)}
              on:click={() => add(card.id)}
              title={tileTitle(card)}
            >
              <CardPreview {card} playable={have > 0} gold={isGold(owned, card.id)} />
            </button>

            <span
              class="owned-count"
              class:none={have === 0}
              title="You own {have} of a possible {MAX_COPIES} copies"
            >×{have}</span>

            {#if inDeck > 0}
              <span class="badge" class:max={maxed}>{maxed ? 'MAX' : inDeck}</span>
            {/if}

            <button
              class="versions-btn"
              on:click={(e) => inspect(e, card)}
              title="Read {card.name}"
            >
              ?
            </button>
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

      {#if saveError}
        <p class="warn">{saveError}</p>
      {/if}

      {#if capacity < DECK_SIZE}
        <p class="warn">
          Your collection can field {capacity}. Open packs for more cards.
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
              <span class="stat">
                {entry.card.type === 'Minion' ? `${entry.card.attack}/${entry.card.health}` : 'Spell'}
              </span>
              <span class="count">×{entry.count}</span>
            </button>
          </li>
        {:else}
          <li class="none">Empty. Click cards to add them, or Auto-build.</li>
        {/each}
      </ul>

      <div class="deck-actions">
        <button class="ghost" on:click={build}>Auto-build</button>
        <button class="ghost" on:click={clear} disabled={deck.cardIds.length === 0}>
          Clear
        </button>
        <button on:click={persist} disabled={problems.length > 0}>
          {saved ? (signedIn ? 'Saved to account' : 'Saved') : 'Save deck'}
        </button>
      </div>
    </section>
  </div>

  <CardInspector
    card={inspected}
    gold={inspected ? isGold(owned, inspected.id) : false}
    on:close={() => (inspected = null)}
  />
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
    gap: 20px 10px;
    max-height: 74vh;
    overflow-y: auto;
    padding: 4px 2px 4px 4px;
  }

  .tile {
    position: relative;
    width: 134px;
  }

  /*
   * This wraps a CardPreview and has no text of its own, but it is a literal
   * <button>, and the page's generic button rule sets font-weight,
   * letter-spacing and text-transform — all CSS-inherited properties.
   * CardPreview's description text never sets any of the three (it only
   * needed to, on every other page, because nothing wrapping it did either),
   * so without resetting them here they leak straight through: bold,
   * letter-spaced, upper-cased card text, only inside this grid.
   */
  .tile-btn {
    display: block;
    padding: 0;
    border: none;
    background: none;
    cursor: pointer;
    font-weight: 400;
    letter-spacing: normal;
    text-transform: none;
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
  /* Cards you don't own yet stay visible but plainly out of reach: seeing what
     is missing is half the point of a collection screen. */
  .tile.locked .tile-btn { filter: grayscale(0.85) brightness(0.55); }
  .tile.locked .tile-btn:hover { filter: grayscale(0.6) brightness(0.7); }

  /* Centred under the card, clear of the attack and health gems in the bottom
     corners — and written as a count (×2), not a ratio, so it cannot be misread
     as a statline. */
  .owned-count {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    bottom: -7px;
    padding: 1px 7px;
    border-radius: 8px;
    border: 1px solid var(--rule);
    background: rgba(19, 13, 8, 0.92);
    font-family: var(--display);
    font-size: 9.5px;
    letter-spacing: 0.06em;
    color: var(--gold);
  }
  .owned-count.none { color: var(--text-faint); }

  .owned-only {
    display: flex;
    align-items: center;
    gap: 6px;
    font-family: var(--display);
    font-size: 10px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--text-dim);
    white-space: nowrap;
  }
  .owned-only input { width: 13px; height: 13px; }
</style>
