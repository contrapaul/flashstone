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
  import CardInspector from '$lib/components/CardInspector.svelte';
  import { settings } from '$lib/settings';
  import { buildAiDeck } from '$lib/data/aiDeck';
  import { starterDeck } from '$lib/data/starter';
  import { isLegal, resolveDeck } from '$lib/decks/deck';
  import { loadPlayer } from '$lib/collection/sync';
  import { playAiTurn } from '$lib/engine/ai';
  import { attack, canPlayCard, createMatch, endTurn, playCard } from '$lib/engine/engine';
  import { EVENT_BEAT, type GameEvent } from '$lib/engine/events';
  import { canAttack, legalTargets, type MinionInstance } from '$lib/engine/state';
  import type { Card } from '../../types/cards';

  // The starter deck is the fallback, so a first visit is playable with no
  // collection saved. The opponent always plays its own list — see aiDeck.ts.
  let deckCards: Card[] = resolveDeck(starterDeck());
  let deckName = 'Starter deck';
  const aiCards: Card[] = buildAiDeck();
  let state = createMatch(deckCards, deckCards, Date.now() % 100000);
  let selectedId: string | null = null;
  let aiThinking = false;

  // ── Presentation-only state, driven by the engine's event queue ──
  let summoningId: string | null = null;
  let dyingIds = new Set<string>();
  /** Minions mid-judder from a heavy hit, and the whole table when the hero takes one. */
  let struckIds = new Set<string>();
  let quaking = false;
  /*
   * Keyed by the card object itself, not its hand index. A single shared
   * "drawnIndex" number meant every draw's own un-cancelled timeout blindly
   * nulled whatever the CURRENT value was — so the opening hand's rapid
   * back-to-back draws stomped on each other's glow. A Set survives that:
   * each card's own entry is added and removed independently, the same way
   * dyingIds already works above.
   */
  let drawnCards = new Set<Card>();
  let hitHero: 'player' | 'ai' | null = null;
  let banner: string | null = null;
  let floats: { id: number; text: string; color: string; x: number; y: number }[] = [];
  let floatSeq = 0;
  let draining = false;
  let handWidth = 1440;
  let handHeight = 900;

  onMount(() => {
    restart();
    onResize();
    window.addEventListener('resize', onResize);

    // The saved deck arrives asynchronously when signed in. The match has
    // already started on the starter deck by then, so it is applied to the
    // *next* one rather than swapped in mid-hand.
    void loadPlayer().then((player) => {
      if (player.deck && isLegal(player.deck, player.owned)) {
        deckCards = resolveDeck(player.deck);
        deckName = player.deck.name;
        // Nothing has happened yet on turn 1, so restarting is invisible and
        // means the player's real deck is what they actually play.
        if (state.turnNumber <= 1 && me.board.length === 0) restart();
      }
    });
  });

  onDestroy(() => {
    if (typeof window !== 'undefined') window.removeEventListener('resize', onResize);
  });

  function onResize() {
    handWidth = window.innerWidth;
    handHeight = window.innerHeight;
  }

  /**
   * How much the table has to shrink to fit.
   *
   * The layout is designed at 824px of board height (the row heights sum to
   * that) below a 55px nav. An iPad in landscape offers 713, so it needs about
   * 0.87. Floored at 0.7 — below that the type stops being readable and it is
   * better to lose a little of the board than all of the text.
   */
  const DESIGN_HEIGHT = 824;
  $: fit = Math.max(0.7, Math.min(1, (handHeight - 55) / DESIGN_HEIGHT));

  /** The side rail only earns its place where there is margin going spare. */
  const RAIL_MIN_WIDTH = 1500;
  $: railed = handWidth >= RAIL_MIN_WIDTH;

  $: me = state.players.player;
  $: foe = state.players.ai;
  /*
   * A card lands in hand the moment the engine draws it — and the start-of-turn
   * draw runs inside `playAiTurn`'s `endTurn`, before a single one of the AI's
   * cues has been drained. Rendering the raw hand therefore showed the new card
   * sitting there through the rest of the opponent's turn, only for it to blink
   * out and fly in when its own draw cue finally played. Cards whose cue is
   * still queued are held back, so a draw is first seen on its own animation.
   */
  $: pendingDraws = (state.events ?? []).filter(
    (e) => e.type === 'draw' && e.owner === 'player'
  ).length;
  $: visibleHand = me.hand.slice(0, me.hand.length - pendingDraws);
  $: myTurn = state.current === 'player' && !state.winner && !aiThinking && !draining;
  // The attacker is whichever minion you tapped or are currently dragging from,
  // so targets light up the same way for both gestures.
  $: activeAttacker = drag?.kind === 'attack' ? drag.instanceId : selectedId;
  $: targets = myTurn && activeAttacker ? legalTargets(state, 'ai') : [];
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
  $: handScale = Math.min(
    1,
    Math.min(handWidth / fit - 90, 1260) / (Math.max(1, visibleHand.length) * 146)
  );

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
      // Note where everything stands before applying the next cue, so a numeral
      // for something that dies mid-exchange still has a place to appear.
      rememberPositions();
      const event = state.events.shift() as GameEvent;
      // Publish the shortened queue before the cue plays, so a held-back card
      // renders in the same frame that its fly-in class is applied.
      state = state;
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
        await lunge(event);
        break;
      case 'damage':
        // Over whatever took the hit, not whatever dealt it.
        pushFloat(`-${event.amount}`, '#ff8a6a', pointFor(event.target));
        if (event.amount >= HEAVY_HIT) judder(event.target);
        if (event.target.kind === 'hero') {
          hitHero = event.target.owner;
          setTimeout(() => (hitHero = null), 520);
        }
        break;
      case 'shield':
        pushFloat('Shield', '#f6dd93', pointFor({ kind: 'minion', instanceId: event.instanceId }));
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
          const hand = state.players.player.hand;
          // The oldest queued draw, not the newest card in hand: with several
          // cues waiting — the opening deal — the later ones are still held
          // back, and marking the last card would glow one nobody can see yet.
          const stillQueued = state.events.filter(
            (e) => e.type === 'draw' && e.owner === 'player'
          ).length;
          const card = hand[hand.length - 1 - stillQueued];
          drawnCards = new Set(drawnCards).add(card);
          setTimeout(() => {
            const next = new Set(drawnCards);
            next.delete(card);
            drawnCards = next;
          }, EVENT_BEAT.draw);
        }
        break;
      case 'turn':
        banner = event.owner === 'player' ? 'Your Turn' : "Opponent's Turn";
        setTimeout(() => (banner = null), EVENT_BEAT.turn);
        break;
    }
  }

  /*
   * The attack lunge. A keyframe can't express this: the arc depends on where
   * the target actually is, so it is measured at play time and handed to the
   * Web Animations API. Lift and wind up away from the target, accelerate along
   * an upward bow, stop at its face, hold for a beat, then drop home.
   *
   * Resolves at impact rather than at landing, so the damage cue queued behind
   * it lands with the smack instead of after the recoil.
   */
  const LUNGE_MS = 560;
  const IMPACT_AT = 0.62;

  async function lunge(event: Extract<GameEvent, { type: 'attack' }>) {
    const el = minionElFor(event.instanceId);
    if (!el || typeof el.animate !== 'function') return;
    // The stylesheet's reduced-motion block only reaches CSS animations, and
    // this one is scripted — so it has to opt out on its own.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const from = centreOf(el);
    const to = pointFor(event.target);
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dist = Math.hypot(dx, dy) || 1;
    // Stop at the target's face rather than landing on top of it.
    const reach = Math.max(0, dist - 52) / dist;
    const hitX = dx * reach;
    const hitY = dy * reach;
    // Wind up away from the target; bow the flight upward whichever way it travels.
    const backX = (-dx / dist) * 12;
    const backY = (-dy / dist) * 12;
    const arc = Math.min(70, dist * 0.4);
    const tilt = Math.max(-16, Math.min(16, (dx / dist) * 16));
    const impact = `translate(${hitX}px, ${hitY}px) scale(1.04) rotate(${tilt * 0.5}deg)`;

    // Over everything else on the board for the duration of the flight.
    el.style.zIndex = '300';
    const anim = el.animate(
      [
        { offset: 0, transform: 'none', easing: 'ease-out' },
        {
          offset: 0.34,
          transform: `translate(${backX}px, ${backY - 34}px) scale(1.1) rotate(${tilt * 0.3}deg)`,
          easing: 'ease-in'
        },
        {
          offset: 0.5,
          transform: `translate(${hitX * 0.5}px, ${hitY * 0.5 - arc}px) scale(1.12) rotate(${tilt}deg)`,
          easing: 'ease-in'
        },
        { offset: IMPACT_AT, transform: impact, easing: 'ease-out' },
        // Hit stop: a beat of nothing at the point of contact.
        { offset: 0.7, transform: impact },
        { offset: 1, transform: 'none' }
      ],
      { duration: LUNGE_MS }
    );
    anim.finished.then(() => (el.style.zIndex = '')).catch(() => (el.style.zIndex = ''));
    await sleep(LUNGE_MS * IMPACT_AT);
  }

  /** A 7+ hit lands hard: the struck card judders, or the table does for a hero. */
  const HEAVY_HIT = 7;
  const JUDDER_MS = 360;

  function judder(
    target: { kind: 'minion'; instanceId: string } | { kind: 'hero'; owner: 'player' | 'ai' }
  ) {
    if (target.kind === 'hero') {
      quaking = true;
      setTimeout(() => (quaking = false), JUDDER_MS);
      return;
    }
    const id = target.instanceId;
    struckIds = new Set(struckIds).add(id);
    setTimeout(() => {
      const next = new Set(struckIds);
      next.delete(id);
      struckIds = next;
    }, JUDDER_MS);
  }

  function pushFloat(text: string, color: string, at: { x: number; y: number }) {
    const id = ++floatSeq;
    floats = [...floats, { id, text, color, x: at.x, y: at.y }];
    setTimeout(() => (floats = floats.filter((f) => f.id !== id)), 900);
  }

  // ── Player actions ───────────────────────────────────────────
  //
  // **Dragging a card onto your row is the only way to play it.** There is no
  // click-to-play and no keyboard equivalent: playing costs mana and cannot be
  // undone, so it takes a deliberate gesture. Every other interaction with a
  // card — tap, Enter, Space — opens it for reading instead.
  //
  // This removed a pick-up-and-carry mode, where a tap lifted a card onto the
  // pointer until a second click placed it. Once tapping opened the inspector
  // the only thing still reaching it was the Enter key, and playing a card by
  // pressing Enter is exactly the accident the drag-only rule exists to prevent.

  // ── Inspecting ───────────────────────────────────────────────
  // Clicking any card or minion opens it centred and enlarged, with its
  // definition beside it. This replaced a hover overlay that floated a
  // full-size card next to a minion: two ways to enlarge a card is one too
  // many, and the hover version was unreachable by touch.

  let inspected: Card | null = null;

  function openInspector(card: Card) {
    if (drag) return;
    inspected = card;
  }

  function closeInspector() {
    inspected = null;
  }

  /** The minion as it stands now, so buffs and damage show, not the printed card. */
  function inspectCard(minion: MinionInstance): Card {
    return {
      ...minion.card,
      attack: minion.attack,
      health: minion.health,
      keywords: [...minion.keywords] as Card['keywords']
    };
  }

  /** Enter or Space opens the card, the same as tapping it. It never plays it. */
  function onCardKey(event: KeyboardEvent, index: number) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    const card = me.hand[index];
    if (card) openInspector(card);
  }

  function onMyMinion(instanceId: string) {
    if (swallowClick) return;
    const minion = me.board.find((m) => m.instanceId === instanceId);
    if (!minion) return;
    // A minion that can swing is an attacker first — selecting it is the
    // gesture that matters mid-turn. One that cannot is only ever there to be
    // read, so it opens instead of doing nothing.
    if (myTurn && canAttack(minion)) {
      selectedId = selectedId === instanceId ? null : instanceId;
      return;
    }
    openInspector(inspectCard(minion));
  }

  /**
   * An enemy minion is a target while an attacker is picked, and a card to read
   * otherwise — so tapping the enemy board mid-turn never wastes an attack, and
   * outside an attack it is still the way to see what a minion does.
   */
  function onEnemyMinionClick(minion: MinionInstance) {
    if (swallowClick) return;
    if (myTurn && activeAttacker) {
      onEnemyTarget({ kind: 'minion', instanceId: minion.instanceId });
      return;
    }
    openInspector(inspectCard(minion));
  }

  function onEnemyTarget(target: { kind: 'minion'; instanceId: string } | { kind: 'hero' }) {
    if (swallowClick) return;
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
    state = createMatch(deckCards, aiCards, Date.now() % 100000);
    selectedId = null;
    aiThinking = false;
    dyingIds = new Set();
    struckIds = new Set();
    quaking = false;
    drawnCards = new Set();
    floats = [];
    // createMatch queues the opening deal — three cards, then the first turn's
    // own draw. Nothing drained it, so those cues sat until the player's first
    // action replayed them all at once; now the deal plays out on entry and its
    // own 'turn' cue raises the banner when the hand is actually dealt.
    drain();
  }

  // ── Dragging ─────────────────────────────────────────────────
  // One gesture covers both input styles: a press that never travels 8px is a
  // tap and falls through to the click handlers, while one that does becomes a
  // drag. Pointer events mean mouse, pen and touch all take the same path.

  const DRAG_THRESHOLD = 8;

  type TargetRef = { kind: 'minion'; instanceId: string } | { kind: 'hero' };

  type Drag =
    | { kind: 'card'; handIndex: number; card: Card; slot: number }
    | {
        kind: 'attack';
        instanceId: string;
        from: { x: number; y: number };
        target: TargetRef | null;
      };

  type Press =
    | { id: number; x: number; y: number; kind: 'card'; handIndex: number }
    | { id: number; x: number; y: number; kind: 'attack'; instanceId: string };

  let drag: Drag | null = null;
  let press: Press | null = null;
  let pointer = { x: 0, y: 0 };
  /** A completed drag must not also fire the element's click. */
  let swallowClick = false;

  let myBoardEl: HTMLElement | undefined;
  let foeBoardEl: HTMLElement | undefined;
  let foeHeroEl: HTMLElement | undefined;
  let myHeroEl: HTMLElement | undefined;

  /**
   * Where each minion last stood. State is already final when cues replay, so a
   * minion that died in the exchange is gone from the board by the time its
   * damage number is due — this keeps its last position to fire the numeral at.
   */
  const lastSeen = new Map<string, { x: number; y: number }>();

  function rememberPositions() {
    for (const [board, list] of [
      [myBoardEl, me.board],
      [foeBoardEl, foe.board]
    ] as const) {
      const els = minionEls(board);
      list.forEach((minion, i) => {
        if (els[i]) lastSeen.set(minion.instanceId, centreOf(els[i]));
      });
    }
  }

  /** Viewport point of whatever a cue refers to, for placing a floating numeral. */
  function pointFor(
    ref: { kind: 'minion'; instanceId: string } | { kind: 'hero'; owner: 'player' | 'ai' }
  ): { x: number; y: number } {
    if (ref.kind === 'hero') {
      const el = ref.owner === 'player' ? myHeroEl : foeHeroEl;
      if (el) return centreOf(el);
    } else {
      const el = minionElFor(ref.instanceId);
      if (el) return centreOf(el);
      const remembered = lastSeen.get(ref.instanceId);
      if (remembered) return remembered;
    }
    return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  }

  function minionElFor(instanceId: string): HTMLElement | null {
    for (const [board, list] of [
      [myBoardEl, me.board],
      [foeBoardEl, foe.board]
    ] as const) {
      const index = list.findIndex((m) => m.instanceId === instanceId);
      const el = minionEls(board)[index];
      if (index >= 0 && el) return el;
    }
    return null;
  }

  function minionEls(board: HTMLElement | undefined): HTMLElement[] {
    return board ? (Array.from(board.querySelectorAll('.minion')) as HTMLElement[]) : [];
  }

  function centreOf(el: Element): { x: number; y: number } {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  function onCardPointerDown(event: PointerEvent, index: number) {
    // Note there is no playability check here. A card you cannot afford must
    // still open when tapped — reading a card is never gated on casting it.
    // onPointerUp only starts a drag for a card that is actually playable.
    press = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      kind: 'card',
      handIndex: index
    };
    pointer = { x: event.clientX, y: event.clientY };
  }

  function onMinionPointerDown(event: PointerEvent, instanceId: string) {
    if (!myTurn) return;
    const minion = me.board.find((m) => m.instanceId === instanceId);
    if (!minion || !canAttack(minion)) return;
    press = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      kind: 'attack',
      instanceId
    };
    pointer = { x: event.clientX, y: event.clientY };
  }

  /** Where in your row a dragged card would land, from the pointer's x. */
  function slotAt(x: number): number {
    const els = minionEls(myBoardEl);
    for (let i = 0; i < els.length; i++) {
      const r = els[i].getBoundingClientRect();
      if (x < r.left + r.width / 2) return i;
    }
    return els.length;
  }

  /** Your half of the table, with slack so you needn't hit the row exactly. */
  function overMyBoard(y: number): boolean {
    if (!myBoardEl) return false;
    const r = myBoardEl.getBoundingClientRect();
    return y >= r.top - 60 && y <= r.bottom + 60;
  }

  function targetAt(x: number, y: number): TargetRef | null {
    const el = document.elementFromPoint(x, y);
    if (!el) return null;

    // Read the rules directly rather than the reactive targetableIds: on the
    // frame a drag begins those haven't been recomputed yet, which left the
    // arrow refusing to snap until the next pointer move.
    const allowed = legalTargets(state, 'ai');

    const minionEl = el.closest('.minion');
    if (minionEl && foeBoardEl?.contains(minionEl)) {
      const index = minionEls(foeBoardEl).indexOf(minionEl as HTMLElement);
      const minion = foe.board[index];
      const legal =
        minion &&
        allowed.some((t) => t.kind === 'minion' && t.minion.instanceId === minion.instanceId);
      return legal ? { kind: 'minion', instanceId: minion.instanceId } : null;
    }

    if (foeHeroEl?.contains(el) && allowed.some((t) => t.kind === 'hero')) {
      return { kind: 'hero' };
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
        const card = me.hand[press.handIndex];
        // Unplayable cards read but do not lift.
        if (!card || !myTurn || !canPlayCard(state, 'player', press.handIndex)) return;
        drag = { kind: 'card', handIndex: press.handIndex, card, slot: me.board.length };
      } else {
        const { instanceId } = press;
        const index = me.board.findIndex((m) => m.instanceId === instanceId);
        const el = minionEls(myBoardEl)[index];
        drag = {
          kind: 'attack',
          instanceId,
          from: el ? centreOf(el) : { x: event.clientX, y: event.clientY },
          target: null
        };
      }
    }

    drag =
      drag.kind === 'card'
        ? { ...drag, slot: slotAt(event.clientX) }
        : { ...drag, target: targetAt(event.clientX, event.clientY) };

    // Stops touch scrolling the page out from under the drag.
    if (event.cancelable) event.preventDefault();
  }

  function onPointerUp(event: PointerEvent) {
    if (!press || event.pointerId !== press.id) return;

    const finished = drag;
    const tapped = press;
    press = null;
    drag = null;

    // No travel: a tap. A tapped card is opened for reading — dragging is the
    // only way to play one, so a tap can never be a misfire that spends mana.
    // The keyboard path (Enter) still picks up and places, so the game stays
    // playable without a pointer. Minions fall through to their click handler
    // and become the selected attacker.
    if (!finished) {
      if (tapped.kind === 'card') openInspector(me.hand[tapped.handIndex]);
      return;
    }

    swallowClick = true;
    setTimeout(() => (swallowClick = false), 0);

    if (finished.kind === 'card') {
      if (!overMyBoard(event.clientY)) return;
      if (!canPlayCard(state, 'player', finished.handIndex)) return;
      playCard(state, 'player', finished.handIndex, finished.slot);
    } else {
      if (!finished.target) return;
      attack(state, 'player', finished.instanceId, finished.target);
    }

    selectedId = null;
    state = state;
    drain();
  }

  function onPointerCancel() {
    press = null;
    drag = null;
  }

  function targetCentre(target: TargetRef): { x: number; y: number } {
    if (target.kind === 'hero') return foeHeroEl ? centreOf(foeHeroEl) : pointer;
    const index = foe.board.findIndex((m) => m.instanceId === target.instanceId);
    const el = minionEls(foeBoardEl)[index];
    return el ? centreOf(el) : pointer;
  }

  function buildAim(from: { x: number; y: number }, target: TargetRef | null) {
    const end = target ? targetCentre(target) : pointer;
    // Bows the line upward so it never runs flat across the board.
    const cx = (from.x + end.x) / 2;
    const cy = Math.min(from.y, end.y) - 70;
    return { path: `M ${from.x} ${from.y} Q ${cx} ${cy} ${end.x} ${end.y}`, end };
  }

  $: aim = drag?.kind === 'attack' ? buildAim(drag.from, drag.target) : null;

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

