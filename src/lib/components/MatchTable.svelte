<script lang="ts">
  import { createEventDispatcher, onDestroy } from 'svelte';
  import CardPreview from './CardPreview.svelte';
  import MinionView from './MinionView.svelte';
  import HeroPortrait from './HeroPortrait.svelte';
  import ManaTray from './ManaTray.svelte';
  import CardBack from './CardBack.svelte';
  import TurnBanner from './TurnBanner.svelte';
  import FloatingNumber from './FloatingNumber.svelte';
  import Chronicle from './Chronicle.svelte';
  import CardInspector from './CardInspector.svelte';
  import { settings } from '../settings';
  import { EVENT_BEAT, type GameEvent } from '../engine/events';
  import type { PlayerView, SerialisedMinion, TargetRef } from '../net/protocol';
  import {
    canAttackFromView,
    canPlayFromView,
    chosenTargetsFromView,
    isMyTurn,
    legalTargetsFromView,
    turnIsSpent
  } from '../net/view';
  import type { ChosenRef } from '../net/protocol';
  import type { Card } from '../../types/cards';

  /**
   * The table. **One board for both modes.**
   *
   * It renders a `PlayerView` and emits intents; it has no idea whether the
   * other player is the local AI or someone across a socket. That is deliberate
   * — the moment this file branches on the mode, the two games start drifting
   * apart in exactly the small ways that make one of them feel wrong.
   *
   * Authority lives elsewhere. The legality helpers here decide what to
   * highlight, never what is allowed; the engine refuses anything they get wrong.
   */

  export let view: PlayerView;
  /** Cues to animate, drained on a timeline. Reassign to enqueue more. */
  export let events: GameEvent[] = [];
  /** Blocks input while the opponent is thinking, or a match has not started. */
  export let interactive = true;
  export let opponentBack = 'default';
  export let deckName = '';
  /** Game-over overlay. Owned by the table so its styles are not orphaned. */
  export let overTitle: string | null = null;
  export let overNote: string | null = null;
  export let overAction: string | null = null;

  const dispatch = createEventDispatcher<{
    playCard: { handIndex: number; slot?: number; target?: ChosenRef };
    attack: { instanceId: string; target: TargetRef };
    heroAttack: { target: TargetRef };
    endTurn: void;
    drained: void;
    overAction: void;
  }>();

  // ── Presentation state, driven by the event queue ──
  let summoningId: string | null = null;
  let dyingIds = new Set<string>();
  let struckIds = new Set<string>();
  let quaking = false;
  let drawnCards = new Set<Card>();
  let hitHero: 'me' | 'foe' | null = null;
  let banner: string | null = null;
  let floats: { id: number; text: string; color: string; x: number; y: number }[] = [];
  let floatSeq = 0;
  let draining = false;
  let handWidth = 1440;
  let handHeight = 900;
  let inspected: Card | null = null;

  let myBoardEl: HTMLElement | undefined;
  let foeBoardEl: HTMLElement | undefined;
  let foeHeroEl: HTMLElement | undefined;
  let myHeroEl: HTMLElement | undefined;

  if (typeof window !== 'undefined') {
    handWidth = window.innerWidth;
    handHeight = window.innerHeight;
  }

  function onResize() {
    handWidth = window.innerWidth;
    handHeight = window.innerHeight;
  }

  const DESIGN_HEIGHT = 824;
  $: fit = Math.max(0.7, Math.min(1, (handHeight - 55) / DESIGN_HEIGHT));
  const RAIL_MIN_WIDTH = 1500;
  $: railed = handWidth >= RAIL_MIN_WIDTH;

  $: myTurn = interactive && isMyTurn(view) && !draining;
  $: activeAttacker = drag?.kind === 'attack' ? drag.instanceId : selectedId;
  $: targets = myTurn && (activeAttacker || heroSelected) ? legalTargetsFromView(view) : [];
  $: heroTargetable = targets.some((t) => t.kind === 'hero');
  // Must be a reactive value, not a function call in a prop: Svelte 4 only
  // re-evaluates a prop when an identifier it references is dirty.
  $: targetableIds = new Set(
    targets.flatMap((t) => (t.kind === 'minion' ? [t.instanceId] : []))
  );
  $: spent = myTurn && turnIsSpent(view);

  /** Cards whose draw cue is still queued are held back, so a draw is first
      seen on its own animation rather than appearing a second earlier. */
  $: pendingDraws = events.filter((e) => e.type === 'draw' && e.owner === view.you).length;
  $: visibleHand = view.me.hand.slice(0, view.me.hand.length - pendingDraws);

  $: handScale = Math.min(
    1,
    Math.min(handWidth / fit - 90, 1260) / (Math.max(1, visibleHand.length) * 146)
  );

  $: phase = view.winner
    ? 'match over'
    : draining
      ? '…'
      : myTurn
        ? 'your move'
        : 'opponent';

  // ── Event playback ────────────────────────────────────────
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  // Drains whenever new cues arrive.
  $: if (events.length > 0 && !draining) void drain();

  async function drain() {
    if (draining) return;
    draining = true;
    while (events.length > 0) {
      rememberPositions();
      const event = events.shift() as GameEvent;
      events = events;
      await play(event);
      await sleep(EVENT_BEAT[event.type] * 0.6);
    }
    draining = false;
    dispatch('drained');
  }

  /** Which side of the table an event's owner is on, from this seat. */
  function sideOf(owner: string): 'me' | 'foe' {
    return owner === view.you ? 'me' : 'foe';
  }

  async function play(event: GameEvent) {
    switch (event.type) {
      case 'summon':
        summoningId = event.instanceId;
        setTimeout(() => (summoningId = null), 260);
        break;
      case 'draw': {
        if (sideOf(event.owner) !== 'me') break;
        const card = view.me.hand[view.me.hand.length - pendingDraws];
        if (card) {
          drawnCards = new Set(drawnCards).add(card);
          setTimeout(() => {
            const next = new Set(drawnCards);
            next.delete(card);
            drawnCards = next;
          }, 460);
        }
        break;
      }
      case 'attack':
        struckIds = new Set(struckIds).add(event.instanceId);
        setTimeout(() => {
          const next = new Set(struckIds);
          next.delete(event.instanceId);
          struckIds = next;
        }, 260);
        break;
      case 'damage': {
        if (event.target.kind === 'hero') {
          hitHero = sideOf(event.target.owner);
          quaking = event.amount >= 4;
          setTimeout(() => {
            hitHero = null;
            quaking = false;
          }, 380);
          floatAt(heroPos(sideOf(event.target.owner)), `-${event.amount}`, 'var(--blood)');
        } else {
          const id = event.target.instanceId;
          struckIds = new Set(struckIds).add(id);
          setTimeout(() => {
            const next = new Set(struckIds);
            next.delete(id);
            struckIds = next;
          }, 300);
          floatAt(positions.get(id), `-${event.amount}`, 'var(--blood)');
        }
        break;
      }
      case 'death':
        dyingIds = new Set(dyingIds).add(event.instanceId);
        setTimeout(() => {
          const next = new Set(dyingIds);
          next.delete(event.instanceId);
          dyingIds = next;
        }, 420);
        break;
      case 'turn':
        banner = sideOf(event.owner) === 'me' ? 'Your turn' : "Opponent's turn";
        setTimeout(() => (banner = null), 900);
        break;
      case 'shield':
        floatAt(positions.get(event.instanceId), 'Shield', 'var(--gold-bright)');
        break;
      case 'buff':
        floatAt(positions.get(event.instanceId), 'Buff', 'var(--good)');
        break;
      case 'freeze':
        floatAt(positions.get(event.instanceId), 'Frozen', '#8fd0ff');
        break;
      case 'silence':
        floatAt(positions.get(event.instanceId), 'Silenced', 'var(--text-dim)');
        break;
    }
  }

  let positions = new Map<string, { x: number; y: number }>();

  function rememberPositions() {
    const next = new Map<string, { x: number; y: number }>();
    for (const [el, id] of minionElements()) next.set(id, centreOf(el));
    positions = next;
  }

  function minionElements(): [HTMLElement, string][] {
    const pairs: [HTMLElement, string][] = [];
    const record = (root: HTMLElement | undefined, board: SerialisedMinion[]) => {
      if (!root) return;
      const els = [...root.querySelectorAll<HTMLElement>('.minion')];
      board.forEach((m, i) => {
        if (els[i]) pairs.push([els[i], m.instanceId]);
      });
    };
    record(myBoardEl, view.me.board);
    record(foeBoardEl, view.foe.board);
    return pairs;
  }

  function centreOf(el: HTMLElement) {
    const rect = el.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }

  function heroPos(side: 'me' | 'foe') {
    const el = side === 'me' ? myHeroEl : foeHeroEl;
    return el ? centreOf(el) : undefined;
  }

  function floatAt(at: { x: number; y: number } | undefined, text: string, color: string) {
    if (!at) return;
    const id = floatSeq++;
    floats = [...floats, { id, text, color, x: at.x, y: at.y }];
    setTimeout(() => (floats = floats.filter((f) => f.id !== id)), 900);
  }

  // ── Input ─────────────────────────────────────────────────
  const DRAG_THRESHOLD = 8;

  type Drag =
    | { kind: 'card'; handIndex: number; card: Card; slot: number }
    | { kind: 'attack'; instanceId: string; from: { x: number; y: number }; target: TargetRef | null };

  type Press =
    | { id: number; x: number; y: number; kind: 'card'; handIndex: number }
    | { id: number; x: number; y: number; kind: 'attack'; instanceId: string };

  let drag: Drag | null = null;
  let press: Press | null = null;
  let pointer = { x: 0, y: 0 };
  let selectedId: string | null = null;
  let swallowClick = false;

  /**
   * A card waiting to be aimed.
   *
   * Dropping a targeted card on the board does not play it — it arms this, and
   * the next click on a legal character casts it. Anything else cancels. The
   * card is not spent until the target lands, so backing out costs nothing.
   */
  let aiming: { handIndex: number; card: Card } | null = null;

  $: chosenTargets = aiming ? chosenTargetsFromView(view, aiming.card) : [];
  $: chosenMinionIds = new Set(
    chosenTargets.flatMap((t) => (t.kind === 'minion' ? [t.instanceId] : []))
  );
  $: canAimFoeHero = chosenTargets.some((t) => t.kind === 'hero' && t.side === 'foe');
  $: canAimMyHero = chosenTargets.some((t) => t.kind === 'hero' && t.side === 'me');

  function cancelAim() {
    aiming = null;
  }

  /** Escape backs out of aiming or an armed hero without spending anything. */
  function onWindowKey(event: KeyboardEvent) {
    if (event.key !== 'Escape') return;
    cancelAim();
    heroSelected = false;
  }

  function castAt(target: ChosenRef) {
    if (!aiming) return;
    dispatch('playCard', { handIndex: aiming.handIndex, target });
    aiming = null;
  }

  function needsAiming(card: Card): boolean {
    return card.effects.some((e) => e.trigger === 'Battlecry' && e.target === 'Chosen');
  }

  function openInspector(card: Card | undefined) {
    if (drag || !card) return;
    inspected = card;
  }

  /** The minion as it stands now, so buffs and damage show, not the printed card. */
  function inspectCard(minion: SerialisedMinion): Card {
    return {
      ...minion.card,
      attack: minion.attack,
      health: minion.health,
      keywords: [...minion.keywords] as Card['keywords']
    };
  }

  function onCardPointerDown(event: PointerEvent, index: number) {
    // No playability check: a card you cannot afford must still open when
    // tapped. Only the drag below is gated on being able to play it.
    press = { id: event.pointerId, x: event.clientX, y: event.clientY, kind: 'card', handIndex: index };
    pointer = { x: event.clientX, y: event.clientY };
  }

  function onMinionPointerDown(event: PointerEvent, minion: SerialisedMinion) {
    if (!myTurn || !canAttackFromView(minion)) return;
    press = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      kind: 'attack',
      instanceId: minion.instanceId
    };
    pointer = { x: event.clientX, y: event.clientY };
  }

  function slotAt(x: number): number {
    if (!myBoardEl) return view.me.board.length;
    const els = [...myBoardEl.querySelectorAll<HTMLElement>('.minion')];
    let slot = els.length;
    els.forEach((el, i) => {
      const rect = el.getBoundingClientRect();
      if (x < rect.left + rect.width / 2 && slot === els.length) slot = i;
    });
    return slot;
  }

  function overMyBoard(y: number): boolean {
    if (!myBoardEl) return false;
    const rect = myBoardEl.getBoundingClientRect();
    return y > rect.top - 60 && y < rect.bottom + 90;
  }

  function targetAt(x: number, y: number): TargetRef | null {
    const legal = legalTargetsFromView(view);
    if (foeBoardEl) {
      const els = [...foeBoardEl.querySelectorAll<HTMLElement>('.minion')];
      for (let i = 0; i < els.length; i++) {
        const rect = els[i].getBoundingClientRect();
        if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
          const id = view.foe.board[i]?.instanceId;
          const match = legal.find((t) => t.kind === 'minion' && t.instanceId === id);
          return match ?? null;
        }
      }
    }
    if (foeHeroEl) {
      const rect = foeHeroEl.getBoundingClientRect();
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
        return legal.find((t) => t.kind === 'hero') ?? null;
      }
    }
    return null;
  }

  function onPointerMove(event: PointerEvent) {
    if (!press || event.pointerId !== press.id) return;
    pointer = { x: event.clientX, y: event.clientY };

    if (!drag) {
      const travelled = Math.hypot(event.clientX - press.x, event.clientY - press.y);
      if (travelled < DRAG_THRESHOLD) return;

      if (press.kind === 'card') {
        const card = view.me.hand[press.handIndex];
        if (!card || !canPlayFromView(view, press.handIndex) || !myTurn) return;
        drag = { kind: 'card', handIndex: press.handIndex, card, slot: view.me.board.length };
      } else {
        const attacking = press.instanceId;
        const index = view.me.board.findIndex((m) => m.instanceId === attacking);
        const el = myBoardEl?.querySelectorAll<HTMLElement>('.minion')[index];
        drag = {
          kind: 'attack',
          instanceId: attacking,
          from: el ? centreOf(el) : { x: event.clientX, y: event.clientY },
          target: null
        };
      }
    }

    drag =
      drag.kind === 'card'
        ? { ...drag, slot: slotAt(event.clientX) }
        : { ...drag, target: targetAt(event.clientX, event.clientY) };

    if (event.cancelable) event.preventDefault();
  }

  function onPointerUp(event: PointerEvent) {
    if (!press || event.pointerId !== press.id) return;

    const finished = drag;
    const tapped = press;
    press = null;
    drag = null;

    // A tap opens the card for reading. Dragging is the only way to play one,
    // so a tap can never spend mana by mistake.
    if (!finished) {
      if (tapped.kind === 'card') openInspector(view.me.hand[tapped.handIndex]);
      return;
    }

    swallowClick = true;
    setTimeout(() => (swallowClick = false), 0);

    if (finished.kind === 'card') {
      if (!overMyBoard(event.clientY)) return;
      if (!canPlayFromView(view, finished.handIndex)) return;
      // A card that must be aimed enters targeting mode rather than resolving.
      if (needsAiming(finished.card)) {
        aiming = { handIndex: finished.handIndex, card: finished.card };
        return;
      }
      dispatch('playCard', { handIndex: finished.handIndex, slot: finished.slot });
    } else {
      if (!finished.target) return;
      dispatch('attack', { instanceId: finished.instanceId, target: finished.target });
    }
    selectedId = null;
  }

  function onPointerCancel() {
    press = null;
    drag = null;
  }

  function onCardKey(event: KeyboardEvent, index: number) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    openInspector(view.me.hand[index]);
  }

  function onMyMinion(minion: SerialisedMinion) {
    if (swallowClick) return;
    if (aiming) {
      if (chosenMinionIds.has(minion.instanceId)) castAt({ kind: 'minion', instanceId: minion.instanceId });
      else cancelAim();
      return;
    }
    if (myTurn && canAttackFromView(minion)) {
      selectedId = selectedId === minion.instanceId ? null : minion.instanceId;
      return;
    }
    openInspector(inspectCard(minion));
  }

  function onEnemyMinion(minion: SerialisedMinion) {
    if (swallowClick) return;
    if (aiming) {
      if (chosenMinionIds.has(minion.instanceId)) castAt({ kind: 'minion', instanceId: minion.instanceId });
      else cancelAim();
      return;
    }
    if (myTurn && activeAttacker) {
      if (targetableIds.has(minion.instanceId)) {
        dispatch('attack', {
          instanceId: activeAttacker,
          target: { kind: 'minion', instanceId: minion.instanceId }
        });
        selectedId = null;
      }
      return;
    }
    if (myTurn && heroSelected && view.me.canHeroAttack) {
      if (targetableIds.has(minion.instanceId)) {
        dispatch('heroAttack', { target: { kind: 'minion', instanceId: minion.instanceId } });
        heroSelected = false;
      }
      return;
    }
    openInspector(inspectCard(minion));
  }

  function onEnemyHero() {
    if (swallowClick) return;
    if (aiming) {
      if (canAimFoeHero) castAt({ kind: 'hero', side: 'foe' });
      else cancelAim();
      return;
    }
    if (!myTurn) return;
    // An armed hero swinging takes precedence over a selected minion: it is the
    // only thing the hero portrait can do on the attacking side.
    if (activeAttacker && heroTargetable) {
      dispatch('attack', { instanceId: activeAttacker, target: { kind: 'hero' } });
      selectedId = null;
      return;
    }
    if (view.me.canHeroAttack && heroSelected) {
      dispatch('heroAttack', { target: { kind: 'hero' } });
      heroSelected = false;
    }
  }

  /** Tapping your own hero arms it; the next click on a legal target swings. */
  let heroSelected = false;

  function onMyHero() {
    if (swallowClick) return;
    if (aiming) {
      if (canAimMyHero) castAt({ kind: 'hero', side: 'me' });
      else cancelAim();
      return;
    }
    if (myTurn && view.me.canHeroAttack) heroSelected = !heroSelected;
  }

  function onEndTurn() {
    if (!myTurn) return;
    selectedId = null;
    dispatch('endTurn');
  }

  // The aiming arrow, shared by dragging and tap-to-select.
  $: aim = (() => {
    if (drag?.kind !== 'attack') return null;
    const end = drag.target ? targetCentre(drag.target) : pointer;
    const from = drag.from;
    const midX = (from.x + end.x) / 2;
    const midY = Math.min(from.y, end.y) - 60;
    return { path: `M ${from.x} ${from.y} Q ${midX} ${midY} ${end.x} ${end.y}`, end };
  })();

  function targetCentre(target: TargetRef) {
    if (target.kind === 'hero') return foeHeroEl ? centreOf(foeHeroEl) : pointer;
    const index = view.foe.board.findIndex((m) => m.instanceId === target.instanceId);
    const el = foeBoardEl?.querySelectorAll<HTMLElement>('.minion')[index];
    return el ? centreOf(el) : pointer;
  }

  onDestroy(() => {
    if (typeof window !== 'undefined') window.removeEventListener('resize', onResize);
  });
  if (typeof window !== 'undefined') window.addEventListener('resize', onResize);
