<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import MatchTable from '$lib/components/MatchTable.svelte';
  import { buildAiDeck } from '$lib/data/aiDeck';
  import { DEFAULT_CLASS, starterDeck } from '$lib/data/starter';
  import { PLAYABLE_CLASSES, type CardClass } from '../../../types/cards';
  import { isLegal, resolveDeck } from '$lib/decks/deck';
  import { loadPlayer } from '$lib/collection/sync';
  import { aiTurn, type AiIntent } from '$lib/engine/ai';
  import { dOpponent } from '$lib/presentation/motion';
  import type { GameEvent } from '$lib/engine/events';
  import { LocalSource } from '$lib/net/source';
  import { emptyView } from '$lib/net/view';
  import type { ChosenRef, EmoteId, PlayerView, TargetRef } from '$lib/net/protocol';
  import { fetchQuests, questsMovedSince, reportProgress, type QuestTracks } from '$lib/quests/client';
  import type { QuestMove } from '$lib/quests/quests';
  import { account } from '$lib/account';
  import type { Card } from '../../../types/cards';

  /**
   * Practice against the AI.
   *
   * The board is `MatchTable`, the same component the online table uses — this
   * route only supplies a `LocalSource` and takes the AI's turn. Nothing about
   * the table knows which mode it is in.
   */

  let deckCards: Card[] = resolveDeck(starterDeck());
  let heroClass: CardClass = DEFAULT_CLASS;
  /** The opponent rotates class per match, so all four get seen in practice — with that class's cards. */
  let aiClass: CardClass = 'Manufacturer';
  let aiCards: Card[] = [];

  let view: PlayerView = emptyView();
  let events: GameEvent[] = [];
  let source: LocalSource | null = null;
  let aiThinking = false;
  let matchId = '';
  let rewarded = false;
  let goldWon = 0;
  /** The latest emote, yours or the AI's, for the table to show. */
  let emote: { from: string; id: EmoteId; at: number } | null = null;
  /** Quest progress as the match began, so the result can show what it moved. */
  let questsBefore: Promise<QuestTracks> | null = null;
  let questMoves: QuestMove[] = [];

  onMount(() => {
    start();

    // The saved deck arrives asynchronously when signed in; applied to the next
    // match rather than swapped in mid-hand.
    void loadPlayer().then((player) => {
      if (player.deck && isLegal(player.deck, player.owned)) {
        deckCards = resolveDeck(player.deck);
        heroClass = player.deck.class ?? DEFAULT_CLASS;
        if (view.turnNumber <= 1 && view.me.board.length === 0) start();
      }
    });
  });

  onDestroy(() => source?.destroy());

  function start() {
    matchId = crypto.randomUUID();
    rewarded = false;
    goldWon = 0;
    questMoves = [];
    questsBefore = $account.user ? fetchQuests() : null;
    aiThinking = false;
    source?.destroy();
    aiClass = PLAYABLE_CLASSES[Math.floor(Math.random() * PLAYABLE_CLASSES.length)];
    aiCards = buildAiDeck(Math.floor(Math.random() * 2 ** 31), aiClass);
    source = new LocalSource(deckCards, aiCards, handlers, aiTurn, {
      player: heroClass,
      ai: aiClass
    });
  }

  const handlers = {
    onView(next: PlayerView, cues: GameEvent[]) {
      view = next;
      if (cues.length > 0) events = [...events, ...cues];
    },
    onStatus() {},
    onError() {},
    onEmote(from: string, id: EmoteId) {
      emote = { from, id, at: Date.now() };
    }
  };

  function onPlayCard(event: CustomEvent<{ handIndex: number; slot?: number; target?: ChosenRef }>) {
    const card = view.me.hand[event.detail.handIndex];
    source?.playCard(event.detail.handIndex, event.detail.slot, event.detail.target);
    countCardPlayed(card);
  }

  function onHeroAttack(event: CustomEvent<{ target: TargetRef }>) {
    source?.heroAttack(event.detail.target);
  }

  function onHeroPower(event: CustomEvent<{ target?: ChosenRef }>) {
    source?.heroPower(event.detail.target);
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
   * The AI moves once playback has caught up — **one move at a time**.
   *
   * `drained` fires when the table has finished animating, so each decision
   * lands, plays out, and only then is the next one made: the opponent's turn
   * reads as a sequence of moves, not one burst. Between moves it thinks, for
   * longer before a big play than before ending its turn.
   */
  function onDrained() {
    if (!source) return;
    if (view.winner) return void onMatchOver();
    const next = source.nextOpponentIntent();
    if (!next) {
      aiThinking = false;
      return;
    }
    aiThinking = true;
    const stepping = source;
    setTimeout(() => {
      // A restart in the meantime replaces the source; this move is void.
      if (source === stepping) source.stepOpponent();
    }, dOpponent(thinkFor(next)));
  }

  /** How long a move is worth considering, in ms before pacing. */
  function thinkFor(intent: AiIntent): number {
    switch (intent.kind) {
      case 'play': {
        const card = source?.raw.players.ai.hand[intent.handIndex];
        return card && card.cost >= 5 ? 1000 : 650;
      }
      case 'power':
        return 600;
      case 'attack':
      case 'heroAttack':
        return 480;
      case 'end':
        return 700;
    }
  }

  // ── Quest counters and rewards ───────────────────────────
  function countCardPlayed(card: Card | undefined) {
    if (!card) return;
    reportProgress('cardsPlayed', 1);
    if (card.type === 'Spell') reportProgress('spellsCast', 1);
  }

  async function onMatchOver() {
    if (rewarded) return;
    rewarded = true;
    const match = matchId;

    // Reported win or lose: the intro track pays for finishing a first match
    // either way (DECISIONS.md §13), and losing it is the moment a new player
    // most needs something to have come of the game.
    const won = view.winner === 'player';
    const reports = [reportProgress('matches', 1)];
    if (won) reports.push(reportProgress('wins', 1));
    void questsMovedSince(questsBefore, reports).then((moves) => {
      // "Play again" in the meantime: these belong to the match before.
      if (match === matchId) questMoves = moves;
    });
    if (!won) return;

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
</script>

<svelte:head><title>Practice — Flashstone</title></svelte:head>

<MatchTable
  {view}
  bind:events
  interactive={!aiThinking}
  opponentName={aiClass}
  {overTitle}
  {goldWon}
  {questMoves}
  overAction="Play again"
  on:playCard={onPlayCard}
  on:attack={onAttack}
  on:heroAttack={onHeroAttack}
  on:heroPower={onHeroPower}
  on:endTurn={onEndTurn}
  on:choose={(e) => source?.choose(e.detail.index)}
  on:mulligan={(e) => source?.mulligan(e.detail.replace)}
  on:emote={(e) => source?.emote(e.detail.id)}
  {emote}
  on:drained={onDrained}
  on:overAction={start}
/>
