<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { page } from '$app/stores';
  import MatchTable from '$lib/components/MatchTable.svelte';
  import { account } from '$lib/account';
  import { RemoteSource } from '$lib/net/source';
  import { emptyView } from '$lib/net/view';
  import type { GameEvent } from '$lib/engine/events';
  import type { PlayerView, TargetRef } from '$lib/net/protocol';
  import type { MatchStatus } from '$lib/net/source';
  import { lobbyCall } from '$lib/net/client';

  /**
   * An online match.
   *
   * Exactly the same board as `/play` — the only difference is that intents go
   * down a socket instead of into a local engine, and the state that comes back
   * is the server's, not this browser's.
   */

  let view: PlayerView = emptyView();
  let events: GameEvent[] = [];
  let source: RemoteSource | null = null;
  let status: MatchStatus = { kind: 'waiting' };
  let error: string | null = null;
  let joining = true;

  $: gameId = $page.params.gameId ?? '';

  onMount(async () => {
    const state = await account.refresh();
    if (!state.user) {
      // Come back here after signing in, so an invite link works for someone
      // who is not signed in yet.
      location.href = `/account?next=${encodeURIComponent(location.pathname)}`;
      return;
    }

    if (!gameId) {
      error = 'That invite link is missing a game.';
      joining = false;
      return;
    }

    // Claiming the seat before opening the socket means "someone else already
    // joined" is a message on a page rather than a socket that closes.
    try {
      await lobbyCall('join', { gameId });
    } catch (e) {
      error = e instanceof Error ? e.message : 'Could not join that game.';
      joining = false;
      return;
    }

    joining = false;
    source = new RemoteSource(gameId, {
      onView(next, cues) {
        view = next;
        if (cues.length > 0) events = [...events, ...cues];
      },
      onStatus(next) {
        status = next;
        if (next.kind !== 'disconnected') error = null;
      },
      onError(message) {
        error = message;
      }
    });
  });

  onDestroy(() => source?.destroy());

  function onPlayCard(event: CustomEvent<{ handIndex: number; slot?: number }>) {
    source?.playCard(event.detail.handIndex, event.detail.slot);
  }

  function onAttack(event: CustomEvent<{ instanceId: string; target: TargetRef }>) {
    source?.attack(event.detail.instanceId, event.detail.target);
  }

  $: opponentName = status.opponent?.username ?? 'Opponent';
  $: opponentBack = status.opponent?.cardBack ?? 'default';
  $: playing = status.kind === 'playing' || status.kind === 'over';

  $: overTitle = view.winner
    ? view.winner === view.you
      ? 'Victory'
      : view.winner === 'draw'
        ? 'Draw'
        : 'Defeat'
    : status.kind === 'opponentLeft'
      ? 'Opponent left'
      : null;

  $: overNote =
    view.winner === view.you && (status.goldAwarded ?? 0) > 0
      ? `+${status.goldAwarded} gold`
      : status.kind === 'opponentLeft'
        ? 'They may reconnect — or you can head back.'
        : null;
</script>

<svelte:head><title>Online match — Flashstone</title></svelte:head>

{#if joining}
  <p class="notice">Joining…</p>
{:else if error && !playing}
  <div class="notice panel">
    <h1>Could not join</h1>
    <p>{error}</p>
    <a class="cta" href="/online">Back to the lobby</a>
  </div>
{:else}
  {#if status.kind === 'waiting'}
    <div class="banner">Waiting for an opponent to join…</div>
  {:else if status.kind === 'disconnected'}
    <div class="banner warn">Reconnecting…</div>
  {:else if error}
    <div class="banner warn">{error}</div>
  {/if}

  <MatchTable
    {view}
    bind:events
    interactive={playing}
    {opponentBack}
    deckName={opponentName}
    {overTitle}
    {overNote}
    overAction="Back to lobby"
    on:playCard={onPlayCard}
    on:attack={onAttack}
    on:endTurn={() => source?.endTurn()}
    on:overAction={() => (location.href = '/online')}
  />
{/if}

<style>
  .notice {
    max-width: 460px;
    margin: 60px auto;
    padding: 24px;
    text-align: center;
    font-family: var(--body);
    color: var(--text-dim);
  }

  .panel {
    border: 1px solid var(--frame);
    border-radius: 8px;
    background: linear-gradient(180deg, rgba(38, 27, 16, 0.9), rgba(22, 15, 9, 0.9));
  }

  h1 {
    margin: 0 0 8px;
    font-family: var(--display);
    font-size: 20px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--gold-bright);
  }

  /* Sits above the table without taking a row from it — the board is already
     height-budgeted to the viewport. */
  .banner {
    position: fixed;
    left: 50%;
    top: 66px;
    transform: translateX(-50%);
    z-index: 60;
    padding: 7px 18px;
    border: 1px solid #8a6c3c;
    border-radius: 4px;
    background: rgba(19, 13, 8, 0.94);
    font-family: var(--display);
    font-size: 10.5px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--gold);
  }
  .banner.warn { border-color: var(--blood-deep); color: #f0c4bd; }

  .cta {
    display: inline-block;
    margin-top: 14px;
    padding: 10px 20px;
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
</style>