</script>

<svelte:window
  on:pointermove={onPointerMove}
  on:pointerup={onPointerUp}
  on:pointercancel={onPointerCancel}
  on:keydown={onWindowKey}
/>

<main class="table" class:quaking style:--fit={fit.toFixed(3)}>
  <div class="vignette" aria-hidden="true"></div>

  <section class="hero-row foe">
    <div class="foe-hand" aria-hidden="true">
      {#each Array(view.foe.handCount) as _, i}
        <span
          class="foe-card"
          style:transform={`rotate(${(i - (view.foe.handCount - 1) / 2) * 3.2}deg)`}
          style:margin-left={i ? '-58px' : '0'}
        >
          <CardBack backId={opponentBack} />
        </span>
      {/each}
    </div>

    <div></div>

    <div class="hero-block" bind:this={foeHeroEl}>
      <HeroPortrait
        label="Opponent"
        side="foe"
        health={view.foe.health}
        armor={view.foe.armor}
        weapon={view.foe.weapon}
        targetable={heroTargetable || (aiming !== null && canAimFoeHero)}
        hit={hitHero === 'foe'}
        on:click={onEnemyHero}
      />
      <div class="hero-meta">
        <span>Opponent</span>
        <span>Mana {view.foe.mana}/{view.foe.maxMana}</span>
      </div>
    </div>

    <div class="deck-pile">
      <CardBack backId={opponentBack} scale={0.34} />
      <span class="deck-count">{view.foe.deckCount}</span>
    </div>
  </section>

  <section class="board" bind:this={foeBoardEl}>
    {#each view.foe.board as minion (minion.instanceId)}
      <MinionView
        minion={minion}
        targetable={targetableIds.has(minion.instanceId) ||
          (aiming !== null && chosenMinionIds.has(minion.instanceId))}
        summoning={summoningId === minion.instanceId}
        struck={struckIds.has(minion.instanceId)}
        dying={dyingIds.has(minion.instanceId)}
        on:click={() => onEnemyMinion(minion)}
      />
    {/each}
  </section>

  <div class="centre">
    <span class="rule"></span>
    <span class="phase">{phase}</span>
    <span class="rule"></span>
  </div>

  {#if aiming}
    <!-- The card is not spent until a target lands, so cancelling costs nothing. -->
    <div class="aiming">
      <span>Choose a target for {aiming.card.name}</span>
      <button on:click={cancelAim}>Cancel</button>
    </div>
  {/if}

  <section class="board mine" class:drop-open={drag?.kind === 'card'} bind:this={myBoardEl}>
    {#each view.me.board as minion, i (minion.instanceId)}
      {#if drag?.kind === 'card' && drag.slot === i}
        <span class="drop-gap" aria-hidden="true"></span>
      {/if}
      <MinionView
        minion={minion}
        ready={myTurn && canAttackFromView(minion)}
        targetable={aiming !== null && chosenMinionIds.has(minion.instanceId)}
        selected={selectedId === minion.instanceId ||
          (drag?.kind === 'attack' && drag.instanceId === minion.instanceId)}
        summoning={summoningId === minion.instanceId}
        struck={struckIds.has(minion.instanceId)}
        dying={dyingIds.has(minion.instanceId)}
        on:click={() => onMyMinion(minion)}
        on:pointerdown={(e) => onMinionPointerDown(e, minion)}
      />
    {/each}
    {#if drag?.kind === 'card' && drag.slot >= view.me.board.length}
      <span class="drop-gap" aria-hidden="true"></span>
    {/if}
  </section>

  <section class="hero-row you">
    <ManaTray mana={view.me.mana} maxMana={view.me.maxMana} />

    <div class="hero-block reverse" bind:this={myHeroEl}>
      <div class="hero-meta right">
        <span>{deckName || 'You'}</span>
        <span>Deck {view.me.deckCount}</span>
      </div>
      <HeroPortrait
        label="You"
        side="you"
        health={view.me.health}
        armor={view.me.armor}
        weapon={view.me.weapon}
        armed={myTurn && view.me.canHeroAttack}
        targetable={aiming !== null && canAimMyHero}
        hit={hitHero === 'me'}
        on:click={onMyHero}
      />
    </div>

    <button class="end-turn" class:spent on:click={onEndTurn} disabled={!myTurn}>
      {myTurn ? 'End Turn' : 'Waiting'}
    </button>
  </section>

  <section class="hand" style:transform={`scale(${handScale.toFixed(3)})`}>
    {#each visibleHand as card, i (card)}
      <div class="hand-slot" class:lifted={drag?.kind === 'card' && drag.handIndex === i}>
        <CardPreview
          {card}
          playable={myTurn && canPlayFromView(view, i)}
          drawn={drawnCards.has(card)}
          on:keydown={(e) => onCardKey(e, i)}
          on:pointerdown={(e) => onCardPointerDown(e, i)}
        />
      </div>
    {/each}
  </section>

  {#if drag?.kind === 'card'}
    <div class="ghost" style:left={`${pointer.x}px`} style:top={`${pointer.y}px`} aria-hidden="true">
      <CardPreview card={drag.card} playable />
    </div>
  {/if}

  {#if aim}
    <svg class="aim" aria-hidden="true">
      <path class="aim-line" d={aim.path} />
      <circle
        class="aim-head"
        class:locked={drag?.kind === 'attack' && drag.target !== null}
        cx={aim.end.x}
        cy={aim.end.y}
        r={drag?.kind === 'attack' && drag.target ? 15 : 11}
      />
    </svg>
  {/if}

  {#each floats as float (float.id)}
    <FloatingNumber text={float.text} color={float.color} x={float.x} y={float.y} />
  {/each}

  <CardInspector
    card={inspected}
    showDefinition={$settings.definitionsInGame}
    on:close={() => (inspected = null)}
  />

  <TurnBanner text={banner} />
  <Chronicle lines={view.log} rail={railed} />

  {#if overTitle}
    <div class="overlay">
      <div class="result">
        <h2>{overTitle}</h2>
        {#if overNote}<p class="prize">{overNote}</p>{/if}
        {#if overAction}
          <button on:click={() => dispatch('overAction')}>{overAction}</button>
        {/if}
      </div>
    </div>
  {/if}
</main>

<style>

  /*
   * The board fits the viewport. It used to be `min-height: 824px`, with fixed
   * pixel row heights summing to 824 — which is taller than an iPad in
   * landscape has to give (1024x768, minus the 55px nav, leaves 713), so the
   * board was clipped or the page scrolled. That was the real bug behind
   * "size the play area for iPads".
   *
   * Rows are now proportional, and the whole table scales down below the height
   * it wants rather than overflowing. `--fit` is set from JS: it is the ratio
   * of the available height to the 824px the layout is designed at, clamped so
   * it never grows past 1 and never shrinks past legibility.
   */
  .table {
    position: relative;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    /* border-box so the padding sits inside the height, and 55px because
       the nav is 54px tall plus a 1px bottom border. */
    box-sizing: border-box;
    height: calc(100vh - 55px);
    /* 12px, not 10: the hand cards' stat gems overhang the card frame. */
    padding-bottom: 12px;
    overflow: hidden;
    background: radial-gradient(120% 90% at 50% -10%, #2a1c11 0%, #150e08 45%, var(--ink) 100%);
  }

  /*
   * Scaling the contents rather than the .table itself: the background must
   * still paint the full viewport, and a transform on the scroll container
   * would take the fixed-position drag layers with it.
   */
  .table > :global(.hero-row),
  .table > :global(.board),
  .table > :global(.centre),
  .table > :global(.hand) {
    zoom: var(--fit, 1);
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

  .hero-row.foe {
    padding: 16px 28px 0;
    grid-template-columns: 1fr auto 1fr;
    /* The fan hangs above this row; .table clips it to the viewport edge. */
    overflow: visible;
  }
  .hero-row.you { padding: 6px 28px 0; }

  .hero-row.foe > .hero-block { grid-column: 2; }
  .hero-row.foe > .deck-pile { grid-column: 3; justify-self: end; }
  .hero-row.you > .hero-block { grid-column: 2; }
  .hero-row.you > .end-turn { grid-column: 3; justify-self: end; }

  /*
   * The opponent's hand, at the same size as yours.
   *
   * It used to be a row of 32x46 stubs. Full-size backs are 134x168 and would
   * land straight on top of the opponent's board, so the fan hangs off the top
   * edge the way a real hand held across the table does: -132px shows the
   * bottom ~36px of each back, which is enough to read the count at a glance
   * and leaves the board row untouched.
   */
  .foe-hand {
    position: absolute;
    left: 0;
    right: 0;
    top: -132px;
    height: 168px;
    display: flex;
    justify-content: center;
    align-items: flex-start;
    pointer-events: none;
  }

  .foe-card {
    flex: none;
    width: 134px;
    height: 168px;
    transform-origin: bottom center;
    filter: drop-shadow(0 8px 14px rgba(0, 0, 0, .55));
  }

  /* CardBack's own transform-origin is for the scaled deck pile; in the fan the
     backs are unscaled and each one is rotated by its wrapper instead. */
  .foe-card :global(.back) { transform-origin: bottom center; }

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

  /* Below the height the layout is designed at, the rows give up their padding
     before the scale factor has to do the work. */
  @media (max-height: 800px) {
    .board { min-height: 128px; padding: 2px 20px; }
    .hero-row.foe { padding: 8px 20px 0; }
    .hero-row.you { padding: 2px 20px 0; }
  }

  /* Your row lights up as a drop zone while a card is in the air. */
  .board.drop-open {
    background: linear-gradient(180deg, transparent, rgba(126, 214, 140, .07), transparent);
    box-shadow: inset 0 0 0 1px rgba(126, 214, 140, .18);
    border-radius: 10px;
  }

  /* The space the dragged card would take, so the row opens where you aim. */
  /* Sits on the centre line, where the eye already is while choosing. */
  .aiming {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    z-index: 210;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 10px 8px 16px;
    border-radius: 6px;
    border: 1px solid var(--frame-lit);
    background: rgba(19, 13, 8, .95);
    box-shadow: 0 14px 30px rgba(0, 0, 0, .6);
    font-family: var(--display);
    font-size: 11px;
    letter-spacing: .14em;
    text-transform: uppercase;
    color: var(--gold-bright);
  }

  .aiming button {
    padding: 5px 12px;
    border: 1px solid var(--rule);
    border-radius: 4px;
    background: var(--ink-2);
    color: var(--text-dim);
    cursor: pointer;
    font-family: var(--display);
    font-size: 9.5px;
    letter-spacing: .14em;
    text-transform: uppercase;
  }
  .aiming button:hover { border-color: var(--frame-lit); color: var(--gold-bright); }

  .drop-gap {
    width: 96px;
    height: 116px;
    border-radius: 8px;
    border: 1px dashed rgba(126, 214, 140, .55);
    background: rgba(126, 214, 140, .08);
    animation: fs-summon .18s ease;
  }


  .ghost {
    position: fixed;
    z-index: 400;
    transform: translate(-50%, -55%) scale(1.06) rotate(-2deg);
    pointer-events: none;
    filter: drop-shadow(0 18px 26px rgba(0, 0, 0, .7));
  }

  /* The card left behind in hand while its ghost is being dragged. */
  .hand-slot.lifted { opacity: .25; }

  .aim {
    position: fixed;
    inset: 0;
    width: 100vw;
    height: 100vh;
    z-index: 380;
    pointer-events: none;
  }

  .aim-line {
    fill: none;
    stroke: rgba(126, 214, 140, .9);
    stroke-width: 5;
    stroke-linecap: round;
    filter: drop-shadow(0 0 8px rgba(126, 214, 140, .8));
  }

  .aim-head {
    fill: rgba(126, 214, 140, .28);
    stroke: rgba(150, 255, 170, .95);
    stroke-width: 3;
  }

  /* Locked onto a legal target: fill in. */
  .aim-head.locked { fill: rgba(150, 255, 170, .75); }

  /* Draggable things must not also pan the page on touch. Scoped to the table
     so cards elsewhere (the import preview, the collection) still scroll. */
  .hand :global(.card),
  .board :global(.minion) {
    touch-action: none;
  }

  .table { user-select: none; }

  /* A hero taking 7+ shakes the table, not just the portrait. */
  .table.quaking { animation: fs-quake .36s ease-out; }

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

  .prize {
    margin: 0 0 4px;
    font-family: var(--display);
    font-size: 15px;
    letter-spacing: .12em;
    color: var(--gold-bright);
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
