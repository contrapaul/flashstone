<script lang="ts">
  import { page } from '$app/stores';
  import '$lib/styles/flashstone.css';

  const links = [
    { href: '/play', label: 'Play' },
    { href: '/decks', label: 'Collection' },
    { href: '/import', label: 'Import' },
    { href: '/learn', label: 'Learn' }
  ];

  // TODO: read the bound collection's name from storage once decks are wired.
  const deckLabel = 'Deck — Study Skills 101 · 30 cards';
</script>

<nav>
  <a class="brand" href="/">Flashstone</a>
  <div class="links">
    {#each links as link}
      <a href={link.href} class:active={$page.url.pathname === link.href}>{link.label}</a>
    {/each}
  </div>
  <span class="deck">{deckLabel}</span>
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

  .deck {
    margin-left: auto;
    font-size: 12px;
    letter-spacing: .04em;
    color: #8a7657;
  }
</style>
