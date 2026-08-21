<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { account } from '$lib/account';
  import { lobbyCall } from '$lib/net/client';

  /**
   * Play Online — the lobby.
   *
   * Creating a game defaults to **public**, which puts it in the list below for
   * anyone to click. The toggle turns that off; either way you get an invite
   * link, so a private game is shared by sending it.
   */

  interface OpenGame {
    id: string;
    hostName: string;
    createdAt: number;
  }

  let games: OpenGame[] = [];
  let loading = true;
  let error: string | null = null;
  let busy = false;
  let isPublic = true;
  let hosted: { id: string; isPublic: boolean } | null = null;
  let poller: ReturnType<typeof setInterval>;

  onMount(async () => {
    await account.refresh();
    if ($account.user) {
      await refresh();
      // A 3s poll rather than a socket: the lobby changes rarely, a poll needs
      // no connection to keep alive, and the socket budget is better spent on
      // matches. Revisit if the list ever feels stale.
      poller = setInterval(refresh, 3000);
    }
    loading = false;
  });

  onDestroy(() => clearInterval(poller));

  async function refresh() {
    try {
      const data = await lobbyCall('list');
      games = data.games ?? [];
      error = null;
    } catch (e) {
      error = e instanceof Error ? e.message : 'The lobby is unavailable.';
    }
  }

  async function create() {
    busy = true;
    error = null;
    try {
      const data = await lobbyCall('create', { isPublic });
      hosted = { id: data.game.id, isPublic: data.game.isPublic };
      await refresh();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Could not create a game.';
    }
    busy = false;
  }

  async function join(gameId: string) {
    busy = true;
    error = null;
    try {
      await lobbyCall('join', { gameId });
      await goto(`/online/${gameId}`);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Could not join.';
      await refresh();
    }
    busy = false;
  }

  async function cancelHosted() {
    if (!hosted) return;
    await lobbyCall('cancel', { gameId: hosted.id }).catch(() => {});
    hosted = null;
    await refresh();
  }

  $: inviteLink = hosted ? `${location.origin}/online/${hosted.id}` : '';

  let copied = false;
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(inviteLink);
      copied = true;
      setTimeout(() => (copied = false), 1800);
    } catch {
      copied = false;
    }
  }

  function ago(at: number): string {
    const seconds = Math.max(0, Math.round((Date.now() - at) / 1000));
    if (seconds < 60) return `${seconds}s ago`;
    return `${Math.round(seconds / 60)}m ago`;
  }
</script>

<svelte:head><title>Play Online — Flashstone</title></svelte:head>

