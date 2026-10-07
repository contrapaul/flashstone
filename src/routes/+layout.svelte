<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import '$lib/styles/flashstone.css';
  import { isLegal } from '$lib/decks/deck';
  import { totalCopies } from '$lib/collection/owned';
  import { starterCollection } from '$lib/data/starter';
  import { loadCollection, loadDeck } from '$lib/decks/storage';
  import SettingsMenu from '$lib/components/SettingsMenu.svelte';
  import Logo from '$lib/components/Logo.svelte';
  import GoldCounter from '$lib/components/GoldCounter.svelte';
  import MenuBackdrop from '$lib/components/MenuBackdrop.svelte';
  import { account } from '$lib/account';
  import { settings } from '$lib/settings';
  import { audio, initAudio } from '$lib/audio';
  import { browser } from '$app/environment';
  import { goto, onNavigate } from '$app/navigation';

  // /import is deliberately absent: the import mechanic is shelved in favour of
  // the built-in SL card set. The route and its parsers remain on disk.
  //
  // Online and Learn are absent for a different reason: they are tabs of the
  // New Game screen now, not destinations of their own.
  const links = [
    { href: '/play', label: 'Play' },
    { href: '/decks', label: 'Collection' },
    { href: '/review', label: 'Review' },
    { href: '/shop', label: 'Shop' }
  ];

  /**
   * A match is played with no chrome around it: no nav, no deck label, nothing
   * but the table. Keyed on the route rather than on a store, because these two
   * routes **are** the game — there is no state in which `/play/ai` is open and
   * a match is not being played.
   *
   * `/play` itself is the New Game screen, not a match; only `/play/ai` and a
   * room under `/online/` count.
   */
  $: inMatch = isMatch($page.url.pathname);

  // ── Sound ──
  // Started before anything asks for it; silent until the first click or key.
  if (browser) initAudio();
  /** The title has its own music; every other page shares one. A match picks its own. */
  $: if (!inMatch) audio().music($page.url.pathname === '/' ? 'title' : 'menu');

  /*
   * Every button and link clicks — except on the playing surface, whose cards,
   * minions, heroes and End Turn make sounds of their own, and the cards of a
   * pack or a Discover, which make theirs. The menu plates and nav links also tick under the pointer.
   */
  function onClickSound(event: MouseEvent) {
    const target = (event.target as Element | null)?.closest('button, a[href], [role="button"]');
    if (target && !target.closest('.hand, .board, .hero-row, .centre, .flipper, .option')) audio().play('ui-click', { volume: 0.7 });
  }

  let hoverSounded: Element | null = null;
  function onHoverSound(event: PointerEvent) {
    if (event.pointerType !== 'mouse') return;
    const target = (event.target as Element | null)?.closest('nav a, main .menu a');
    if (target && target !== hoverSounded) audio().play('ui-hover', { volume: 0.4 });
    hoverSounded = target ?? null;
  }

  /** `/play` stays lit for its tabs and for the match under it. */
  const isActive = (href: string) =>
    href === '/play'
      ? $page.url.pathname === '/play' || $page.url.pathname.startsWith('/play/')
      : $page.url.pathname === href;

  const isMatch = (path: string) => path === '/play/ai' || /^\/online\/.+/.test(path);

  /*
   * Menu pages crossfade, the new one easing up out of a slight zoom — through
   * the browser's view transitions, which snapshot the old page so it can fade
   * while the new one is already live. (Svelte transitions cannot: both copies
   * would render the new page.) A match is entered and left without one: the
   * table has its own entrance. Browsers without view transitions just switch.
   */
  onNavigate((navigation) => {
    const from = navigation.from?.url.pathname ?? '';
    const to = navigation.to?.url.pathname ?? '';
    if (!document.startViewTransition || from === to || isMatch(from) || isMatch(to)) return;
    document.documentElement.dataset.calm = $settings.motion === 'reduced' ? 'true' : 'false';
    return new Promise((resolve) => {
      const transition = document.startViewTransition(async () => {
        resolve();
        await navigation.complete;
      });
      // A skipped transition (a hidden tab, a second click) still navigates;
      // only its animation is lost, which is not worth an error in the console.
      transition.ready.catch(() => {});
    });
  });

  let deckLabel = '';
  /** Set when today's login bonus was just paid, so the nav can say so once. */
  let dailyBonus = 0;

  onMount(async () => {
    const owned = loadCollection() ?? starterCollection();
    const deck = loadDeck();
    if (deck && isLegal(deck, owned)) {
      deckLabel = `Deck — ${deck.name} · ${deck.cardIds.length} cards`;
    } else {
      deckLabel = `${totalCopies(owned)} cards · starter deck`;
    }

    const state = await account.refresh();

    // The first load of a UTC day pays the login bonus. The server keys it on
    // the day number, so calling this on every load costs nothing.
    if (state.user) {
      const paid = await account.claimDaily();
      if (paid > 0) dailyBonus = paid;
    }

    // Verification and reset links arrive at the site root to match the URLs
    // the email templates were ported with. The account page handles them.
    const params = $page.url.searchParams;
    if (params.has('verify') || params.has('reset')) {
      goto(`/account?${params.toString()}`, { replaceState: true });
    }
  });
