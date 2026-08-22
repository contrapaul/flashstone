<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import MatchTable from '$lib/components/MatchTable.svelte';
  import { buildAiDeck } from '$lib/data/aiDeck';
  import { starterDeck } from '$lib/data/starter';
  import { isLegal, resolveDeck } from '$lib/decks/deck';
  import { loadPlayer } from '$lib/collection/sync';
  import { playAiTurn } from '$lib/engine/ai';
  import type { GameEvent } from '$lib/engine/events';
  import { LocalSource } from '$lib/net/source';
  import { emptyView } from '$lib/net/view';
  import type { ChosenRef, PlayerView, TargetRef } from '$lib/net/protocol';
  import { reportProgress } from '$lib/quests/client';
  import { account } from '$lib/account';
  import type { Card } from '../../types/cards';

  /**
   * Practice against the AI.
   *
   * The board is `MatchTable`, the same component the online table uses — this
   * route only supplies a `LocalSource` and takes the AI's turn. Nothing about
   * the table knows which mode it is in.
   */

  let deckCards: Card[] = resolveDeck(starterDeck());
  let deckName = 'Starter deck';
  const aiCards: Card[] = buildAiDeck();

  let view: PlayerView = emptyView();
  let events: GameEvent[] = [];
  let source: LocalSource | null = null;
  let aiThinking = false;
  let matchId = '';
  let rewarded = false;
  let goldWon = 0;

  onMount(() => {
    start();

    // The saved deck arrives asynchronously when signed in; applied to the next
    // match rather than swapped in mid-hand.
    void loadPlayer().then((player) => {
      if (player.deck && isLegal(player.deck, player.owned)) {
        deckCards = resolveDeck(player.deck);
        deckName = player.deck.name;
        if (view.turnNumber <= 1 && view.me.board.length === 0) start();
      }
    });
  });

  onDestroy(() => source?.destroy());

  function start() {
    matchId = crypto.randomUUID();
    rewarded = false;
    goldWon = 0;
    aiThinking = false;
    source?.destroy();
    source = new LocalSource(deckCards, aiCards, handlers, playAiTurn);
  }

  const handlers = {
    onView(next: PlayerView, cues: GameEvent[]) {
      view = next;
      if (cues.length > 0) events = [...events, ...cues];
    },
    onStatus() {},
    onError() {}
  };

  function onPlayCard(event: CustomEvent<{ handIndex: number; slot?: number; target?: ChosenRef }>) {
    const card = view.me.hand[event.detail.handIndex];
    source?.playCard(event.detail.handIndex, event.detail.slot, event.detail.target);
    countCardPlayed(card);
  }

  function onHeroAttack(event: CustomEvent<{ target: TargetRef }>) {
    source?.heroAttack(event.detail.target);
  }

  function onAttack(event: CustomEvent<{ instanceId: string; target: TargetRef }>) {
    source?.attack(event.detail.instanceId, event.detail.target);
  }

  function onEndTurn() {
    if (!source) return;
    source.endTurn();
    aiThinking = true;
  }

  /**
   * The AI moves once playback has caught up.
   *
   * `drained` fires when the table has finished animating, so the opponent's
   * turn never lands on top of the player's own cues.
   */
  function onDrained() {
    if (!source) return;
    if (view.winner) return void onWin();
    if (view.turn !== 'ai') {
      aiThinking = false;
      return;
    }
    // A beat, so the AI does not answer instantly.
    setTimeout(() => {
      source?.runOpponent();
      aiThinking = false;
    }, 450);
  }

  // ── Quest counters and rewards ───────────────────────────
  function countCardPlayed(card: Card | undefined) {
    if (!card) return;
    reportProgress('cardsPlayed', 1);
    if (card.type === 'Spell') reportProgress('spellsCast', 1);
  }

  async function onWin() {
    if (view.winner !== 'player' || rewarded) return;
    rewarded = true;
    reportProgress('wins', 1);
    try {
      const res = await fetch('/api/rewards/win', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchId })
      });
      if (res.ok) {
        goldWon = (await res.json()).awarded ?? 0;
        await account.refresh();
      }
    } catch {
      // Signed out or offline. The result stands either way.
    }
  }

  $: overTitle = view.winner
    ? view.winner === 'player'
      ? 'Victory'
      : view.winner === 'ai'
        ? 'Defeat'
        : 'Draw'
    : null;
  $: overNote = goldWon > 0 ? `+${goldWon} gold` : null;
</script>

<svelte:head><title>Play — Flashstone</title></svelte:head>

<MatchTable
  {view}
  bind:events
  interactive={!aiThinking}
  {deckName}
  {overTitle}
  {overNote}
  overAction="Play again"
  on:playCard={onPlayCard}
  on:attack={onAttack}
  on:heroAttack={onHeroAttack}
  on:endTurn={onEndTurn}
  on:drained={onDrained}
  on:overAction={start}
/>
