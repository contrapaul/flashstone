<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import '$lib/styles/flashstone.css';
  import { isLegal } from '$lib/decks/deck';
  import { totalCopies } from '$lib/collection/owned';
  import { starterCollection } from '$lib/data/starter';
  import { loadCollection, loadDeck } from '$lib/decks/storage';
  import SettingsMenu from '$lib/components/SettingsMenu.svelte';
  import { account } from '$lib/account';
  import { goto } from '$app/navigation';

  // /import is deliberately absent: the import mechanic is shelved in favour of
  // the built-in SL card set. The route and its parsers remain on disk.
  const links = [
    { href: '/play', label: 'Play' },
    { href: '/online', label: 'Online' },
    { href: '/decks', label: 'Collection' },
    { href: '/review', label: 'Review' },
    { href: '/shop', label: 'Shop' },
    { href: '/learn', label: 'Learn' }
  ];

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

<nav>
  <a class="brand" href="/">Flashstone</a>
  <div class="links">
    {#each links as link}
      <a href={link.href} class:active={$page.url.pathname === link.href}>{link.label}</a>
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
        <span class="gold">{$account.gold}g</span>
        <span class="who">{$account.user.username}</span>
      {:else}
        <span class="who">Sign in</span>
      {/if}
    </a>
  {/if}

  <SettingsMenu />
</nav>

<slot />

<style>
  nav {
    position: relative;
    z-index: 40;
    display: flex;
    align-items: center;
    gap: 28px;
    height: 54px;
    padding: 0 24px;
    border-bottom: 1px solid #4a3722;
    background: linear-gradient(180deg, #20160d, var(--ink-2));
    box-shadow: 0 2px 18px rgba(0, 0, 0, .6);
  }

  .brand {
    font-family: var(--display);
    font-size: 17px;
    font-weight: 700;
    letter-spacing: .22em;
    text-transform: uppercase;
    color: #e8c56a;
    text-shadow: 0 0 18px rgba(232, 197, 106, .35);
  }
  .brand:hover { color: #f4d98a; }

  .links { display: flex; gap: 4px; }

  .links a {
    padding: 6px 13px;
    border: 1px solid transparent;
    border-radius: 4px;
    font-family: var(--display);
    font-size: 10.5px;
    letter-spacing: .16em;
    text-transform: uppercase;
    color: var(--text-dim);
  }

  .links a:hover { color: var(--text); }

  .links a.active {
    border-color: #8a6c3c;
    background: linear-gradient(180deg, #4a3620, #2a1d10);
    color: var(--gold-bright);
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
  .account .gold { color: var(--gold-bright); }

  .deck {
    margin-left: auto;
    margin-right: 10px;
    font-size: 12px;
    letter-spacing: .04em;
    color: #8a7657;
  }
</style>
