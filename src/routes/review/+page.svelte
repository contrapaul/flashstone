<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import CardPreview from '$lib/components/CardPreview.svelte';
  import { ALL_CARDS } from '$lib/data/cards';
  import { starterCollection } from '$lib/data/starter';
  import { ownedCount, isGold, type Owned } from '$lib/collection/owned';
  import { loadCollection } from '$lib/decks/storage';
  import { createReviewTimer } from '$lib/review/timer';
  import { reportProgress } from '$lib/quests/client';
  import { createRng, shuffle } from '$lib/engine/rng';

  /**
   * Review mode.
   *
   * The card is the **same card**, unchanged — the definition goes beside it,
   * exactly as it does when you inspect one mid-match. Nothing here re-renders
   * a card in a study-specific way.
   */

  let owned: Owned = {};
  let scope: 'owned' | 'all' = 'owned';
  let sectionFilter = 'all';
  let order: string[] = [];
  let index = 0;
  let revealed = false;
  let seconds = 0;

  const SECTIONS = [...new Set(ALL_CARDS.flatMap((c) => c.sections ?? []))].sort();

  const timer = createReviewTimer(Date.now());
  let ticker: ReturnType<typeof setInterval>;
  /** Seconds already reported, so each one is only ever sent once. */
  let reported = 0;

  onMount(() => {
    owned = loadCollection() ?? starterCollection();
    reshuffle();
    // Reported in batches rather than every second: the server clamps each
    // increment at 120s anyway, and one request a minute is plenty.
    ticker = setInterval(() => {
      seconds = timer.tick(Date.now());
      const unreported = seconds - reported;
      if (unreported >= 30) {
        reportProgress('reviewSeconds', unreported);
        reported = seconds;
      }
    }, 1000);
    document.addEventListener('visibilitychange', onVisibility);
  });

  onDestroy(() => {
    // Flush whatever is owed, so leaving after 40s does not lose it.
    const owed = timer.tick(Date.now()) - reported;
    if (owed > 0) reportProgress('reviewSeconds', owed);
    clearInterval(ticker);
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onVisibility);
    }
  });

  function onVisibility() {
    if (document.hidden) timer.pause(Date.now());
    else timer.resume(Date.now());
  }

  /** Any input counts as attention — that is what stops the idle cutoff. */
  function touch() {
    timer.activity(Date.now());
    seconds = timer.seconds();
  }

  $: pool = ALL_CARDS.filter((card) => {
    // Review studies syllabus terms. Hand-authored spells and weapons are game
    // pieces with no definition to reveal, so they are not part of it.
    if (!card.definition) return false;
    if (scope === 'owned' && ownedCount(owned, card.id) === 0) return false;
    if (sectionFilter !== 'all' && !(card.sections ?? []).includes(sectionFilter)) return false;
    return true;
  });

  // Re-deal whenever the filters change the pool out from under the position.
  let lastKey = '';
  $: {
    const key = `${scope}:${sectionFilter}:${pool.length}`;
    if (key !== lastKey && lastKey !== '') reshuffle();
    lastKey = key;
  }

  function reshuffle() {
    order = shuffle(createRng(Date.now() >>> 0), pool.map((c) => c.id));
    index = 0;
    revealed = false;
  }

  $: current = pool.find((c) => c.id === order[index]) ?? pool[0] ?? null;

  function next() {
    touch();
    if (order.length === 0) return;
    index = (index + 1) % order.length;
    revealed = false;
  }

  function previous() {
    touch();
    if (order.length === 0) return;
    index = (index - 1 + order.length) % order.length;
    revealed = false;
  }

  function reveal() {
    touch();
    revealed = true;
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      revealed ? next() : reveal();
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      next();
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      previous();
    }
  }

  $: minutes = Math.floor(seconds / 60);
  $: clock = `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
</script>

<svelte:head><title>Review — Flashstone</title></svelte:head>
<svelte:window on:keydown={onKeydown} on:pointerdown={touch} />

<main>
  <header>
    <h1>Review</h1>
    <div class="controls">
      <select bind:value={scope} aria-label="Which cards">
        <option value="owned">Cards I own</option>
        <option value="all">Every card</option>
      </select>
      <select bind:value={sectionFilter} aria-label="Filter by section">
        <option value="all">Any section</option>
        {#each SECTIONS as section}<option value={section}>{section}</option>{/each}
      </select>
      <span class="progress">{order.length === 0 ? 0 : index + 1} / {order.length}</span>
      <span class="clock" title="Active review time — pauses when you stop">{clock}</span>
    </div>
  </header>

  {#if current}
    <div class="stage">
      <div class="card-slot">
        <CardPreview card={current} gold={isGold(owned, current.id)} playable />
      </div>

      <aside class="meaning" class:hidden={!revealed}>
        {#if revealed}
          <h2>{current.name}</h2>
          {#if (current.sections ?? []).length > 0}
            <p class="sections">
              {(current.sections ?? []).join(' · ')}{current.hl ? ' · HL' : ''}
            </p>
          {/if}
          <p class="definition">{current.definition}</p>
        {:else}
          <button class="reveal" on:click={reveal}>
            <span>Reveal definition</span>
            <span class="hint">Space</span>
          </button>
        {/if}
      </aside>
    </div>

    <nav class="steps">
      <button class="ghost" on:click={previous}>← Previous</button>
      <button on:click={next}>Next →</button>
    </nav>
  {:else}
    <p class="none">No cards match those filters.</p>
  {/if}
</main>

<style>
  main {
    max-width: 1000px;
    margin: 0 auto;
    padding: 24px 16px 60px;
  }

  header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 12px;
    margin-bottom: 22px;
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

  .controls {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  select {
    padding: 6px 8px;
    border: 1px solid var(--rule);
    border-radius: 4px;
    background: var(--ink-2);
    color: var(--text);
    font-family: var(--body);
    font-size: 13px;
  }

  .progress,
  .clock {
    font-family: var(--display);
    font-size: 11px;
    letter-spacing: 0.12em;
    color: var(--text-dim);
  }
  .clock { color: var(--gold); }

  /* The card and its meaning, side by side — the gameplay inspect treatment. */
  .stage {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 34px;
    min-height: 440px;
  }

  .card-slot {
    flex: none;
    width: 335px;
    height: 420px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* Scaled whole, never re-laid-out: the card here is the card in your hand. */
  .card-slot :global(.card),
  .card-slot :global(.card:hover) {
    transform: scale(2.5);
    transform-origin: center;
    box-shadow: 0 14px 26px rgba(0, 0, 0, .6), inset 0 1px 0 rgba(255, 232, 180, .28);
  }
  .card-slot :global(.card.playable) { animation: none; }

  .meaning {
    flex: 1;
    max-width: 420px;
    min-height: 200px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 22px 24px;
    border: 1px solid var(--frame);
    border-radius: 8px;
    background: linear-gradient(180deg, rgba(38, 27, 16, 0.9), rgba(22, 15, 9, 0.9));
  }

  .meaning.hidden {
    border-style: dashed;
    background: rgba(22, 15, 9, 0.45);
  }

  h2 {
    margin: 0 0 4px;
    font-family: var(--display);
    font-size: 19px;
    font-weight: 700;
    letter-spacing: 0.05em;
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
    font-size: 16px;
    line-height: 1.55;
    color: var(--text);
    text-wrap: pretty;
  }

  .reveal {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 18px;
    border: none;
    border-radius: 6px;
    background: none;
    cursor: pointer;
    font-family: var(--display);
    font-size: 13px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--gold);
  }
  .reveal:hover { color: var(--gold-bright); }

  .hint {
    font-size: 10px;
    letter-spacing: 0.2em;
    color: var(--text-faint);
  }

  .steps {
    display: flex;
    justify-content: center;
    gap: 12px;
    margin-top: 22px;
  }

  button {
    padding: 10px 20px;
    border: 1px solid #8a6c3c;
    border-radius: 4px;
    background: linear-gradient(180deg, var(--gold), #9c7c3c);
    color: #2a1d10;
    cursor: pointer;
    font-family: var(--display);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.16em;
    text-transform: uppercase;
  }

  button.ghost {
    background: var(--ink-2);
    border-color: var(--rule);
    color: var(--text-dim);
  }
  button.ghost:hover { border-color: var(--frame-lit); color: var(--gold-bright); }

  .none {
    text-align: center;
    padding: 60px 0;
    font-family: var(--body);
    color: var(--text-dim);
  }

  /* Portrait tablets and phones stack the meaning under the card. */
  @media (max-width: 820px) {
    .stage {
      flex-direction: column;
      gap: 16px;
      min-height: 0;
    }
    .card-slot { width: 235px; height: 294px; }
    .card-slot :global(.card),
    .card-slot :global(.card:hover) { transform: scale(1.75); }
    .meaning { max-width: 100%; min-height: 140px; }
  }
</style>
