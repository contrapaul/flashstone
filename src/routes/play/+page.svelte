<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import CardPreview from '$lib/components/CardPreview.svelte';
  import MinionView from '$lib/components/MinionView.svelte';
  import HeroPortrait from '$lib/components/HeroPortrait.svelte';
  import ManaTray from '$lib/components/ManaTray.svelte';
  import CardBack from '$lib/components/CardBack.svelte';
  import TurnBanner from '$lib/components/TurnBanner.svelte';
  import FloatingNumber from '$lib/components/FloatingNumber.svelte';
  import Chronicle from '$lib/components/Chronicle.svelte';
  import { buildDemoDeck } from '$lib/data/demoDeck';
  import { isLegal, resolveDeck } from '$lib/decks/deck';
  import { loadCollection, loadDeck } from '$lib/decks/storage';
  import { playAiTurn } from '$lib/engine/ai';
  import { attack, canPlayCard, createMatch, endTurn, playCard } from '$lib/engine/engine';
  import { EVENT_BEAT, type GameEvent } from '$lib/engine/events';
  import { canAttack, legalTargets } from '$lib/engine/state';
  import type { Card } from '../../types/cards';

  // Both sides play the same list, so imported cards show up on each board.
  let deckCards: Card[] = buildDemoDeck();
  let deckName = 'Demo deck';
  let state = createMatch(deckCards, deckCards, Date.now() % 100000);
  let selectedId: string | null = null;
  let aiThinking = false;

  // ── Presentation-only state, driven by the engine's event queue ──
  let summoningId: string | null = null;
  let attackingId: string | null = null;
  let dyingIds = new Set<string>();
  let drawnIndex: number | null = null;
  let hitHero: 'player' | 'ai' | null = null;
  let banner: string | null = null;
  let floats: { id: number; text: string; color: string; x: number; y: number }[] = [];
  let floatSeq = 0;
  let draining = false;
  let handWidth = 1440;

  onMount(() => {
    const collection = loadCollection();
    const saved = loadDeck();
    if (collection && saved && isLegal(saved, collection)) {
      deckCards = resolveDeck(saved, collection);
      deckName = saved.name;
    }
    restart();
    onResize();
    window.addEventListener('resize', onResize);
  });

  onDestroy(() => {
    if (typeof window !== 'undefined') window.removeEventListener('resize', onResize);
  });

  function onResize() {
    handWidth = window.innerWidth;
  }

  $: me = state.players.player;
  $: foe = state.players.ai;
  $: myTurn = state.current === 'player' && !state.winner && !aiThinking && !draining;
  $: targets = myTurn && selectedId ? legalTargets(state, 'ai') : [];
  $: heroTargetable = targets.some((t) => t.kind === 'hero');
  // Must be a reactive value, not a function call: Svelte only re-evaluates a
  // prop expression when something it references is dirty.
  $: targetableIds = new Set(
    targets.flatMap((t) => (t.kind === 'minion' ? [t.minion.instanceId] : []))
  );

  // Nothing affordable in hand and nothing left that can swing: the turn is
  // spent, so the End Turn button lights up rather than making you hunt.
  $: spent =
    myTurn &&
    !me.hand.some((_, i) => canPlayCard(state, 'player', i)) &&
    !me.board.some(canAttack);

  // The hand never overlaps: it scales down as it grows, so no card can cover
  // a neighbour's cost crystal or stat gems. HAND_LIMIT is 10.
  $: handScale = Math.min(1, Math.min(handWidth - 90, 1260) / (Math.max(1, me.hand.length) * 146));

  // ── Event playback ───────────────────────────────────────────
  // The engine appends cues to state.events as it mutates. We drain them on a
  // timeline so an attack lunges before its target shatters. State is already
  // final by the time we start — these are cosmetics laid over the result.

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  async function drain() {
    if (draining) return;
    // Tolerates an engine that does not emit yet: the queue is simply empty.
    if (!state.events) state.events = [];
    draining = true;
    while (state.events.length > 0) {
      const event = state.events.shift() as GameEvent;
      await play(event);
      await sleep(EVENT_BEAT[event.type] * 0.6);
      state = state;
    }
    draining = false;
    state = state;
  }

  async function play(event: GameEvent) {
    switch (event.type) {
      case 'summon':
        summoningId = event.instanceId;
        setTimeout(() => (summoningId = null), EVENT_BEAT.summon);
        break;
      case 'attack':
        attackingId = event.instanceId;
        setTimeout(() => (attackingId = null), 520);
        break;
      case 'damage':
        pushFloat(`-${event.amount}`, '#ff8a6a');
        if (event.target.kind === 'hero') {
          hitHero = event.target.owner;
          setTimeout(() => (hitHero = null), 520);
        }
        break;
      case 'shield':
        pushFloat('Shield', '#f6dd93');
        break;
      case 'death':
        dyingIds = new Set(dyingIds).add(event.instanceId);
        setTimeout(() => {
          const next = new Set(dyingIds);
          next.delete(event.instanceId);
          dyingIds = next;
        }, EVENT_BEAT.death);
        break;
      case 'draw':
        if (event.owner === 'player') {
          drawnIndex = state.players.player.hand.length - 1;
          setTimeout(() => (drawnIndex = null), EVENT_BEAT.draw);
        }
        break;
      case 'turn':
        banner = event.owner === 'player' ? 'Your Turn' : "Opponent's Turn";
        setTimeout(() => (banner = null), EVENT_BEAT.turn);
        break;
    }
  }

  function pushFloat(text: string, color: string) {
    const id = ++floatSeq;
    floats = [...floats, { id, text, color, x: 50, y: 46 }];
    setTimeout(() => (floats = floats.filter((f) => f.id !== id)), 900);
  }

  // ── Player actions ───────────────────────────────────────────

  function onHandCard(index: number) {
    if (!myTurn || !canPlayCard(state, 'player', index)) return;
    playCard(state, 'player', index);
    selectedId = null;
    state = state;
    drain();
  }

  function onMyMinion(instanceId: string) {
    if (!myTurn) return;
    const minion = me.board.find((m) => m.instanceId === instanceId);
    if (!minion || !canAttack(minion)) return;
    selectedId = selectedId === instanceId ? null : instanceId;
  }

  function onEnemyTarget(target: { kind: 'minion'; instanceId: string } | { kind: 'hero' }) {
    if (!myTurn || !selectedId) return;
    attack(state, 'player', selectedId, target);
    selectedId = null;
    state = state;
    drain();
  }

  function onEndTurn() {
    if (!myTurn) return;
    selectedId = null;
    endTurn(state);
    state = state;
    drain().then(runAi);
  }

  function runAi() {
    if (state.winner || state.current !== 'ai') return;
    aiThinking = true;
    // A beat so the player can read what the AI did.
    setTimeout(async () => {
      playAiTurn(state);
      state = state;
      await drain();
      aiThinking = false;
      state = state;
    }, 700);
  }

  function restart() {
    state = createMatch(deckCards, deckCards, Date.now() % 100000);
    selectedId = null;
    aiThinking = false;
    dyingIds = new Set();
    floats = [];
    banner = 'Your Turn';
    setTimeout(() => (banner = null), 1400);
  }

  $: phase = state.winner
    ? 'match over'
    : aiThinking
      ? 'opponent is thinking'
      : myTurn
        ? selectedId
          ? 'choose a target'
          : 'your move'
        : 'waiting';
