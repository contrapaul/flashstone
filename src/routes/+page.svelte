<script lang="ts">
  import { onMount } from 'svelte';
  import { DECK_SIZE, isLegal, type Deck } from '$lib/decks/deck';
  import { distinctCount } from '$lib/decks/deck';
  import { ALL_CARDS } from '$lib/data/cards';
  import { starterCollection } from '$lib/data/starter';
  import type { Owned } from '$lib/collection/owned';
  import { loadCollection, loadDeck } from '$lib/decks/storage';
  import QuestPanel from '$lib/components/QuestPanel.svelte';
  import QuestSpotlight from '$lib/components/QuestSpotlight.svelte';
  import { markQuestsSeen, questsUnseen } from '$lib/quests/seen';
  import { account } from '$lib/account';

  let owned: Owned = {};
  let deck: Deck | null = null;
  let ready = false;

  /**
   * The spotlight is for a returning player, so it waits on two things: an
   * account, because quests are server-side and a signed-out visitor has none,
   * and a day whose quests have not been shown yet.
   */
  let spotlight = false;
  /** The decision is made once per load, not every time the store ticks. */
  let spotlightDecided = false;

  onMount(() => {
    owned = loadCollection() ?? starterCollection();
    deck = loadDeck();
    ready = true;
  });

  // Read from the store rather than calling `account.refresh()`: the layout
  // already refreshes on mount, and `refresh` does not de-duplicate, so asking
  // again here would cost a second `/api/profile` on every home page load.
  $: if (!spotlightDecided && !$account.loading) {
    spotlightDecided = true;
    if ($account.user && questsUnseen()) spotlight = true;
  }

  function dismissSpotlight() {
    markQuestsSeen();
    spotlight = false;
  }

  $: deckPlayable = Boolean(deck && isLegal(deck, owned));

  $: status = !ready
    ? ''
    : deckPlayable
      ? `Playing “${deck?.name}” — ${DECK_SIZE} cards.`
      : `${distinctCount(owned)} of ${ALL_CARDS.length} cards collected — playing the starter deck.`;

  // Online and the rules are tabs of the New Game screen now, not menu entries.
  const menu = [
    { href: '/play', title: 'New Game' },
    { href: '/decks', title: 'Collection' },
    { href: '/review', title: 'Review' },
    { href: '/shop', title: 'Shop' }
  ];
</script>

<svelte:head><title>Flashstone</title></svelte:head>

<main class:blurred={spotlight}>
  <div class="column">
    <section class="hero">
      <h1>Flashstone</h1>
      <p class="tagline">Design &amp; Technology, as a card game.</p>
      <p class="status" class:playable={deckPlayable}>{status}</p>
    </section>

    <nav class="menu">
      {#each menu as item}
        <a href={item.href} class:primary={item.title === 'New Game'}>
          <span class="title">{item.title}</span>
        </a>
      {/each}
    </nav>
  </div>

  <aside class="rail">
    {#if $account.loading}
      <section class="placeholder"><p>Loading…</p></section>
    {:else if $account.user}
      <QuestPanel on:claimed={() => account.refresh()} />
    {:else}
      <section class="placeholder">
        <h2>Daily quests</h2>
        <p>
          Three quests a day, refreshing at UTC midnight, each paying gold — plus a
          one-time set for new players that pays packs. They need an account to track.
        </p>
        <a class="cta" href="/account">Sign in</a>
      </section>
    {/if}
  </aside>
</main>

{#if spotlight}
  <QuestSpotlight on:close={dismissSpotlight} on:claimed={() => account.refresh()} />
{/if}

<style>
  main {
    position: relative;
    min-height: calc(100vh - 55px);
    box-sizing: border-box;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 340px;
    gap: 40px;
    align-items: start;
    max-width: 1140px;
    margin: 0 auto;
    padding: 72px 16px 60px;
  }

  /*
    The page behind the spotlight is blurred rather than hidden: the player
    should still see where they are, just not be able to read past the dialog.
  */
  main.blurred {
    filter: blur(3px) saturate(0.8);
    pointer-events: none;
    user-select: none;
  }

  .column { max-width: 560px; margin: 0 auto; width: 100%; }

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

  /* ── Quest rail ───────────────────────────────────────── */
  .rail { position: sticky; top: 24px; }

  .placeholder {
    padding: 20px 22px;
    border: 1px solid var(--frame);
    border-radius: 8px;
    background: linear-gradient(180deg, rgba(38, 27, 16, 0.9), rgba(22, 15, 9, 0.9));
  }

  .placeholder h2 {
    margin: 0 0 10px;
    font-family: var(--display);
    font-size: 12px;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--gold);
  }

  .placeholder p {
    margin: 0 0 14px;
    font-family: var(--body);
    font-size: 13.5px;
    line-height: 1.5;
    color: var(--text-dim);
    text-wrap: pretty;
  }

  .cta {
    display: inline-block;
    padding: 8px 18px;
    border: 1px solid #8a6c3c;
    border-radius: 4px;
    background: linear-gradient(180deg, var(--gold), #9c7c3c);
    color: #2a1d10;
    font-family: var(--display);
    font-size: 10.5px;
    font-weight: 700;
    letter-spacing: 0.16em;
    text-transform: uppercase;
  }

  /* The rail drops under the menu before it gets too narrow to read. */
  @media (max-width: 900px) {
    main {
      grid-template-columns: minmax(0, 1fr);
      gap: 32px;
      padding-top: 48px;
    }
    .rail { position: static; max-width: 560px; margin: 0 auto; width: 100%; }
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

  /* The rail's own link is a button, not a menu tile. */
  .rail a { padding: 8px 18px; box-shadow: none; }
  .rail a:hover { transform: none; box-shadow: none; }

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
