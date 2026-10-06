<script lang="ts">
  import { createEventDispatcher, onDestroy } from 'svelte';
  import { flip } from 'svelte/animate';
  import { gsap } from 'gsap';
  import CardPreview from './CardPreview.svelte';
  import MinionView from './MinionView.svelte';
  import HeroPortrait from './HeroPortrait.svelte';
  import ManaTray from './ManaTray.svelte';
  import CardBack from './CardBack.svelte';
  import TurnBanner from './TurnBanner.svelte';
  import FloatingNumber from './FloatingNumber.svelte';
  import Chronicle from './Chronicle.svelte';
  import CardInspector from './CardInspector.svelte';
  import HeroPowerButton from './HeroPowerButton.svelte';
  import { heroPowerFor } from '../data/classes';
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
  import { sceneUrl } from '../../utils/art';
  import GameMenu from './GameMenu.svelte';
  import { goto } from '$app/navigation';
  import { applyCue } from '../presentation/apply';

  /**
   * The painted backdrop, when one has been dropped into `static/art/scene/`.
   * Resolved once: the index is built at build time, so it cannot change while
   * a match is running.
   */
  const tableArt = sceneUrl('table');
  const portraitArt = sceneUrl('table-portrait');

  /** The in-game menu. A match hides the nav, so this is the only way out. */
  let menuOpen = false;

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
  /** The opponent's username online, or the AI's class in practice. Never a seat id. */
  export let opponentName = 'Opponent';
  /** Game-over overlay. Owned by the table so its styles are not orphaned. */
  export let overTitle: string | null = null;
  export let overNote: string | null = null;
  export let overAction: string | null = null;

  const dispatch = createEventDispatcher<{
    playCard: { handIndex: number; slot?: number; target?: ChosenRef };
    attack: { instanceId: string; target: TargetRef };
    heroAttack: { target: TargetRef };
    heroPower: { target?: ChosenRef };
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

  /**
   * The board **on screen**, which is not always the board in `view`.
   *
   * `view` is where the match is; `shown` is where playback has got to. The
   * table used to draw `view` the moment it arrived and replay cues over it, so
   * a minion that died was gone before its death cue played and a health gem
   * dropped before the hit landed. Now each cue moves `shown` one step towards
   * `view` as it plays (`applyCue`), and the two are made equal when playback
   * ends — so any cue that does not yet say everything it changed is corrected
   * there, never left wrong.
   *
   * The **hand** is still read from `view`: it changes only through your own
   * plays and draws, and `pendingDraws` already holds new cards back.
   * Legality and input read `view` too — they are only live when nothing is
   * playing, which is exactly when the two agree.
   */
  let shown: PlayerView = view;

  /** A card the opponent just played, held up large so it can be read. */
  let showcase: { card: Card; key: number; from: { x: number; y: number } } | null = null;
  let showcaseKey = 0;

  const reduceMotion =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let handWidth = 1440;
  let handHeight = 900;
  let inspected: Card | null = null;

  let myBoardEl: HTMLElement | undefined;
  let foeBoardEl: HTMLElement | undefined;
  let foeHeroEl: HTMLElement | undefined;
  let myHeroEl: HTMLElement | undefined;
  let foeHandEl: HTMLElement | undefined;

  if (typeof window !== 'undefined') {
    handWidth = window.innerWidth;
    handHeight = window.innerHeight;
  }

  function onResize() {
    handWidth = window.innerWidth;
    handHeight = window.innerHeight;
  }

  /*
   * The table is the whole viewport during a match — the nav is hidden — so the
   * scale is measured against the full height. It used to subtract 55px for a
   * nav that is no longer there, which left the board scaled for a window
   * smaller than the one it has.
   */
  const DESIGN_HEIGHT = 824;
  /*
   * Big screens scale **up** as well as small ones down. Clamped at 1 the board
   * was a small island on anything past 1440x900. Growing needs room on both
   * axes, so width only ever limits the growth — below 1 the height alone
   * decides, exactly as before, and iPad sizes are untouched.
   */
  const DESIGN_WIDTH = 1300;
  $: growth = Math.min(handHeight / DESIGN_HEIGHT, handWidth / DESIGN_WIDTH);
  $: fit =
    growth > 1
      ? Math.min(1.35, growth)
      : Math.max(0.7, Math.min(1, handHeight / DESIGN_HEIGHT));
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

  // With the rail out, the hand keeps clear of it on both sides — scaled up on
  // a wide screen, ten cards would otherwise run under the log.
  $: handScale = Math.min(
    1,
    Math.min((handWidth - (railed ? 580 : 0)) / fit - 90, 1260) /
      (Math.max(1, visibleHand.length) * 146)
  );

  /**
   * The turn clock.
   *
   * The room already sends `turnEndsIn` with every state push, but state only
   * arrives when something happens — so the number has to be ticked here or it
   * would sit unchanged for a whole turn. A local match sends 0 and shows no
   * clock at all: there is nothing to run out.
   */
  let secondsLeft = 0;
  $: secondsLeft = view.turnEndsIn;
  $: showClock = view.turnEndsIn > 0 && !view.winner;

  // Guarded like the resize listener below: this component is server-rendered,
  // and a timer started there would tick with nothing to tick for.
  const clockTimer =
    typeof window === 'undefined'
      ? undefined
      : setInterval(() => {
          if (secondsLeft > 0) secondsLeft -= 1;
        }, 1000);

  // ── Event playback ────────────────────────────────────────
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  // Drains whenever new cues arrive. Must stay above the line below: draining
  // is set synchronously inside drain(), which is what keeps that line from
  // snapping the board to the end state before playback has begun.
  $: if (events.length > 0 && !draining) void drain();
  // With nothing to play, the board on screen is simply the view.
  $: if (events.length === 0 && !draining) {
    shown = view;
    logShown = view.log.length;
  }

  /**
   * How much of the log the Chronicle shows. It follows playback rather than
   * the view, or it reads out the opponent's whole turn before any of it has
   * happened on the board — locally the view even shares the engine's own
   * log array, so it is never behind.
   */
  let logShown = 0;
  $: chronicleLines = view.log.slice(0, logShown);

  /** The line each cue writes, so the cue can uncover it as it plays. */
  const LOG_LINE: Partial<Record<GameEvent['type'], RegExp>> = {
    turn: /^— /,
    play: / plays /,
    heroPower: / uses /,
    attack: / (attacks|hits) /,
    shield: /Divine Shield/,
    death: / dies\.$/,
    weaponBreak: / breaks\.$/
  };

  function uncoverLog(event: GameEvent) {
    const pattern = LOG_LINE[event.type];
    if (!pattern) return;
    for (let i = logShown; i < view.log.length; i++) {
      if (pattern.test(view.log[i])) {
        logShown = i + 1;
        return;
      }
    }
  }

  /** Hits that land together: the two sides of a trade, every target of a sweep. */
  const IMPACT = new Set<GameEvent['type']>(['damage', 'shield']);

  async function drain() {
    if (draining) return;
    draining = true;
    shown = startingPoint(shown, view, events);
    while (events.length > 0) {
      rememberPositions();
      const event = events.shift() as GameEvent;
      events = events;
      uncoverLog(event);
      await play(event);
      const together = IMPACT.has(event.type) && events[0] !== undefined && IMPACT.has(events[0].type);
      await sleep(together ? 60 : EVENT_BEAT[event.type]);
    }
    shown = view;
    logShown = view.log.length;
    draining = false;
    dispatch('drained');
  }

  /**
   * Where playback starts from. Usually the board as last shown — but a new
   * match (the first view, or "Play again") starts from its own opening, with
   * the cards the opening draws are about to deal still in the decks.
   */
  function startingPoint(from: PlayerView, to: PlayerView, queue: GameEvent[]): PlayerView {
    const freshMatch = from.turnNumber === 0 || to.turnNumber < from.turnNumber;
    if (!freshMatch) return { ...from, you: to.you, turnEndsIn: to.turnEndsIn };
    logShown = 0;
    const draws = (owner: string) => queue.filter((e) => e.type === 'draw' && e.owner === owner).length;
    const foeId = to.you === 'player' ? 'ai' : 'player';
    return {
      ...to,
      turnNumber: 0,
      winner: null,
      me: { ...to.me, mana: 0, maxMana: 0, deckCount: to.me.deckCount + draws(to.you) },
      foe: { ...to.foe, mana: 0, maxMana: 0, handCount: 0, deckCount: to.foe.deckCount + draws(foeId) }
    };
  }

  /** Which side of the table an event's owner is on, from this seat. */
  function sideOf(owner: string): 'me' | 'foe' {
    return owner === view.you ? 'me' : 'foe';
  }

  /**
   * Plays one cue, and moves the board on screen past it.
   *
   * The board steps forward at the moment the thing *lands* — after a lunge
   * reaches its target, after a shatter finishes — which is why each case
   * decides where in its own animation `advance` happens.
   */
  async function play(event: GameEvent) {
    const advance = () => (shown = applyCue(shown, event, view));

    switch (event.type) {
      case 'play': {
        // Your own card is already where you dropped it; only the opponent's
        // needs to be shown being played.
        if (sideOf(event.owner) === 'me') return advance();
        const backs = foeHandEl?.querySelectorAll<HTMLElement>('.foe-card');
        const back = backs?.[Math.min(event.handIndex, backs.length - 1)];
        const from = back ? centreOf(back) : { x: window.innerWidth / 2, y: 0 };
        advance();
        showcase = { card: event.card, key: ++showcaseKey, from };
        await sleep(reduceMotion ? 1000 : 1350);
        showcase = null;
        return;
      }
      case 'summon': {
        advance();
        summoningId = event.instanceId;
        // Matches the .62s summon animation. It used to clear at 260ms, which
        // cut the arrival off less than half way through it.
        setTimeout(() => (summoningId = null), 620);
        // A big minion lands with weight: the table jolts as it touches down.
        const landed = [...shown.me.board, ...shown.foe.board].find((m) => m.instanceId === event.instanceId);
        if (landed && landed.card.cost >= 6 && !reduceMotion) {
          setTimeout(() => {
            quaking = true;
            setTimeout(() => (quaking = false), 500);
          }, 300);
        }
        return;
      }
      case 'attack':
        await lunge(unitOf(event.instanceId), targetElement(event.target));
        return;
      case 'heroAttack': {
        // The cue carries no target; the hit that follows does.
        const next = events.find(
          (e): e is Extract<GameEvent, { type: 'damage' | 'shield' }> => e.type === 'damage' || e.type === 'shield'
        );
        const at = next?.type === 'damage' ? targetElement(next.target) : next ? unitOf(next.instanceId) : undefined;
        const hero = (sideOf(event.owner) === 'me' ? myHeroEl : foeHeroEl)?.querySelector<HTMLElement>('.hero');
        await lunge(hero ?? undefined, at);
        return;
      }
      case 'death': {
        dyingIds = new Set(dyingIds).add(event.instanceId);
        // The shatter plays on the minion still on screen; only then is it
        // removed. Deaths in a row shatter together rather than one by one.
        const gone = sleep(600).then(() => {
          shown = applyCue(shown, event, view);
          const next = new Set(dyingIds);
          next.delete(event.instanceId);
          dyingIds = next;
        });
        if (events[0]?.type !== 'death') await gone;
        return;
      }
    }

    advance();

    switch (event.type) {
      case 'draw': {
        if (sideOf(event.owner) !== 'me') break;
        const card = view.me.hand[view.me.hand.length - pendingDraws];
        if (card) {
          drawnCards = new Set(drawnCards).add(card);
          setTimeout(() => {
            const next = new Set(drawnCards);
            next.delete(card);
            drawnCards = next;
          }, 500);
        }
        break;
      }
      case 'damage': {
        if (event.target.kind === 'hero') {
          hitHero = sideOf(event.target.owner);
          quaking = event.amount >= 4;
          setTimeout(() => {
            hitHero = null;
            quaking = false;
          }, 500);
          floatAt(heroPos(sideOf(event.target.owner)), `-${event.amount}`, 'var(--blood)');
        } else {
          const id = event.target.instanceId;
          struckIds = new Set(struckIds).add(id);
          setTimeout(() => {
            const next = new Set(struckIds);
            next.delete(id);
            struckIds = next;
          }, 500);
          floatAt(positions.get(id), `-${event.amount}`, 'var(--blood)');
        }
        break;
      }
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

  /** The DOM draws `shown`, so elements pair with its boards, not the view's. */
  function minionElements(): [HTMLElement, string][] {
    const pairs: [HTMLElement, string][] = [];
    const record = (root: HTMLElement | undefined, board: SerialisedMinion[]) => {
      if (!root) return;
      const els = [...root.querySelectorAll<HTMLElement>('.minion')];
      board.forEach((m, i) => {
        if (els[i]) pairs.push([els[i], m.instanceId]);
      });
    };
    record(myBoardEl, shown.me.board);
    record(foeBoardEl, shown.foe.board);
    return pairs;
  }

  /** A minion's whole slot — the part that moves, Taunt frame and all. */
  function unitOf(instanceId: string): HTMLElement | undefined {
    const el = minionElements().find(([, id]) => id === instanceId)?.[0];
    return el?.closest<HTMLElement>('.slot') ?? el;
  }

  function targetElement(
    target: { kind: 'minion'; instanceId: string } | { kind: 'hero'; owner: string }
  ): HTMLElement | undefined {
    if (target.kind === 'minion') return unitOf(target.instanceId);
    const block = sideOf(target.owner) === 'me' ? myHeroEl : foeHeroEl;
    return block?.querySelector<HTMLElement>('.hero') ?? block;
  }

  /**
   * An attack you can see: the attacker rises, dashes most of the way to its
   * target, holds for a beat at contact, and springs home.
   *
   * Resolves **at contact**, so the hit that follows lands as it arrives while
   * the recoil plays on. Measured in the zoomed table's own pixels — a
   * transform inside a `zoom`ed row is scaled by it, and the rects are not.
   */
  async function lunge(mover: HTMLElement | undefined, at: HTMLElement | undefined) {
    if (!mover || !at || reduceMotion) return;
    const from = centreOf(mover);
    const to = centreOf(at);
    const reach = 0.78;
    gsap
      .timeline()
      .set(mover, { zIndex: 60 })
      .to(mover, { scale: 1.12, y: -8, duration: 0.13, ease: 'power2.out' })
      .to(mover, {
        x: ((to.x - from.x) * reach) / fit,
        y: ((to.y - from.y) * reach) / fit,
        duration: 0.17,
        ease: 'power3.in'
      })
      .to(mover, { x: 0, y: 0, scale: 1, duration: 0.32, ease: 'back.out(1.8)' }, '+=0.07')
      .set(mover, { clearProps: 'transform,zIndex' });
    await sleep(300);
  }

  /** The opponent's card flies up out of their hand and turns face up. */
  function reveal(node: HTMLElement, from: { x: number; y: number }) {
    if (reduceMotion) {
      gsap.from(node, { opacity: 0, duration: 0.2 });
      return;
    }
    const spot = centreOf(node);
    gsap.from(node, {
      x: from.x - spot.x,
      y: from.y - spot.y,
      scale: 0.3,
      rotation: 9,
      rotationY: -110,
      transformPerspective: 900,
      opacity: 0.4,
      duration: 0.5,
      ease: 'power3.out'
    });
  }

  /** And leaves: a minion shrinks towards the board, a spell flares out. */
  function vanish(_node: Element, { spell }: { spell: boolean }) {
    return {
      duration: reduceMotion ? 120 : 280,
      css: (t: number) =>
        spell
          ? `opacity: ${t}; transform: scale(${1 + (1 - t) * 0.3}); filter: brightness(${1 + (1 - t) * 1.6})`
          : `opacity: ${t}; transform: scale(${0.55 + 0.45 * t}) translateY(${(1 - t) * 60}px)`
    };
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

  $: chosenTargets = aiming
    ? chosenTargetsFromView(view, aiming.card)
    : aimingPower
      ? chosenTargetsFromView(view, { targeting: 'any' } as Card)
      : [];
  $: chosenMinionIds = new Set(
    chosenTargets.flatMap((t) => (t.kind === 'minion' ? [t.instanceId] : []))
  );
  $: canAimFoeHero = chosenTargets.some((t) => t.kind === 'hero' && t.side === 'foe');
  $: canAimMyHero = chosenTargets.some((t) => t.kind === 'hero' && t.side === 'me');

  function cancelAim() {
    aiming = null;
    aimingPower = false;
  }

  /** Escape backs out of aiming or an armed hero without spending anything. */
  /**
   * Escape, in the order a player expects it to work: back out of the innermost
   * thing first, and only open the menu when there is nothing left to back out
   * of. The inspector closes itself, so this stands aside for it rather than
   * closing the card and opening the menu in the same keystroke.
   *
   * Bound with `|capture` for exactly that reason. Both this and the inspector
   * listen on `window`, and in the bubble phase the inspector's listener ran
   * first — it had already set `inspected` to null by the time this checked it,
   * so one keypress closed the card *and* opened the menu. Capture runs this
   * before any of them, while the state it is reading is still true.
   */
  function onWindowKey(event: KeyboardEvent) {
    if (event.key !== 'Escape') return;
    if (inspected) return;

    if (menuOpen) {
      menuOpen = false;
      return;
    }
    if (aiming || aimingPower || heroSelected || drag) {
      cancelAim();
      heroSelected = false;
      return;
    }
    menuOpen = true;
  }

  /** Leaves the match. Both routes destroy their source on unmount. */
  function quitToMenu() {
    menuOpen = false;
    void goto('/');
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
    if (!myBoardEl) return shown.me.board.length;
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
          const id = shown.foe.board[i]?.instanceId;
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
        const index = shown.me.board.findIndex((m) => m.instanceId === attacking);
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
    if (aimingPower) {
      if (chosenMinionIds.has(minion.instanceId)) castPowerAt({ kind: 'minion', instanceId: minion.instanceId });
      else cancelAim();
      return;
    }
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
    if (aimingPower) {
      if (chosenMinionIds.has(minion.instanceId)) castPowerAt({ kind: 'minion', instanceId: minion.instanceId });
      else cancelAim();
      return;
    }
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
    if (aimingPower) {
      if (canAimFoeHero) castPowerAt({ kind: 'hero', side: 'foe' });
      else cancelAim();
      return;
    }
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

  /**
   * A hero power waiting to be aimed.
   *
   * Reuses the spell-aiming machinery whole rather than growing a second mode —
   * the Manufacturer's Robotic Arm is a targeted effect like any other.
   */
  let aimingPower = false;

  $: myPower = heroPowerFor(view.me.heroClass);

  function onHeroPower() {
    if (!myTurn || !view.me.canUseHeroPower) return;
    if (myPower?.needsTarget) {
      aimingPower = true;
      aiming = null;
      return;
    }
    dispatch('heroPower', {});
  }

  function castPowerAt(target: ChosenRef) {
    dispatch('heroPower', { target });
    aimingPower = false;
  }

  function onMyHero() {
    if (swallowClick) return;
    if (aimingPower) {
      if (canAimMyHero) castPowerAt({ kind: 'hero', side: 'me' });
      else cancelAim();
      return;
    }
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
    const index = shown.foe.board.findIndex((m) => m.instanceId === target.instanceId);
    const el = foeBoardEl?.querySelectorAll<HTMLElement>('.minion')[index];
    return el ? centreOf(el) : pointer;
  }

  onDestroy(() => {
    if (clockTimer) clearInterval(clockTimer);
    if (typeof window !== 'undefined') window.removeEventListener('resize', onResize);
  });
  if (typeof window !== 'undefined') window.addEventListener('resize', onResize);
</script>

<svelte:window
  on:pointermove={onPointerMove}
  on:pointerup={onPointerUp}
  on:pointercancel={onPointerCancel}
  on:keydown|capture={onWindowKey}
/>

<main
  class="table"
  class:quaking
  style:--fit={fit.toFixed(3)}
  style:--scene={tableArt ? `url("${tableArt}")` : 'none'}
  style:--scene-portrait={portraitArt ? `url("${portraitArt}")` : 'none'}
>
  <div class="vignette" aria-hidden="true"></div>
  <!--
    Dark ground for the light to sit on. The warm field stays in the middle,
    where the boards are; the edges and both hand areas darken, so the playable
    glow, the mana and the card backs have something to burn against.
  -->
  <div class="rim" aria-hidden="true"></div>
  <div class="tray-band foe" aria-hidden="true"></div>
  <div class="tray-band you" aria-hidden="true"></div>

  <!--
    What is left of the header. The nav is hidden for the length of a match, so
    the wordmark stays behind as the way back to it — pressing it does what
    pressing the header always did.
  -->
  <button class="brand" on:click={() => (menuOpen = true)} title="Menu (Esc)">Flashstone</button>

  <section class="hero-row foe">
    <div class="foe-hand" aria-hidden="true" bind:this={foeHandEl}>
      {#each Array(shown.foe.handCount) as _, i}
        <span
          class="foe-card"
          style:transform={`rotate(${(i - (shown.foe.handCount - 1) / 2) * 3.2}deg)`}
          style:margin-left={i ? '-58px' : '0'}
        >
          <CardBack backId={opponentBack} />
        </span>
      {/each}
    </div>

    <div></div>

    <div class="hero-block" bind:this={foeHeroEl}>
      <HeroPortrait
        label={opponentName}
        side="foe"
        health={shown.foe.health}
        armor={shown.foe.armor}
        weapon={shown.foe.weapon}
        targetable={heroTargetable || ((aiming !== null || aimingPower) && canAimFoeHero)}
        hit={hitHero === 'foe'}
        on:click={onEnemyHero}
      />

      <div class="hero-side">
        <div class="hero-meta">
          <span class="name">{opponentName}</span>
        </div>

        <HeroPowerButton
          heroClass={shown.foe.heroClass}
          used={shown.foe.heroPowerUsed}
          mine={false}
        />
      </div>
    </div>

    <div class="foe-corner">
      <ManaTray side="foe" mana={shown.foe.mana} maxMana={shown.foe.maxMana} />
      <div class="deck-pile">
        <CardBack backId={opponentBack} scale={0.34} />
        <span class="deck-count">{shown.foe.deckCount}</span>
      </div>
    </div>
  </section>

  <section class="board" bind:this={foeBoardEl}>
    {#each shown.foe.board as minion (minion.instanceId)}
      <div class="slot" animate:flip={{ duration: reduceMotion ? 0 : 280 }}>
        <MinionView
          minion={minion}
          targetable={targetableIds.has(minion.instanceId) ||
            ((aiming !== null || aimingPower) && chosenMinionIds.has(minion.instanceId))}
          summoning={summoningId === minion.instanceId}
          struck={struckIds.has(minion.instanceId)}
          dying={dyingIds.has(minion.instanceId)}
          on:click={() => onEnemyMinion(minion)}
        />
      </div>
    {/each}
  </section>

  <!--
    The centre line is where the turn is handed over, so it is where the button
    that hands it over lives. It used to sit under your own hero row, which put
    the single most-pressed control in the match a full board away from the
    board it acts on. There is no phase label: the button, the glows and the
    banner already say whose turn it is.
  -->
  <div class="centre">
    <span class="rule"></span>
    {#if showClock}
      <span class="clock" class:urgent={secondsLeft <= 10} aria-live="off">
        {secondsLeft}s
      </span>
    {/if}
    <!-- Labelled by whose turn it is on screen, not by whether input is open —
         so your own plays animating do not flash it to "Enemy Turn", and the
         opponent's do not flip it back before their turn has finished playing. -->
    <button class="end-turn" class:spent on:click={onEndTurn} disabled={!myTurn}>
      {isMyTurn(shown) ? 'End Turn' : 'Enemy Turn'}
    </button>
  </div>

  {#if aiming || aimingPower}
    <!-- Nothing is spent until a target lands, so cancelling costs nothing. -->
    <div class="aiming">
      <span>Choose a target for {aiming ? aiming.card.name : (myPower?.name ?? 'your hero power')}</span>
      <button on:click={cancelAim}>Cancel</button>
    </div>
  {/if}

  <section class="board mine" class:drop-open={drag?.kind === 'card'} bind:this={myBoardEl}>
    {#each shown.me.board as minion, i (minion.instanceId)}
      <div class="slot" animate:flip={{ duration: reduceMotion ? 0 : 280 }}>
        {#if drag?.kind === 'card' && drag.slot === i}
          <span class="drop-gap" aria-hidden="true"></span>
        {/if}
        <MinionView
          minion={minion}
          ready={myTurn && canAttackFromView(minion)}
          targetable={(aiming !== null || aimingPower) && chosenMinionIds.has(minion.instanceId)}
          selected={selectedId === minion.instanceId ||
            (drag?.kind === 'attack' && drag.instanceId === minion.instanceId)}
          summoning={summoningId === minion.instanceId}
          struck={struckIds.has(minion.instanceId)}
          dying={dyingIds.has(minion.instanceId)}
          on:click={() => onMyMinion(minion)}
          on:pointerdown={(e) => onMinionPointerDown(e, minion)}
        />
      </div>
    {/each}
    {#if drag?.kind === 'card' && drag.slot >= shown.me.board.length}
      <span class="drop-gap" aria-hidden="true"></span>
    {/if}
  </section>

  <section class="hero-row you">
    <div></div>

    <div class="hero-block reverse" bind:this={myHeroEl}>
      <div class="hero-side">
        <div class="hero-meta right">
          <span class="name">{deckName || 'You'}</span>
          <span>Deck {shown.me.deckCount}</span>
        </div>
        <HeroPowerButton
          heroClass={shown.me.heroClass}
          usable={myTurn && view.me.canUseHeroPower}
          used={shown.me.heroPowerUsed}
          on:click={onHeroPower}
        />
      </div>

      <HeroPortrait
        label="You"
        side="you"
        health={shown.me.health}
        armor={shown.me.armor}
        weapon={shown.me.weapon}
        armed={myTurn && view.me.canHeroAttack}
        targetable={(aiming !== null || aimingPower) && canAimMyHero}
        hit={hitHero === 'me'}
        on:click={onMyHero}
      />
    </div>

    <!-- Bottom right, just above the hand and beside End Turn: where your eyes
         are at the moment you decide whether a turn is over. -->
    <div class="mana-dock">
      <ManaTray mana={shown.me.mana} maxMana={shown.me.maxMana} />
    </div>
  </section>

  <section class="hand" class:active={isMyTurn(shown)} style:transform={`scale(${handScale.toFixed(3)})`}>
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

  {#if showcase}
    {#key showcase.key}
      <!-- The opponent's card, held up where it can be read before it acts. -->
      <div class="showcase" aria-live="polite" aria-label={`${opponentName} plays ${showcase.card.name}`}>
        <div class="lift" use:reveal={showcase.from} out:vanish={{ spell: showcase.card.type === 'Spell' }}>
          <div class="enlarge"><CardPreview card={showcase.card} playable={false} /></div>
        </div>
      </div>
    {/key}
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
  <Chronicle lines={chronicleLines} you={view.you} {opponentName} rail={railed} />

  <GameMenu
    open={menuOpen}
    on:close={() => (menuOpen = false)}
    on:quit={quitToMenu}
  />

  <!-- Held until playback ends, so the killing blow is seen before the result. -->
  {#if overTitle && !draining}
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
    /* border-box so the padding sits inside the height. `--chrome` is published
       by the layout shell: 55px (a 54px nav plus its border) off a match, 0
       during one, when the nav is hidden and the table has the viewport. */
    box-sizing: border-box;
    height: calc(100vh - var(--chrome, 55px));
    /* 12px, not 10: the hand cards' stat gems overhang the card frame. */
    padding-bottom: 12px;
    overflow: hidden;
    /*
     * TEMPORARY light-brown field, standing in until
     * `static/art/scene/table.webp` is dropped in (see static/art/README.md §4).
     *
     * Warm and mid-light rather than pale: the cards' own rules panels are
     * parchment, and a cream table would leave them with no edge.
     *
     * The three lines below are the whole of it. Anything that sits directly on
     * the field takes its colour from `--field-ink` or `--field-rule` rather
     * than from a literal, so going back to a dark field — or handing the field
     * to a painted backdrop — is these three declarations and nothing else.
     */
    --field-ink: #4b3a23;
    --field-rule: #7d6038;
    --field-base: radial-gradient(120% 90% at 50% -10%, #d3bd9c 0%, #b0946f 45%, #8f7454 100%);

    /* The dark field this replaced, for when a painted backdrop lands and the
       ink needs to go pale again:
         --field-ink: #8a7050;
         --field-rule: #6b512f;
         --field-base: radial-gradient(120% 90% at 50% -10%, #2a1c11 0%, #150e08 45%, var(--ink) 100%); */

    /* `art/scene/table.webp` paints over the base when it exists; until then
       `--scene` is `none` and this is exactly the gradient above. */
    background: var(--scene, none) center / cover no-repeat, var(--field-base);
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

  /*
   * A 16:9 backdrop cropped into a 3:4 viewport loses about 44% of its width,
   * which is why `table-portrait.webp` exists. Falls back to the landscape one,
   * and then to the gradient — a missing portrait variant is not an error.
   */
  @media (max-width: 820px) {
    .table {
      background: var(--scene-portrait, var(--scene, none)) center / cover no-repeat,
        var(--field-base);
    }
  }

  /*
   * Sits where the nav's wordmark did, so the eye finds it in the place it
   * already knows. Quiet until hovered: it is a way out, not a call to action.
   */
  .brand {
    position: absolute;
    top: 10px;
    left: 18px;
    z-index: 60;
    padding: 4px 6px;
    border: 1px solid transparent;
    border-radius: 4px;
    background: none;
    cursor: pointer;
    font-family: var(--display);
    font-size: 13px;
    font-weight: 700;
    letter-spacing: .22em;
    text-transform: uppercase;
    /* Sits on the dark top tray now, so it takes the tray's light ink. */
    color: rgba(236, 210, 160, .5);
    transition: color .16s ease, border-color .16s ease;
  }
  .brand:hover {
    border-color: rgba(236, 210, 160, .3);
    color: var(--gold-bright);
  }

  .vignette {
    position: absolute;
    inset: 0;
    background: radial-gradient(60% 45% at 50% 50%, rgba(255, 196, 110, .09), transparent 70%);
    pointer-events: none;
  }

  /* The carved edge of the table: the warm centre stays, the margins darken. */
  .rim {
    position: absolute;
    inset: 0;
    background: radial-gradient(78% 72% at 50% 48%, transparent 58%, rgba(38, 22, 9, .5) 100%);
    pointer-events: none;
  }

  /*
   * The two hand areas. Until the drawn trays exist (`ui/tray-you`,
   * `ui/tray-foe`), each is a dark ledge with a lit lip, so the playable glow
   * and the card backs sit on dark ground rather than mid-tone wood. Heights
   * follow the zoomed rows they sit under.
   */
  .tray-band {
    position: absolute;
    left: 0;
    right: 0;
    pointer-events: none;
  }

  .tray-band.you {
    bottom: 0;
    height: calc(150px * var(--fit, 1));
    border-top: 1px solid rgba(255, 214, 150, .16);
    background: linear-gradient(180deg, rgba(26, 15, 6, .62), rgba(12, 7, 3, .9));
    box-shadow: 0 -14px 28px rgba(30, 16, 4, .28);
  }

  .tray-band.foe {
    top: 0;
    height: calc(54px * var(--fit, 1));
    border-bottom: 1px solid rgba(255, 214, 150, .12);
    background: linear-gradient(0deg, rgba(26, 15, 6, .5), rgba(12, 7, 3, .85));
    box-shadow: 0 14px 28px rgba(30, 16, 4, .22);
  }

  .hero-row {
    position: relative;
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: 20px;
  }

  .hero-row.foe {
    padding: 13px 28px 0;
    grid-template-columns: 1fr auto 1fr;
    /* The fan hangs above this row; .table clips it to the viewport edge. */
    overflow: visible;
  }
  .hero-row.you { padding: 3px 28px 0; }

  .hero-row.foe > .hero-block { grid-column: 2; }
  .hero-row.foe > .foe-corner {
    grid-column: 3;
    justify-self: end;
    display: flex;
    align-items: center;
    gap: 16px;
  }
  .hero-row.you > .hero-block { grid-column: 2; }

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

  /*
   * Three tracks with the portrait in the middle one, so the **portrait** is
   * what sits on the table's centre axis — not the block that contains it.
   *
   * It was a flex row, which centred the group: the name, mana and hero power
   * beside the portrait pushed it about 80px off axis, on both sides and in
   * opposite directions. That is the line every attack is dragged along and
   * every hero-targeted card is dropped on, so the one thing that should have
   * been on the axis was the one thing that was not. It also puts `heroPos()`
   * back on the portrait, which is where a damage number should float from.
   *
   * The flanking track is empty on one side by design — the side content keeps
   * the position it had, and the portrait no longer pays for it.
   */
  .hero-block {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: 14px;
  }

  .hero-block > :global(.hero) { grid-column: 2; }
  .hero-block > .hero-side { grid-column: 3; justify-self: start; }
  .hero-block.reverse > .hero-side { grid-column: 1; justify-self: end; }

  .hero-side { display: flex; align-items: center; gap: 14px; }

  .hero-meta {
    display: flex;
    flex-direction: column;
    gap: 3px;
    font-family: var(--display);
    font-size: 11px;
    letter-spacing: .06em;
    text-transform: uppercase;
    color: var(--field-ink);
  }
  .hero-meta.right { text-align: right; }
  .hero-meta .name { font-size: 13px; font-weight: 700; letter-spacing: .08em; }

  .mana-dock {
    position: absolute;
    right: 28px;
    bottom: 0;
  }

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

  /* One per minion: what `animate:flip` slides and what an attack lunges. */
  .slot {
    position: relative;
    display: flex;
    gap: 10px;
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
  .table.quaking { animation: fs-quake .5s ease-out; }

  /*
   * Phase label, rule, then the button hard right — the button belongs on the
   * centre line, which is where the turn changes hands, but not in the middle
   * of it, where it sat on the axis every attack is dragged along.
   */
  .centre {
    position: relative;
    display: flex;
    align-items: center;
    gap: 16px;
    /* Just tall enough for the button. The row is inside a height-locked
       column, so every pixel here comes off the boards or pushes the hand's
       stat gems past the bottom edge. */
    height: 42px;
    padding: 0 28px;
  }

  .rule {
    flex: 1;
    height: 1px;
    background: linear-gradient(90deg, transparent, var(--field-rule), transparent);
  }

  .clock {
    font-family: var(--display);
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.1em;
    color: var(--text-dim);
    font-variant-numeric: tabular-nums;
  }
  .clock.urgent { color: var(--blood); }

  .end-turn {
    padding: 10px 24px;
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

  /*
   * The hand. Every card is fully opaque — a dimmed card read as broken, not as
   * unaffordable — and the ones you can play wear a crisp, saturated edge with
   * a tight bloom, on the dark tray, instead of the soft green haze that
   * vanished against the field. On your turn, a card you cannot afford says so
   * through its cost gem alone.
   */
  .hand :global(.card) { opacity: 1; }
  .hand.active :global(.card:not(.playable) .cost) { filter: saturate(.15) brightness(.7); }

  .hand :global(.card.playable:not(.drawn)),
  .ghost :global(.card.playable) {
    animation: fs-playable 1.7s ease-in-out infinite;
  }

  /*
   * The opponent's played card, held left of centre — clear of the compact
   * Chronicle, over the boards' left flank, where Hearthstone shows it.
   */
  .showcase {
    position: fixed;
    z-index: 250;
    left: max(30vw, 400px);
    top: 47%;
    transform: translate(-50%, -50%);
    pointer-events: none;
  }

  .showcase .lift { filter: drop-shadow(0 26px 40px rgba(0, 0, 0, .75)); }
  .showcase .enlarge { transform: scale(1.6); }
  .showcase :global(.card) { opacity: 1; }
  .showcase :global(.card:hover) { transform: none; }

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