</script>

<svelte:head><title>Play — Flashstone</title></svelte:head>

<main class="table">
  <div class="vignette" aria-hidden="true"></div>

  <!-- Opponent -->
  <section class="hero-row foe">
    <div class="foe-hand" aria-hidden="true">
      {#each foe.hand as _, i}
        <span class="foe-card" style:transform={`rotate(${i * 3 - 6}deg)`} style:margin-left={i ? '-11px' : '0'}></span>
      {/each}
    </div>

    <div></div>

    <div class="hero-block">
      <HeroPortrait
        label="Opponent"
        side="foe"
        health={foe.health}
        armor={foe.armor}
        targetable={heroTargetable}
        hit={hitHero === 'ai'}
        on:click={() => onEnemyTarget({ kind: 'hero' })}
      />
      <div class="hero-meta">
        <span>Opponent</span>
        <span>Mana {foe.mana}/{foe.maxMana}</span>
      </div>
    </div>

    <div class="deck-pile">
      <CardBack scale={0.34} hue={266} mark="F" />
      <span class="deck-count">{foe.deck.length}</span>
    </div>
  </section>

  <section class="board">
    {#each foe.board as minion (minion.instanceId)}
      <MinionView
        {minion}
        targetable={targetableIds.has(minion.instanceId)}
        summoning={summoningId === minion.instanceId}
        attacking={attackingId === minion.instanceId ? 'down' : null}
        dying={dyingIds.has(minion.instanceId)}
        on:click={() => onEnemyTarget({ kind: 'minion', instanceId: minion.instanceId })}
      />
    {/each}
  </section>

  <div class="centre">
    <span class="rule"></span>
    <span class="phase">{phase}</span>
    <span class="rule"></span>
  </div>

  <section class="board">
    {#each me.board as minion (minion.instanceId)}
      <MinionView
        {minion}
        ready={myTurn && canAttack(minion)}
        selected={selectedId === minion.instanceId}
        summoning={summoningId === minion.instanceId}
        attacking={attackingId === minion.instanceId ? 'up' : null}
        dying={dyingIds.has(minion.instanceId)}
        on:click={() => onMyMinion(minion.instanceId)}
      />
    {/each}
  </section>

  <!-- You -->
  <section class="hero-row you">
    <ManaTray mana={me.mana} maxMana={me.maxMana} />

    <div class="hero-block reverse">
      <div class="hero-meta right">
        <span>You</span>
        <span>Deck {me.deck.length}</span>
      </div>
      <HeroPortrait
        label="You"
        side="you"
        health={me.health}
        armor={me.armor}
        hit={hitHero === 'player'}
      />
    </div>

    <button class="end-turn" class:spent on:click={onEndTurn} disabled={!myTurn}>
      {myTurn ? 'End Turn' : 'Waiting'}
    </button>
  </section>

  <section class="hand" style:transform={`scale(${handScale.toFixed(3)})`}>
    {#each me.hand as card, i (i + card.id)}
      <CardPreview
        {card}
        playable={myTurn && canPlayCard(state, 'player', i)}
        drawn={drawnIndex === i}
        on:click={() => onHandCard(i)}
        on:keydown={(e) => e.key === 'Enter' && onHandCard(i)}
      />
    {/each}
  </section>

  {#each floats as float (float.id)}
    <FloatingNumber text={float.text} color={float.color} x={float.x} y={float.y} />
  {/each}

  <TurnBanner text={banner} />
  <Chronicle lines={state.log} />

  {#if state.winner}
    <div class="overlay">
      <div class="result">
        <h2>{state.winner === 'player' ? 'Victory' : state.winner === 'ai' ? 'Defeat' : 'Draw'}</h2>
        <button on:click={restart}>Play again</button>
      </div>
    </div>
  {/if}
</main>

<style>
  /* The board is height-locked to the viewport with a floor, so the hand is
     never below the fold on a 900px screen and short screens scroll instead
     of clipping. Row heights sum to 824px. */
  .table {
    position: relative;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    /* border-box so the 10px padding sits inside the height, and 55px because
       the nav is 54px tall plus a 1px bottom border. */
    box-sizing: border-box;
    height: calc(100vh - 55px);
    min-height: 824px;
    /* 12px, not 10: the hand cards' stat gems overhang the card frame. */
    padding-bottom: 12px;
    background: radial-gradient(120% 90% at 50% -10%, #2a1c11 0%, #150e08 45%, var(--ink) 100%);
  }

  .vignette {
    position: absolute;
    inset: 0;
    background: radial-gradient(60% 45% at 50% 50%, rgba(255, 196, 110, .09), transparent 70%);
    pointer-events: none;
  }

  .hero-row {
    position: relative;
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: 20px;
  }

  .hero-row.foe { padding: 16px 28px 0; grid-template-columns: 1fr auto 1fr; }
  .hero-row.you { padding: 6px 28px 0; }

  .hero-row.foe > .hero-block { grid-column: 2; }
  .hero-row.foe > .deck-pile { grid-column: 3; justify-self: end; }
  .hero-row.you > .hero-block { grid-column: 2; }
  .hero-row.you > .end-turn { grid-column: 3; justify-self: end; }

  .foe-hand {
    position: absolute;
    left: 0;
    right: 0;
    top: 2px;
    display: flex;
    justify-content: center;
    pointer-events: none;
  }

  .foe-card {
    width: 32px;
    height: 46px;
    border-radius: 5px;
    border: 1px solid #7a5c30;
    background: linear-gradient(180deg, #4a3620, #241810);
    box-shadow: 0 6px 12px rgba(0, 0, 0, .5);
  }

  .hero-block { display: flex; align-items: center; gap: 14px; }
  .hero-block.reverse { flex-direction: row; }

  .hero-meta {
    display: flex;
    flex-direction: column;
    gap: 3px;
    font-family: var(--display);
    font-size: 11px;
    letter-spacing: .06em;
    text-transform: uppercase;
    color: var(--text-dim);
  }
  .hero-meta.right { text-align: right; }

  .deck-pile {
    position: relative;
    width: 46px;
    height: 64px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    border: 1px solid #7a5c30;
    background: linear-gradient(180deg, #4a3620, #241810);
    box-shadow: 4px 4px 0 -1px #2c1f12, 8px 8px 0 -2px #241810, 0 10px 18px rgba(0, 0, 0, .6);
    overflow: hidden;
  }

  .deck-count {
    position: absolute;
    font-family: var(--display);
    font-size: 13px;
    color: #f0dcae;
  }

  .board {
    position: relative;
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 10px;
    min-height: 142px;
    padding: 6px 28px;
  }

  .centre {
    position: relative;
    display: flex;
    align-items: center;
    gap: 16px;
    height: 32px;
    padding: 0 28px;
  }

  .rule { flex: 1; height: 1px; background: linear-gradient(90deg, transparent, #6b512f, transparent); }

  .phase {
    font-family: var(--display);
    font-size: 10px;
    letter-spacing: .3em;
    text-transform: uppercase;
    white-space: nowrap;
    color: #8a7050;
  }

  .end-turn {
    padding: 13px 26px;
    border: 1px solid var(--rule);
    border-radius: 5px;
    background: linear-gradient(180deg, #2a2118, #1a1410);
    color: var(--text-faint);
    font-family: var(--display);
    font-weight: 700;
    font-size: 11.5px;
    letter-spacing: .18em;
    text-transform: uppercase;
    cursor: default;
    transition: all .18s ease;
  }

  .end-turn:not(:disabled) {
    border-color: #e3bf72;
    background: linear-gradient(180deg, #b98a34, #7a5620);
    color: #1a1207;
    cursor: pointer;
    box-shadow: 0 8px 18px rgba(0, 0, 0, .5), inset 0 1px 0 rgba(255, 240, 200, .5),
      0 0 18px rgba(224, 190, 118, .25);
  }

  .end-turn.spent:not(:disabled) {
    border-color: #8fc8ff;
    animation: fs-end-turn 1.6s ease-in-out infinite;
  }

  /* Cards keep an 8px gap and never overlap; the row scales instead. */
  .hand {
    position: relative;
    display: flex;
    justify-content: center;
    align-items: flex-end;
    gap: 8px;
    height: 170px;
    flex: 0 0 170px;
    padding-top: 2px;
    transform-origin: bottom center;
    transition: transform .2s ease;
  }

  .overlay {
    position: absolute;
    inset: 0;
    z-index: 70;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(11, 8, 5, .86);
    backdrop-filter: blur(3px);
  }

  .result {
    padding: 44px 66px;
    text-align: center;
    border: 1px solid #7a5c30;
    border-radius: 8px;
    background: linear-gradient(180deg, #241809, var(--ink-2));
    box-shadow: 0 30px 70px rgba(0, 0, 0, .8), inset 0 1px 0 rgba(255, 224, 160, .2);
  }

  .result h2 {
    margin: 0;
    font-family: var(--display);
    font-size: 34px;
    font-weight: 700;
    letter-spacing: .14em;
    color: var(--gold-bright);
    text-shadow: 0 0 30px rgba(240, 214, 138, .4);
  }

  .result button {
    margin-top: 22px;
    padding: 11px 30px;
    border: 1px solid #e3bf72;
    border-radius: 5px;
    background: linear-gradient(180deg, #b98a34, #7a5620);
    color: #1a1207;
    font-family: var(--display);
    font-weight: 700;
    font-size: 12px;
    letter-spacing: .16em;
    text-transform: uppercase;
    cursor: pointer;
    box-shadow: 0 6px 16px rgba(0, 0, 0, .5), inset 0 1px 0 rgba(255, 240, 200, .5);
  }
</style>
