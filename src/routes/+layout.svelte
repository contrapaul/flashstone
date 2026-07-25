<script lang="ts">
  import { page } from '$app/stores';

  const links = [
    { href: '/play', label: 'Play' },
    { href: '/decks', label: 'Decks' },
    { href: '/import', label: 'Import' },
    { href: '/learn', label: 'Learn' }
  ];
</script>

<nav>
  <a class="brand" href="/">Flashstone</a>
  <div class="links">
    {#each links as link}
      <a href={link.href} class:active={$page.url.pathname === link.href}>{link.label}</a>
    {/each}
  </div>
</nav>

<slot />

<style>
  :global(body) {
    margin: 0;
    background: #0f0f23;
    color: #e5e7eb;
    font-family: system-ui, sans-serif;
  }

  nav {
    display: flex;
    align-items: center;
    gap: 20px;
    padding: 10px 20px;
    background: #16162e;
    border-bottom: 1px solid #2a2a4a;
  }

  .brand {
    font-weight: 700;
    letter-spacing: 0.02em;
    color: #e5e7eb;
    text-decoration: none;
    padding: 0;
  }
  .brand:hover { background: none; }

  .links {
    display: flex;
    gap: 6px;
  }

  a {
    color: #9ca3cf;
    text-decoration: none;
    font-size: 14px;
    padding: 5px 12px;
    border-radius: 6px;
  }

  a:hover {
    background: #1e1e3c;
    color: #e5e7eb;
  }

  a.active {
    background: #4f46e5;
    color: #fff;
  }
</style>