<main>
  <h1>Play Online</h1>

  {#if loading}
    <p class="muted">Loading…</p>
  {:else if !$account.user}
    <section class="panel gate">
      <p class="muted">
        Online play needs an account — the match runs on the server, which has to know
        whose deck is whose. Practice against the AI works without one.
      </p>
      <a class="cta" href="/account">Sign in or create an account</a>
    </section>
  {:else}
    {#if error}<p class="error">{error}</p>{/if}

    <div class="grid">
      <section class="panel">
        <h2>Create a game</h2>

        {#if hosted}
          <p class="muted">
            Waiting for an opponent{hosted.isPublic ? ' — your game is in the list below' : ''}.
          </p>
          <div class="invite">
            <input readonly value={inviteLink} aria-label="Invite link" />
            <button class="ghost" on:click={copyLink}>{copied ? 'Copied' : 'Copy'}</button>
          </div>
          <div class="row">
            <a class="cta" href={`/online/${hosted.id}`}>Open the table</a>
            <button class="ghost" on:click={cancelHosted}>Cancel</button>
          </div>
        {:else}
          <label class="toggle">
            <input type="checkbox" bind:checked={isPublic} />
            <span>
              <span class="label">Public game</span>
              <span class="note">
                Anyone can see and join it from this page. Turn this off and only your
                invite link works.
              </span>
            </span>
          </label>
          <button on:click={create} disabled={busy}>
            {busy ? 'Creating…' : 'Create game'}
          </button>
        {/if}
      </section>

      <section class="panel">
        <div class="head">
          <h2>Open games</h2>
          <span class="count">{games.length}</span>
        </div>

        {#if games.length === 0}
          <p class="muted">
            Nobody is waiting right now. Create a game and yours will appear here.
          </p>
        {:else}
          <ul>
            {#each games as game (game.id)}
              <li>
                <div>
                  <span class="host">{game.hostName}</span>
                  <span class="when">{ago(game.createdAt)}</span>
                </div>
                <button class="ghost" on:click={() => join(game.id)} disabled={busy}>Join</button>
              </li>
            {/each}
          </ul>
        {/if}
      </section>
    </div>
  {/if}
</main>

<style>
  main { max-width: 900px; margin: 0 auto; padding: 24px 16px 60px; }

  h1 {
    margin: 0 0 20px;
    font-family: var(--display);
    font-size: 26px;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--gold-bright);
  }

  h2 {
    margin: 0 0 10px;
    font-family: var(--display);
    font-size: 12px;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--gold);
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
    gap: 16px;
    align-items: start;
  }

  .panel {
    padding: 20px 22px;
    border: 1px solid var(--frame);
    border-radius: 8px;
    background: linear-gradient(180deg, rgba(38, 27, 16, 0.9), rgba(22, 15, 9, 0.9));
  }
  .gate { max-width: 520px; text-align: center; }

  .head { display: flex; align-items: baseline; justify-content: space-between; }
  .count {
    font-family: var(--display);
    font-size: 11px;
    color: var(--text-faint);
  }

  .muted {
    margin: 0 0 14px;
    font-family: var(--body);
    font-size: 14px;
    line-height: 1.5;
    color: var(--text-dim);
    text-wrap: pretty;
  }

  .error {
    margin: 0 0 16px;
    padding: 9px 11px;
    border: 1px solid var(--blood-deep);
    border-radius: 4px;
    background: rgba(140, 44, 36, 0.18);
    font-family: var(--body);
    font-size: 13.5px;
    color: #f0c4bd;
  }

  .toggle {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    margin-bottom: 16px;
    cursor: pointer;
  }
  .toggle input { width: 15px; height: 15px; margin-top: 2px; flex: none; }
  .toggle .label { display: block; font-family: var(--body); font-size: 14px; color: var(--text); }
  .toggle .note {
    display: block;
    margin-top: 3px;
    font-family: var(--body);
    font-size: 11.5px;
    line-height: 1.4;
    color: var(--text-faint);
  }

  .invite { display: flex; gap: 8px; margin-bottom: 12px; }
  .invite input {
    flex: 1;
    min-width: 0;
    padding: 7px 9px;
    border: 1px solid var(--rule);
    border-radius: 4px;
    background: var(--ink-2);
    color: var(--text-dim);
    font-family: var(--body);
    font-size: 12.5px;
  }

  .row { display: flex; gap: 10px; align-items: center; }

  ul { list-style: none; margin: 0; padding: 0; }
  li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 0;
    border-top: 1px solid var(--rule);
  }
  li:first-child { border-top: none; }

  .host { font-family: var(--body); font-size: 14.5px; color: var(--text); }
  .when {
    display: block;
    font-family: var(--display);
    font-size: 9.5px;
    letter-spacing: 0.1em;
    color: var(--text-faint);
  }

  button, .cta {
    display: inline-block;
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
  button:disabled { opacity: 0.5; cursor: default; }

  button.ghost {
    padding: 7px 14px;
    background: var(--ink-2);
    border-color: var(--rule);
    color: var(--text-dim);
  }
  button.ghost:hover:not(:disabled) { border-color: var(--frame-lit); color: var(--gold-bright); }
</style>