<svelte:window
  on:pointermove={onPointerMove}
  on:pointerup={onPointerUp}
  on:pointercancel={onPointerCancel}
/>

<main class="table" class:quaking style:--fit={fit.toFixed(3)}>
  <div class="vignette" aria-hidden="true"></div>

  <!-- Opponent -->
  <section class="hero-row foe">
    <div class="foe-hand" aria-hidden="true">
      {#each foe.hand as _, i}
        <span
          class="foe-card"
          style:transform={`rotate(${(i - (foe.hand.length - 1) / 2) * 3.2}deg)`}
          style:margin-left={i ? '-58px' : '0'}
        >
          <CardBack backId="default" hue={266} mark="F" />
        </span>
      {/each}
    </div>

    <div></div>

    <div class="hero-block" bind:this={foeHeroEl}>
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

  <section class="board" bind:this={foeBoardEl}>
    {#each foe.board as minion (minion.instanceId)}
      <MinionView
        {minion}
        targetable={targetableIds.has(minion.instanceId)}
        summoning={summoningId === minion.instanceId}
        struck={struckIds.has(minion.instanceId)}
        dying={dyingIds.has(minion.instanceId)}
        on:click={() => onEnemyMinionClick(minion)}
      />
    {/each}
  </section>

  <div class="centre">
    <span class="rule"></span>
    <span class="phase">{phase}</span>
    <span class="rule"></span>
  </div>

  <section class="board mine" class:drop-open={drag?.kind === 'card'} bind:this={myBoardEl}>
    {#each me.board as minion, i (minion.instanceId)}
      {#if drag?.kind === 'card' && drag.slot === i}
        <span class="drop-gap" aria-hidden="true"></span>
      {/if}
      <MinionView
        {minion}
        ready={myTurn && canAttack(minion)}
        selected={selectedId === minion.instanceId ||
          (drag?.kind === 'attack' && drag.instanceId === minion.instanceId)}
        summoning={summoningId === minion.instanceId}
        struck={struckIds.has(minion.instanceId)}
        dying={dyingIds.has(minion.instanceId)}
        on:click={() => onMyMinion(minion.instanceId)}
        on:pointerdown={(e) => onMinionPointerDown(e, minion.instanceId)}
      />
    {/each}
    {#if drag?.kind === 'card' && drag.slot >= me.board.length}
      <span class="drop-gap" aria-hidden="true"></span>
    {/if}
  </section>

  <!-- You -->
  <section class="hero-row you">
    <ManaTray mana={me.mana} maxMana={me.maxMana} />

    <div class="hero-block reverse" bind:this={myHeroEl}>
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
    {#each visibleHand as card, i (card)}
      <div class="hand-slot" class:lifted={drag?.kind === 'card' && drag.handIndex === i}>
        <CardPreview
          {card}
          playable={myTurn && canPlayCard(state, 'player', i)}
          drawn={drawnCards.has(card)}
          on:keydown={(e) => onCardKey(e, i)}
          on:pointerdown={(e) => onCardPointerDown(e, i)}
        />
      </div>
    {/each}
  </section>

  <!-- Drag layers: the card riding the pointer, and the targeting arrow. -->
  {#if drag?.kind === 'card'}
    <div
      class="ghost"
      style:left={`${pointer.x}px`}
      style:top={`${pointer.y}px`}
      aria-hidden="true"
    >
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
    on:close={closeInspector}
  />

  <TurnBanner text={banner} />
  <Chronicle lines={state.log} rail={railed} />

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