</script>

<svelte:window on:click|capture={onClickSound} on:pointerover={onHoverSound} />

{#if !inMatch}
  <nav>
    <a class="brand" href="/"><Logo height={32} /></a>
    <div class="links">
      {#each links as link}
        <a href={link.href} class:active={isActive(link.href)}>{link.label}</a>
      {/each}
    </div>
    <span class="deck">{deckLabel}</span>

    {#if dailyBonus > 0}
      <button class="bonus" on:click={() => (dailyBonus = 0)} title="Dismiss">
        +{dailyBonus}g daily bonus
      </button>
    {/if}

    {#if !$account.loading}
      <a class="account" class:signed-in={$account.user} href="/account">
        {#if $account.user}
          <GoldCounter value={$account.gold} />
          <span class="who">{$account.user.username}</span>
        {:else}
          <span class="who">Sign in</span>
        {/if}
      </a>
    {/if}

    <SettingsMenu />
  </nav>
{/if}

<!--
  The wrapper exists to publish `--chrome`: the height the nav takes off the
  viewport, which the match table subtracts to size itself. Hiding the nav
  without this would leave a 55px strip of nothing under the table.
-->
<div class="shell" class:in-match={inMatch}>
  {#if !inMatch}<MenuBackdrop dust={$page.url.pathname === '/'} />{/if}
  <slot />
</div>

<style>
  .shell { --chrome: 55px; }
  .shell.in-match { --chrome: 0px; }

  /*
   * A carved header strip in the title's materials: dark wood with a lit top
   * edge and a gold trim along the bottom, the grain running across it.
   */
  nav {
    position: relative;
    z-index: 40;
    /* Held still while the page under it crossfades. */
    view-transition-name: nav;
    display: flex;
    align-items: center;
    gap: 28px;
    height: 54px;
    padding: 0 24px;
    background:
      repeating-linear-gradient(90deg, rgba(255, 230, 190, .025) 0 1px, transparent 1px 7px),
      linear-gradient(180deg, #3a2814 0%, #24180c 18%, #1a1108 70%, #120b05 100%);
    box-shadow:
      inset 0 1px 0 rgba(255, 224, 170, .22),
      inset 0 -2px 0 rgba(0, 0, 0, .55),
      0 3px 0 -1px #8a6430,
      0 4px 0 -1px #2a1a0a,
      0 8px 22px rgba(0, 0, 0, .65);
  }

  /* The gold trim, lit in the middle and fading to the ends. */
  nav::after {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    bottom: -2px;
    height: 2px;
    background: linear-gradient(90deg, transparent, #c9973e 18%, #ffe6a0 50%, #c9973e 82%, transparent);
    pointer-events: none;
  }

  .brand {
    flex: none;
    display: flex;
    align-items: center;
    filter: drop-shadow(0 0 10px rgba(232, 197, 106, .18));
    transition: filter .15s ease;
  }
  .brand:hover { filter: drop-shadow(0 0 14px rgba(255, 214, 120, .45)) brightness(1.08); }

  .links { display: flex; gap: 6px; }

  /* Each link a small carved tab; the current one pressed in and lit. */
  .links a {
    padding: 6px 13px;
    border: 1px solid transparent;
    border-radius: 4px;
    font-family: var(--display);
    font-size: 10.5px;
    letter-spacing: .16em;
    text-transform: uppercase;
    color: var(--text-dim);
    text-shadow: 0 1px 0 rgba(0, 0, 0, .8);
    transition: color .12s ease, background .12s ease;
  }

  .links a:hover { color: var(--text); background: rgba(255, 224, 170, .05); }

  .links a.active {
    border-color: #8a6c3c;
    background: linear-gradient(180deg, #160e06, #2e2010);
    box-shadow: inset 0 2px 4px rgba(0, 0, 0, .7), 0 1px 0 rgba(255, 224, 170, .15);
    color: var(--gold-bright);
    text-shadow: 0 0 10px rgba(240, 214, 138, .45);
  }

  .bonus {
    padding: 5px 11px;
    border: 1px solid #8a6c3c;
    border-radius: 4px;
    background: linear-gradient(180deg, var(--gold), #9c7c3c);
    color: #2a1d10;
    cursor: pointer;
    font-family: var(--display);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .account {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 11px;
    border: 1px solid var(--rule);
    border-radius: 4px;
    font-family: var(--display);
    font-size: 10.5px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--text-dim);
  }
  .account:hover { border-color: var(--frame-lit); color: var(--text); }
  .account.signed-in { border-color: #8a6c3c; }

  .deck {
    margin-left: auto;
    margin-right: 10px;
    font-size: 12px;
    letter-spacing: .04em;
    color: #8a7657;
  }

  /* iPad portrait: the strip keeps its links and loses the deck line, which
     wrapped to four lines and pushed Settings off the edge. */
  @media (max-width: 900px) {
    nav { gap: 16px; padding: 0 16px; }
    .deck { visibility: hidden; min-width: 0; flex: 1; }
    .account.signed-in .who { display: none; }
  }
</style>
