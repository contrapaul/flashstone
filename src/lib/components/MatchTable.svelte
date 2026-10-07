<script lang="ts">
  import { createEventDispatcher, onDestroy, tick } from 'svelte';
  import { gsap } from 'gsap';
  import CardPreview from './CardPreview.svelte';
  import MinionView from './MinionView.svelte';
  import HeroPortrait from './HeroPortrait.svelte';
  import ManaTray from './ManaTray.svelte';
  import CardBack from './CardBack.svelte';
  import DeckPile from './DeckPile.svelte';
  import Doodad from './Doodad.svelte';
  import { account } from '../account';
  import TurnBanner from './TurnBanner.svelte';
  import FloatingNumber from './FloatingNumber.svelte';
  import Splat from './Splat.svelte';
  import Chronicle from './Chronicle.svelte';
  import CardInspector from './CardInspector.svelte';
  import HeroPowerButton from './HeroPowerButton.svelte';
  import { heroPowerFor } from '../data/classes';
  import { settings } from '../settings';
  import type { GameEvent } from '../engine/events';
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
  import { sceneUrl, uiArtUrl } from '../../utils/art';
  import GameMenu from './GameMenu.svelte';
  import { goto } from '$app/navigation';
  import { applyCue, presentedDiff } from '../presentation/apply';
  import { centreOf, direct, hold, type Mark, type Showcase, type Stage } from '../presentation/director';
  import type { Fx } from '../presentation/fx';
  import FxLayer from './FxLayer.svelte';
  import {
    MOTION_SCALE,
    d,
    flipZoomed,
    opponentTurn,
    setMotion,
    setOpponentPace,
    sleep,
    spatial
  } from '../presentation/motion';

  /**
   * The painted backdrop, when one has been dropped into `static/art/scene/`.
   * Resolved once: the index is built at build time, so it cannot change while
   * a match is running.
   */
  const tableArt = sceneUrl('table');
  const portraitArt = sceneUrl('table-portrait');
  /** The two hand areas, when drawn (`ui/tray-you`, `ui/tray-foe`). */
  const trayArt = {
    you: uiArtUrl('tray-you') ? `url("${uiArtUrl('tray-you')}")` : null,
    foe: uiArtUrl('tray-foe') ? `url("${uiArtUrl('tray-foe')}")` : null
  };

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
  /** Minions mid-animation, by kind. Each set is reassigned, never mutated. */
  let marks: Record<Mark, Set<string>> = {
    summoning: new Set(),
    heavy: new Set(),
    struck: new Set(),
    dying: new Set(),
    triggered: new Set(),
    swapping: new Set(),
    refused: new Set()
  };
  /** How hard the table is shaking, 0–1. */
  let quake = 0;
  /** A hero brought to 0, breaking apart before the result is shown. */
  let heroDown: 'me' | 'foe' | null = null;
  /** Numbers pinned to what they happened to. */
  let splats: { id: number; kind: 'damage' | 'heal' | 'armor'; amount: number; x: number; y: number; intensity: number }[] = [];
  let hitHero: 'me' | 'foe' | null = null;
  let banner: string | null = null;
  let floats: { id: number; text: string; color: string; x: number; y: number }[] = [];
  let floatSeq = 0;
  let draining = false;
  let fx: Fx | null = null;
  /** The line from an opponent's spell to what they aimed it at. */
  let cueAim: { from: { x: number; y: number }; to: { x: number; y: number }; color: string } | null = null;
  /** The highlight a random effect flickers across its candidates. */
  let rouletteRect: DOMRect | null = null;
  /** The End Turn button announcing that the turn is yours. */
  let handover = false;

  /**
   * The board **on screen**, which is not always the board in `view`.
   *
   * `view` is where the match is; `shown` is where playback has got to. Each
   * cue moves `shown` one step towards `view` as it plays (`applyCue`), and the
   * two are made equal when playback ends.
   *
   * The **hand** is still read from `view`: a draw never names its card, and
   * `pendingDraws` holds new cards back until their cue. Legality and input
   * read `view` too — they are only live when nothing is playing, which is
   * exactly when the two agree.
   */
  let shown: PlayerView = view;

  /** A card held up large so it can be read — the opponent's play, a burn, fatigue. */
  let showcase: (Showcase & { key: number }) | null = null;
  let showcaseKey = 0;

  /** "Your Turn" as it turns over to you, then what it does. */
  $: endTurnLabel = handover ? 'Your Turn' : isMyTurn(shown) ? 'End Turn' : 'Enemy Turn';

  // The motion settings, applied before any cue is played.
  $: setMotion($settings.motion);
  $: setOpponentPace($settings.opponentPace);
  $: still = $settings.motion === 'reduced';
  $: flipMs = still ? 0 : Math.round(280 * MOTION_SCALE[$settings.motion]);
  /** CSS animations run at the same pace as the playback around them. */
  let pace = 1;

  let handWidth = 1440;
  let handHeight = 900;
  let inspected: Card | null = null;

  let myBoardEl: HTMLElement | undefined;
  let foeBoardEl: HTMLElement | undefined;
  let foeHeroEl: HTMLElement | undefined;
  let myHeroEl: HTMLElement | undefined;
  let foeHandEl: HTMLElement | undefined;
  let foeDeckEl: HTMLElement | undefined;
  let myDeckEl: HTMLElement | undefined;
  let handEl: HTMLElement | undefined;

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
   * The table scales to whichever axis is shorter of what it needs: 824px of
   * height, and 1060px of width — seven minions a side, clear of the
   * Chronicle's column of tiles at each end.
   * Big screens scale **up** (clamped at 1, the board was a small island on
   * anything past 1440x900), and a narrow one scales down by its width: iPad
   * portrait used to scale by height alone, and a full board ran off both edges.
   */
  const DESIGN_WIDTH = 1060;
  $: fit = Math.max(0.62, Math.min(1.35, handHeight / DESIGN_HEIGHT, handWidth / DESIGN_WIDTH));
  const RAIL_MIN_WIDTH = 1500;
  $: railed = handWidth >= RAIL_MIN_WIDTH;
  /** The board toys sit at the ends of the boards, clear of the rail when it is out —
      and on the left, of the Chronicle's tiles. */
  $: doodadInset = railed ? 300 / fit : 18;
  $: doodadLeft = railed ? doodadInset : 76 / fit;

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

  /** The player at this seat: their name on the plate, their back on the deck. */
  $: playerName = $account.user?.username ?? 'You';
  $: myBack = $account.cardBack;

  // ── The hand, fanned ─────────────────────────────────────
  /**
   * Room for the hand, in the table's own pixels. With the rail out the hand
   * keeps clear of it on both sides — scaled up on a wide screen, ten cards
   * would otherwise run under the log.
   */
  $: handRoom = Math.min((handWidth - (railed ? 580 : 0)) / fit - 90, 1300);

  const CARD_WIDTH = 134;
  /** Cards sit a hand's-breadth apart when there is room, and overlap by at most 30%. */
  const SPREAD = CARD_WIDTH + 10;
  const TIGHTEST = CARD_WIDTH * 0.7;
  /**
   * The widest a fan grows, so a full hand stays a hand held in the middle
   * rather than a row across the whole table: ten cards at 30% overlap.
   */
  const WIDEST = CARD_WIDTH + TIGHTEST * 9;

  /** The card under the pointer, which rises clear of the fan. */
  let hovered: number | null = null;

  /**
   * Where each card sits on the arc: its offset from the centre, how far it
   * drops at the ends, and its tilt. A hovered card's neighbours part to let
   * it through — further when the fan is tight, since they overlap it more.
   */
  $: fan = layoutFan(visibleHand.length, hovered, handRoom);

  function layoutFan(n: number, lifted: number | null, room: number) {
    const width = Math.min(room, WIDEST);
    const step = n > 1 ? Math.max(TIGHTEST, Math.min(SPREAD, (width - CARD_WIDTH) / (n - 1))) : 0;
    const mid = (n - 1) / 2;
    const parting = step < SPREAD ? 62 : 26;
    return Array.from({ length: n }, (_, i) => {
      const o = i - mid;
      const gap = lifted === null || i === lifted ? 0 : Math.abs(i - lifted);
      const part = gap === 0 ? 0 : Math.sign(i - (lifted ?? 0)) * Math.max(0, parting - 16 * (gap - 1));
      return { x: o * step + part, y: o * o * 1.8, r: o * 3.5 };
    });
  }

  /** Only shrinks when even the tightest fan will not fit. */
  $: handScale = Math.min(
    1,
    handRoom / (CARD_WIDTH + TIGHTEST * Math.max(0, visibleHand.length - 1))
  );

  /** What the card under the pointer would cost, so the crystals it would spend pulse. */
  $: previewCost =
    hovered !== null && myTurn && canPlayFromView(view, hovered) ? (visibleHand[hovered]?.cost ?? 0) : 0;

  /** The tray flashes red when a card you cannot afford is picked up. */
  let manaWarn = false;
  /** The card that was refused, shaking its head in the fan. */
  let refusedCard: number | null = null;

  function cannotAfford(index: number) {
    manaWarn = true;
    refusedCard = index;
    void sleep(600).then(() => {
      manaWarn = false;
      refusedCard = null;
    });
  }

  /** End Turn turning over as it is pressed. */
  let pressedEnd = false;

  /**
   * The fuse: with 20 seconds left on an online turn, a burning wire along the
   * centre line that reaches End Turn at 0. Null when there is no clock or
   * plenty of time. Measured as the fraction already burnt.
   */
  const FUSE_SECONDS = 20;
  $: fuse = showClock && secondsLeft <= FUSE_SECONDS ? 1 - Math.max(0, secondsLeft) / FUSE_SECONDS : null;

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
  // What each cue looks like lives in `presentation/director.ts`; this file
  // runs the queue and gives the director a stage to work on.

  // Drains whenever new cues arrive. Must stay above the line below: draining
  // is set synchronously inside drain(), which is what keeps that line from
  // snapping the board to the end state before playback has begun.
  $: if (events.length > 0 && !draining) void drain();
  // With nothing to play, the board on screen is simply the view.
  $: if (events.length === 0 && !draining) {
    shown = view;
    historyShown = afterLast(view);
  }

  /**
   * How much of the history the Chronicle shows: entries numbered below this.
   * It follows playback rather than the view, or it would tell the opponent's
   * whole turn before any of it had happened on the board. The cue that starts
   * an entry carries its number, and uncovers it once it has played.
   */
  let historyShown = 0;
  $: chronicleEntries = view.history.filter((e) => e.n < historyShown);
  const afterLast = (v: PlayerView) => (v.history.at(-1)?.n ?? -1) + 1;

  async function drain() {
    if (draining) return;
    draining = true;
    // Started from a reactive statement — the middle of Svelte's update. Any
    // assignment made before this await reaches the markup but not the values
    // derived from it (the End Turn label stayed "Enemy Turn" through the
    // handover). So the update finishes first, and playback begins after it.
    await tick();
    shown = startingPoint(shown, view, events);
    while (events.length > 0) {
      const event = events.shift() as GameEvent;
      events = events;
      // The opponent's turn plays at their pace, from whose turn is on screen —
      // or, for the cue that hands the turn over, whose it is becoming.
      opponentTurn((event.type === 'turn' ? event.owner : shown.turn) !== shown.you);
      pace = d(1000) / 1000;
      await direct(event, stage);
      // An action's tile lands once its first move has been seen — the card
      // revealed, the attack thrown — never ahead of it.
      if (event.entry !== undefined) historyShown = Math.max(historyShown, event.entry + 1);
      await sleep(hold(event, events[0]));
    }
    opponentTurn(false);
    pace = d(1000) / 1000;
    // Every cue carries its result, so this should change nothing. If it does,
    // a mutation somewhere is not emitting what it did — say which.
    if (import.meta.env.DEV) {
      const drift = presentedDiff(shown, view);
      if (drift.length > 0) console.warn('[playback] the board on screen drifted from the match:', drift);
    }
    shown = view;
    historyShown = afterLast(view);
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
    historyShown = 0;
    heroDown = null;
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

  /** What the director works through. Every state it sets is this table's. */
  const stage: Stage = {
    side: sideOf,
    shown: () => shown,
    advance: (cue) => (shown = applyCue(shown, cue)),
    queued: () => events,
    unit: unitOf,
    hero: (side) => (side === 'me' ? myHeroEl : foeHeroEl),
    foeBack: (index) => {
      const backs = foeHandEl?.querySelectorAll<HTMLElement>('.foe-card');
      return backs?.[Math.min(index, backs.length - 1)];
    },
    foeBacks: () => [...(foeHandEl?.querySelectorAll<HTMLElement>('.foe-card') ?? [])],
    foeDeck: () => foeDeckEl,
    nextDrawn: () => view.me.hand[view.me.hand.length - events.filter((e) => e.type === 'draw' && e.owner === view.you).length - 1],
    handCard: (card) => {
      const index = visibleHand.indexOf(card);
      return index < 0 ? undefined : (handEl?.querySelector<HTMLElement>(`.hand-slot[data-index="${index}"] .card`) ?? undefined);
    },
    myDeck: () => myDeckEl,
    mark: (kind, id, on) => {
      const next = new Set(marks[kind]);
      if (on) next.add(id);
      else next.delete(id);
      marks = { ...marks, [kind]: next };
    },
    setHeroHit: (side) => (hitHero = side),
    setHeroDown: (side) => (heroDown = side),
    setQuake: (intensity) => (quake = intensity),
    setBanner: (text) => (banner = text),
    float: floatAt,
    splat: (at, kind, amount, intensity) => {
      const id = floatSeq++;
      splats = [...splats, { id, kind, amount, x: at.x, y: at.y, intensity }];
      void sleep(1000).then(() => (splats = splats.filter((s) => s.id !== id)));
    },
    setShowcase: (show) => {
      showcase = show ? { ...show, key: ++showcaseKey } : null;
    },
    setAimLine: (line) => (cueAim = line),
    setRoulette: (rect) => (rouletteRect = rect),
    setHandover: (on) => (handover = on),
    fx: () => fx
  };

  /*
   * The opponent, thinking. While it is their turn and nothing is playing —
   * a person deciding, online, or the AI between moves — now and then one of
   * their cards rises a little out of the fan and settles back, the way a
   * Hearthstone opponent hovers over their hand. Purely idle: it never runs
   * while a cue is playing, and the next cue resets it.
   */
  const considering =
    typeof window === 'undefined'
      ? undefined
      : setInterval(() => {
          if (draining || !spatial() || view.winner || isMyTurn(shown) || showcase) return;
          if (Math.random() < 0.45) return;
          const backs = foeHandEl?.querySelectorAll<HTMLElement>('.foe-card .arrive');
          const back = backs?.[Math.floor(Math.random() * backs.length)];
          if (!back) return;
          gsap
            .timeline()
            .to(back, { y: 20, scale: 1.05, duration: 0.35, ease: 'power2.out' })
            .to(back, { y: 0, scale: 1, duration: 0.45, ease: 'power2.inOut', delay: 0.5, clearProps: 'transform' });
        }, 1700);

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

  /** The opponent's card flies up out of their hand and turns face up. */
  function reveal(node: HTMLElement, from: { x: number; y: number }) {
    if (!spatial()) {
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
      duration: d(500) / 1000,
      ease: 'power3.out'
    });
  }

  /**
   * And leaves: a minion shrinks towards the board, a spell flares out, a
   * burnt card is already gone, and fatigue flies into the hero it strikes.
   */
  function vanish(node: Element, { show }: { show: Showcase }) {
    if (show.mode === 'burn') return { duration: d(80), css: (t: number) => `opacity: ${t}` };
    if (show.mode === 'fatigue') {
      const here = centreOf(node as HTMLElement);
      const dx = show.strike.x - here.x;
      const dy = show.strike.y - here.y;
      return {
        duration: spatial() ? d(260) : d(120),
        easing: (t: number) => t * t,
        css: (t: number) =>
          spatial()
            ? `transform: translate(${(1 - t) * dx}px, ${(1 - t) * dy}px) scale(${0.45 + 0.55 * t}); opacity: ${Math.min(1, t * 5)}`
            : `opacity: ${t}`
      };
    }
    const spell = show.card.type === 'Spell';
    return {
      duration: spatial() ? d(280) : d(120),
      css: (t: number) =>
        spell
          ? `opacity: ${t}; transform: scale(${1 + (1 - t) * 0.3}); filter: brightness(${1 + (1 - t) * 1.6})`
          : `opacity: ${t}; transform: scale(${0.55 + 0.45 * t}) translateY(${(1 - t) * 60}px)`
    };
  }

  /**
   * An attack that is not allowed — onto a minion behind a Taunt, or into
   * Stealth — is refused without a sentence: the target shakes its head, and
   * if Taunt is the reason, every enemy Taunt shield flashes red.
   */
  let tauntWarn = false;
  let heroRefused = false;

  function refuse(target: { kind: 'minion'; instanceId: string } | { kind: 'hero' }) {
    if (target.kind === 'minion') {
      const id = target.instanceId;
      stage.mark('refused', id, true);
      void sleep(420).then(() => stage.mark('refused', id, false));
    } else {
      heroRefused = true;
      void sleep(420).then(() => (heroRefused = false));
    }
    if (shown.foe.board.some((m) => m.keywords.includes('Taunt'))) {
      tauntWarn = true;
      void sleep(700).then(() => (tauntWarn = false));
    }
  }

  /** An enemy under the pointer that an attack may *not* hit, if there is one. */
  function refusedAt(x: number, y: number): { kind: 'minion'; instanceId: string } | { kind: 'hero' } | null {
    const inside = (el: Element) => {
      const r = el.getBoundingClientRect();
      return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    };
    const els = foeBoardEl ? [...foeBoardEl.querySelectorAll('.minion')] : [];
    const index = els.findIndex(inside);
    if (index >= 0) {
      const id = shown.foe.board[index]?.instanceId;
      return id && !targetableIds.has(id) ? { kind: 'minion', instanceId: id } : null;
    }
    const hero = foeHeroEl?.querySelector('.ring');
    return hero && inside(hero) && !heroTargetable ? { kind: 'hero' } : null;
  }

  function floatAt(at: { x: number; y: number } | undefined, text: string, color: string) {
    if (!at) return;
    const id = floatSeq++;
    floats = [...floats, { id, text, color, x: at.x, y: at.y }];
    void sleep(900).then(() => (floats = floats.filter((f) => f.id !== id)));
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
        // Picking up a card you cannot afford: the mana says so, the card
        // shakes its head, and nothing lifts. Shown once per press.
        if (card && myTurn && card.cost > view.me.mana) {
          cannotAfford(press.handIndex);
          press = null;
          return;
        }
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
      if (!finished.target) {
        const refused = refusedAt(event.clientX, event.clientY);
        if (refused) refuse(refused);
        return;
      }
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
      } else {
        refuse({ kind: 'minion', instanceId: minion.instanceId });
      }
      return;
    }
    if (myTurn && heroSelected && view.me.canHeroAttack) {
      if (targetableIds.has(minion.instanceId)) {
        dispatch('heroAttack', { target: { kind: 'minion', instanceId: minion.instanceId } });
        heroSelected = false;
      } else {
        refuse({ kind: 'minion', instanceId: minion.instanceId });
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
    if ((activeAttacker || heroSelected) && !heroTargetable) {
      refuse({ kind: 'hero' });
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
    pressedEnd = true;
    void sleep(450).then(() => (pressedEnd = false));
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
    if (considering) clearInterval(considering);
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
  class:quaking={quake > 0}
  class:still
  class:taunt-warn={tauntWarn}
  style:--quake={quake.toFixed(2)}
  style:--fit={fit.toFixed(3)}
  style:--pace={pace.toFixed(2)}
  style:--scene={tableArt ? `url("${tableArt}")` : 'none'}
  style:--scene-portrait={portraitArt ? `url("${portraitArt}")` : 'none'}
>
  <div class="vignette" aria-hidden="true"></div>
  <!--
    Dark ground for the light to sit on. The warm field stays in the middle,
    where the boards are; the edges and both hand areas darken, so the playable
    glow, the mana and the card backs have something to burn against.
  -->
  <div class="grain" aria-hidden="true"></div>
  <div class="rim" aria-hidden="true"></div>
  <div class="frame" aria-hidden="true"></div>
  <div class="tray-band foe" style:--tray={trayArt.foe} aria-hidden="true"></div>
  <div class="tray-band you" style:--tray={trayArt.you} aria-hidden="true"></div>
  {#if shown.me.health <= 10 && shown.me.health > 0 && !view.winner}
    <!-- Low health: a faint red heartbeat on your side of the table. -->
    <div class="heartbeat" aria-hidden="true"></div>
  {/if}

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
          <span class="arrive"><CardBack backId={opponentBack} /></span>
        </span>
      {/each}
    </div>

    <div></div>

    <div class="hero-block" bind:this={foeHeroEl}>
      <HeroPortrait
        label={opponentName}
        name={opponentName}
        heroClass={shown.foe.heroClass}
        side="foe"
        health={shown.foe.health}
        armor={shown.foe.armor}
        weapon={shown.foe.weapon}
        targetable={heroTargetable || ((aiming !== null || aimingPower) && canAimFoeHero)}
        hit={hitHero === 'foe'}
        destroyed={heroDown === 'foe'}
        refused={heroRefused}
        on:click={onEnemyHero}
      />

      <div class="hero-side">
        <HeroPowerButton
          heroClass={shown.foe.heroClass}
          used={shown.foe.heroPowerUsed}
          mine={false}
        />
      </div>
    </div>

    <div class="foe-corner">
      <ManaTray side="foe" mana={shown.foe.mana} maxMana={shown.foe.maxMana} />
      <DeckPile count={shown.foe.deckCount} backId={opponentBack} label="Their deck" bind:el={foeDeckEl} />
    </div>
  </section>

  <section class="board" style:--doodad-inset={`${doodadInset}px`}
    style:--doodad-left={`${doodadLeft}px`} bind:this={foeBoardEl}>
    <span class="doodad-at left"><Doodad kind="lamp" /></span>
    <span class="doodad-at right"><Doodad kind="printer" /></span>
    {#each shown.foe.board as minion (minion.instanceId)}
      <div class="slot" animate:flipZoomed={{ duration: flipMs }}>
        <MinionView
          minion={minion}
          targetable={targetableIds.has(minion.instanceId) ||
            ((aiming !== null || aimingPower) && chosenMinionIds.has(minion.instanceId))}
          summoning={marks.summoning.has(minion.instanceId)}
          struck={marks.struck.has(minion.instanceId)}
          dying={marks.dying.has(minion.instanceId)}
          triggered={marks.triggered.has(minion.instanceId)}
          heavy={marks.heavy.has(minion.instanceId)}
          swapping={marks.swapping.has(minion.instanceId)}
          refused={marks.refused.has(minion.instanceId)}
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
    <span class="rule">
      {#if fuse !== null}
        <!--
          The fuse: a wire burning along the centre line towards End Turn,
          reaching it as the time runs out. Hearthstone's rope, in workshop
          materials. Only online turns have a clock.
        -->
        <span class="fuse" class:urgent={secondsLeft <= 10} style:--burnt={fuse.toFixed(3)} aria-hidden="true">
          <span class="wire"></span>
          <span class="flame"></span>
        </span>
      {/if}
    </span>
    {#if showClock}
      <span class="sr-only" aria-live={secondsLeft === 10 || secondsLeft === 5 ? 'polite' : 'off'}>
        {secondsLeft} seconds left in this turn
      </span>
    {/if}
    <!-- Labelled by whose turn it is on screen, not by whether input is open —
         so your own plays animating do not flash it to "Enemy Turn", and the
         opponent's do not flip it back before their turn has finished playing.
         Gold while you have plays, green once you have none, grey on theirs. -->
    <button class="end-turn" class:spent class:handover class:pressed={pressedEnd} on:click={onEndTurn} disabled={!myTurn}>
      <!-- Keyed on the words, so each change turns the button over. -->
      {#key endTurnLabel}
        <span class="turnover">{endTurnLabel}</span>
      {/key}
    </button>
  </div>

  {#if aiming || aimingPower}
    <!-- Nothing is spent until a target lands, so cancelling costs nothing. -->
    <div class="aiming">
      <span>Choose a target for {aiming ? aiming.card.name : (myPower?.name ?? 'your hero power')}</span>
      <button on:click={cancelAim}>Cancel</button>
    </div>
  {/if}

  <section
    class="board mine"
    class:drop-open={drag?.kind === 'card'}
    style:--doodad-inset={`${doodadInset}px`}
    style:--doodad-left={`${doodadLeft}px`}
    bind:this={myBoardEl}
  >
    <span class="doodad-at left"><Doodad kind="vise" /></span>
    <span class="doodad-at right"><Doodad kind="pencils" /></span>
    {#each shown.me.board as minion, i (minion.instanceId)}
      <div class="slot" animate:flipZoomed={{ duration: flipMs }}>
        {#if drag?.kind === 'card' && drag.slot === i}
          <span class="drop-gap" aria-hidden="true"></span>
        {/if}
        <MinionView
          minion={minion}
          ready={myTurn && canAttackFromView(minion)}
          targetable={(aiming !== null || aimingPower) && chosenMinionIds.has(minion.instanceId)}
          selected={selectedId === minion.instanceId ||
            (drag?.kind === 'attack' && drag.instanceId === minion.instanceId)}
          summoning={marks.summoning.has(minion.instanceId)}
          struck={marks.struck.has(minion.instanceId)}
          dying={marks.dying.has(minion.instanceId)}
          triggered={marks.triggered.has(minion.instanceId)}
          heavy={marks.heavy.has(minion.instanceId)}
          swapping={marks.swapping.has(minion.instanceId)}
          refused={marks.refused.has(minion.instanceId)}
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

    <div class="hero-block" bind:this={myHeroEl}>
      <HeroPortrait
        label="You"
        name={playerName}
        heroClass={shown.me.heroClass}
        side="you"
        health={shown.me.health}
        armor={shown.me.armor}
        weapon={shown.me.weapon}
        armed={myTurn && view.me.canHeroAttack}
        targetable={(aiming !== null || aimingPower) && canAimMyHero}
        hit={hitHero === 'me'}
        destroyed={heroDown === 'me'}
        on:click={onMyHero}
      />

      <div class="hero-side">
        <HeroPowerButton
          heroClass={shown.me.heroClass}
          usable={myTurn && view.me.canUseHeroPower}
          used={shown.me.heroPowerUsed}
          on:click={onHeroPower}
        />
      </div>
    </div>

    <div class="my-deck">
      <DeckPile count={shown.me.deckCount} backId={myBack} label="Your deck" bind:el={myDeckEl} />
    </div>

    <!-- Bottom right, just above the hand and beside End Turn: where your eyes
         are at the moment you decide whether a turn is over. -->
    <div class="mana-dock">
      <ManaTray mana={shown.me.mana} maxMana={shown.me.maxMana} preview={previewCost} warn={manaWarn} />
    </div>
  </section>

  <!--
    The hand, fanned on an arc. A card under the pointer rises clear of the
    others and its neighbours part; on a touch screen there is no hover, and a
    tap opens the card as it always has.
  -->
  <section
    class="hand"
    class:active={isMyTurn(shown)}
    style:transform={`scale(${handScale.toFixed(3)})`}
    bind:this={handEl}
    on:pointerleave={() => (hovered = null)}
  >
    {#each visibleHand as card, i (card)}
      <div
        class="hand-slot"
        class:lifted={drag?.kind === 'card' && drag.handIndex === i}
        class:hovered={hovered === i && !drag}
        class:refused={refusedCard === i}
        data-index={i}
        style:--x={`${fan[i]?.x ?? 0}px`}
        style:--y={`${fan[i]?.y ?? 0}px`}
        style:--r={`${fan[i]?.r ?? 0}deg`}
        on:pointerenter={(e) => e.pointerType === 'mouse' && !drag && (hovered = i)}
        on:focusin={() => (hovered = i)}
        on:focusout={() => hovered === i && (hovered = null)}
      >
        <CardPreview
          {card}
          playable={myTurn && canPlayFromView(view, i)}
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
      {#if showcase.mode === 'reveal'}
        <!-- The opponent's card, held up where it can be read before it acts. -->
        <div class="showcase" aria-live="polite" aria-label={`${opponentName} plays ${showcase.card.name}`}>
          <div class="lift" use:reveal={showcase.from} out:vanish={{ show: showcase }}>
            <div class="enlarge"><CardPreview card={showcase.card} playable={false} /></div>
          </div>
        </div>
      {:else if showcase.mode === 'burn'}
        <!-- Drawn into a full hand: shown, then burnt away from the bottom up. -->
        <div
          class="showcase burn"
          style:left={`${showcase.at.x}px`}
          style:top={`${showcase.at.y}px`}
          aria-live="polite"
          aria-label={`${showcase.card.name} is burned`}
        >
          <div class="lift" use:reveal={showcase.at} out:vanish={{ show: showcase }}>
            <div class="enlarge"><CardPreview card={showcase.card} playable={false} /></div>
          </div>
        </div>
      {:else}
        <!-- An empty deck deals an empty card, showing what it will cost. -->
        <div
          class="showcase fatigue"
          style:left={`${showcase.at.x}px`}
          style:top={`${showcase.at.y}px`}
          aria-live="polite"
          aria-label={`Fatigue: ${showcase.amount} damage`}
        >
          <div class="lift" use:reveal={showcase.from} out:vanish={{ show: showcase }}>
            <div class="enlarge"><div class="fatigue-card"><b>{showcase.amount}</b></div></div>
          </div>
        </div>
      {/if}
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

  {#if cueAim}
    <!-- Drawn out from the caster to the target, then held while it is read. -->
    <svg class="cue-aim" aria-hidden="true">
      <path
        class="cue-aim-line"
        pathLength="1"
        style:stroke={cueAim.color}
        d={`M ${cueAim.from.x} ${cueAim.from.y} Q ${(cueAim.from.x + cueAim.to.x) / 2} ${Math.min(cueAim.from.y, cueAim.to.y) - 70} ${cueAim.to.x} ${cueAim.to.y}`}
      />
      <circle class="cue-aim-head" style:stroke={cueAim.color} cx={cueAim.to.x} cy={cueAim.to.y} r="22" />
    </svg>
  {/if}

  {#if rouletteRect}
    <div
      class="roulette"
      aria-hidden="true"
      style:left={`${rouletteRect.left - 8}px`}
      style:top={`${rouletteRect.top - 8}px`}
      style:width={`${rouletteRect.width + 16}px`}
      style:height={`${rouletteRect.height + 16}px`}
    ></div>
  {/if}

  <FxLayer bind:fx />

  {#each splats as splat (splat.id)}
    <Splat kind={splat.kind} amount={splat.amount} x={splat.x} y={splat.y} intensity={splat.intensity} />
  {/each}

  {#each floats as float (float.id)}
    <FloatingNumber text={float.text} color={float.color} x={float.x} y={float.y} />
  {/each}

  <CardInspector
    card={inspected}
    showDefinition={$settings.definitionsInGame}
    on:close={() => (inspected = null)}
  />

  <TurnBanner text={banner} />
  <Chronicle
    entries={chronicleEntries}
    you={view.you}
    {opponentName}
    myClass={shown.me.heroClass}
    foeClass={shown.foe.heroClass}
    rail={railed}
  />

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

  /*
   * A little grain in the wood, so the field reads as a surface rather than a
   * colour. Fractal noise, multiplied in at low strength.
   */
  .grain {
    position: absolute;
    inset: 0;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='240'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9 .06' numOctaves='3' seed='7'/%3E%3CfeColorMatrix values='0 0 0 0 .3  0 0 0 0 .2  0 0 0 0 .1  0 0 0 .55 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
    opacity: .5;
    mix-blend-mode: multiply;
    pointer-events: none;
  }

  /* The carved lip where the playing surface meets the rim. */
  .frame {
    position: absolute;
    inset: 8px;
    border-radius: 22px;
    box-shadow: inset 0 0 0 2px rgba(255, 226, 170, .14), inset 0 0 0 4px rgba(40, 22, 8, .35),
      inset 0 0 50px rgba(30, 16, 4, .35);
    pointer-events: none;
  }

  /* Your health at 10 or less: a faint red pulse on your half, beating twice. */
  .heartbeat {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 55%;
    background: radial-gradient(80% 90% at 50% 100%, transparent 55%, rgba(200, 30, 20, .32) 100%);
    pointer-events: none;
    animation: fs-heartbeat 1.3s ease-in-out infinite;
  }

  @keyframes fs-heartbeat {
    0%, 40%, 100% { opacity: .35; }
    12% { opacity: 1; }
    26% { opacity: .75; }
  }

  .table.still .heartbeat { animation: none; opacity: .6; }

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
    background: var(--tray, none) center / 100% 100% no-repeat,
      linear-gradient(180deg, rgba(26, 15, 6, .62), rgba(12, 7, 3, .9));
    box-shadow: 0 -14px 28px rgba(30, 16, 4, .28);
  }

  .tray-band.foe {
    top: 0;
    height: calc(54px * var(--fit, 1));
    border-bottom: 1px solid rgba(255, 214, 150, .12);
    background: var(--tray, none) center / 100% 100% no-repeat,
      linear-gradient(0deg, rgba(26, 15, 6, .5), rgba(12, 7, 3, .85));
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

  /* The fan re-spaces smoothly as cards come and go. */
  .foe-card { transition: transform .3s ease; }

  /* The part that rises when the opponent picks a card — the fan's own rotation stays on its parent. */
  .arrive { display: block; transform-origin: top center; }

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

  /* Both heroes alike, as in Hearthstone: weapon to the left, power to the right. */
  .hero-block > :global(.hero) { grid-column: 2; }
  .hero-block > .hero-side { grid-column: 3; justify-self: start; }

  .hero-side { display: flex; align-items: center; gap: 14px; padding-left: 8px; }

  .mana-dock {
    position: absolute;
    right: 28px;
    bottom: 0;
  }

  /* Your deck on the right edge, above your mana — the opponent's mirrors it at the top. */
  .my-deck {
    position: absolute;
    right: 34px;
    bottom: 60px;
  }

  /* The board toys, one at each end of each board. */
  .doodad-at {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
  }
  .doodad-at.left { left: var(--doodad-left); }
  .doodad-at.right { right: var(--doodad-inset); }

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

  /* An attack's aim, in the colour of danger: red. Green is for what you can play. */
  .aim-line {
    fill: none;
    stroke: rgba(255, 96, 72, .92);
    stroke-width: 5;
    stroke-linecap: round;
    filter: drop-shadow(0 0 8px rgba(255, 80, 60, .8));
  }

  .aim-head {
    fill: rgba(255, 96, 72, .25);
    stroke: rgba(255, 150, 130, .95);
    stroke-width: 3;
  }

  /* Locked onto a legal target: fill in. */
  .aim-head.locked { fill: rgba(255, 110, 85, .75); }

  .cue-aim {
    position: fixed;
    inset: 0;
    width: 100vw;
    height: 100vh;
    z-index: 330;
    pointer-events: none;
  }

  .cue-aim-line {
    fill: none;
    stroke-width: 6;
    stroke-linecap: round;
    stroke-dasharray: 1;
    stroke-dashoffset: 1;
    filter: drop-shadow(0 0 8px rgba(255, 90, 70, .85));
    animation: fs-draw-line .26s ease-out forwards;
  }

  .cue-aim-head {
    fill: rgba(255, 90, 70, .22);
    stroke-width: 3;
    opacity: 0;
    animation: fs-reticle .5s ease-out .2s forwards;
  }

  @keyframes fs-draw-line { to { stroke-dashoffset: 0; } }

  @keyframes fs-reticle {
    0% { opacity: 0; transform-box: fill-box; transform-origin: center; transform: scale(1.8); }
    100% { opacity: 1; transform-box: fill-box; transform-origin: center; transform: scale(1); }
  }

  /* The random pick's highlight: a ring that hops from candidate to candidate. */
  .roulette {
    position: fixed;
    z-index: 330;
    border-radius: 16px;
    border: 3px solid #ffe08a;
    box-shadow: 0 0 22px rgba(255, 210, 100, .9), inset 0 0 18px rgba(255, 210, 100, .5);
    pointer-events: none;
  }

  /* Draggable things must not also pan the page on touch. Scoped to the table
     so cards elsewhere (the import preview, the collection) still scroll. */
  .hand :global(.card),
  .board :global(.minion) {
    touch-action: none;
  }

  .table { user-select: none; }

  /* A heavy hit, or a heavy landing, shakes the table, not just the portrait. */
  .table.quaking { animation: fs-quake .42s ease-out; }

  /*
   * Reduced motion, chosen in settings: everything still changes and fades,
   * nothing travels or shakes — what the OS preference does globally.
   */
  .table.still.quaking { animation: none; }
  .table.still :global(.unit.struck),
  .table.still :global(.hero.hit) { animation: none; }
  .table.still :global(.unit.summoning),
  .table.still :global(.unit.summoning.heavy) { animation: fs-fade-in .3s ease-out; }
  .table.still :global(.unit.dying) { animation: fs-fade-out .5s ease-in forwards; }

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

  /*
   * The fuse. A wire laid along the centre line, burning from the far end
   * towards End Turn: `--burnt` is how much of it has gone. The flame sits on
   * the burning end and throws sparks; at ten seconds the wire glows hot.
   */
  .rule { position: relative; }

  .fuse {
    position: absolute;
    left: calc(var(--burnt) * 100%);
    right: 0;
    top: 50%;
    height: 4px;
    margin-top: -2px;
    transition: left 1s linear;
  }

  .wire {
    position: absolute;
    inset: 0;
    border-radius: 2px;
    background: repeating-linear-gradient(90deg, #6b4f2e 0 6px, #8a6a3e 6px 9px);
    box-shadow: 0 1px 2px rgba(0, 0, 0, .5);
  }

  .fuse.urgent .wire {
    background: repeating-linear-gradient(90deg, #a8401e 0 6px, #e0702a 6px 9px);
    box-shadow: 0 0 8px rgba(255, 110, 40, .8);
  }

  .flame {
    position: absolute;
    left: -7px;
    top: -7px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: radial-gradient(circle, #fff6d0, #ffb24a 40%, rgba(255, 90, 30, .6) 65%, transparent 72%);
    box-shadow: 0 0 14px 4px rgba(255, 150, 50, .8);
    animation: fs-flame .18s ease-in-out infinite alternate;
  }

  /* Sparks thrown off the burning end. */
  .flame::before,
  .flame::after {
    content: '';
    position: absolute;
    left: 7px;
    top: 7px;
    width: 3px;
    height: 3px;
    border-radius: 50%;
    background: #ffe08a;
    box-shadow: 0 0 4px #ffb24a;
    animation: fs-fuse-spark .5s linear infinite;
  }
  .flame::after { animation-delay: .25s; animation-name: fs-fuse-spark-2; }

  @keyframes fs-flame {
    from { transform: scale(.85); filter: brightness(1); }
    to { transform: scale(1.15); filter: brightness(1.4); }
  }

  @keyframes fs-fuse-spark {
    from { transform: none; opacity: 1; }
    to { transform: translate(-10px, -14px); opacity: 0; }
  }

  @keyframes fs-fuse-spark-2 {
    from { transform: none; opacity: 1; }
    to { transform: translate(-6px, 12px); opacity: 0; }
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }

  /*
   * End Turn, at the right end of the centre line: gold while you still have
   * plays, green once you have none, grey on the opponent's turn. Pressing it
   * turns it over.
   */
  .end-turn {
    padding: 13px 30px;
    border: 1px solid var(--rule);
    border-radius: 6px;
    background: linear-gradient(180deg, #2a2118, #1a1410);
    color: var(--text-faint);
    font-family: var(--display);
    font-weight: 700;
    font-size: 13px;
    letter-spacing: .18em;
    text-transform: uppercase;
    cursor: default;
    transition: all .18s ease;
  }

  .end-turn.pressed { animation: fs-press-flip .45s ease-in-out; }

  @keyframes fs-press-flip {
    0% { transform: perspective(400px) rotateX(0); }
    50% { transform: perspective(400px) rotateX(90deg) scale(.96); }
    100% { transform: perspective(400px) rotateX(0); }
  }

  .end-turn:not(:disabled) {
    border-color: #e3bf72;
    background: linear-gradient(180deg, #b98a34, #7a5620);
    color: #1a1207;
    cursor: pointer;
    box-shadow: 0 8px 18px rgba(0, 0, 0, .5), inset 0 1px 0 rgba(255, 240, 200, .5),
      0 0 18px rgba(224, 190, 118, .25);
  }

  /* Each change of words turns the button over, like a placard. */
  .turnover {
    display: inline-block;
    animation: fs-turnover .42s cubic-bezier(.2, 1.3, .4, 1);
  }

  @keyframes fs-turnover {
    from { transform: perspective(300px) rotateX(-90deg); opacity: 0; }
    to { transform: none; opacity: 1; }
  }

  /* The turn arriving: a gold flare that settles into the ordinary button. */
  .end-turn.handover {
    animation: fs-handover 1.3s ease-out;
  }

  @keyframes fs-handover {
    0% { box-shadow: 0 0 0 0 rgba(255, 226, 140, 0); filter: brightness(1); }
    18% { box-shadow: 0 0 0 4px rgba(255, 226, 140, .9), 0 0 40px rgba(255, 206, 90, .9); filter: brightness(1.5); }
    100% { box-shadow: 0 0 0 0 rgba(255, 226, 140, 0); filter: brightness(1); }
  }

  /* Nothing left to do: the button turns green and pulses. Green means "go". */
  .end-turn.spent:not(:disabled) {
    border-color: #8dffad;
    background: linear-gradient(180deg, #3fae5a, #1f6b33);
    color: #06140a;
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

  /*
   * A burn: once it has been seen, the card goes from the bottom up, its edge
   * glowing. A mask three cards tall slides up past it, carrying the line
   * between shown and gone.
   */
  .showcase.burn .lift {
    filter: drop-shadow(0 0 12px rgba(255, 120, 40, .95)) drop-shadow(0 26px 40px rgba(0, 0, 0, .75));
    -webkit-mask-image: linear-gradient(to top, transparent 46%, #000 54%);
    mask-image: linear-gradient(to top, transparent 46%, #000 54%);
    -webkit-mask-size: 100% 300%;
    mask-size: 100% 300%;
    -webkit-mask-position: 0 0;
    mask-position: 0 0;
    animation: fs-burn calc(.65s * var(--pace, 1)) ease-in calc(.45s * var(--pace, 1)) forwards;
  }

  @keyframes fs-burn {
    to { -webkit-mask-position: 0 100%; mask-position: 0 100%; }
  }

  /* Fatigue: no picture, no name — an empty card, and the damage it will do. */
  .fatigue-card {
    width: 134px;
    height: 168px;
    display: grid;
    place-items: center;
    border-radius: 13px;
    border: 2px solid #4a3a5e;
    background:
      radial-gradient(circle at 50% 45%, rgba(170, 120, 255, .25), transparent 60%),
      linear-gradient(180deg, #2a2236, #120e18);
    box-shadow: inset 0 0 30px rgba(0, 0, 0, .8);
  }

  .fatigue-card b {
    font-family: var(--display);
    font-size: 56px;
    font-weight: 700;
    color: #e6d4ff;
    text-shadow: 0 0 18px rgba(170, 120, 255, .9), 0 3px 6px #000;
  }

  /* Attacking past a Taunt: the opponent's shields flash red — the rule, shown. */
  .table.taunt-warn :global(.board:not(.mine) .taunt-frame) {
    animation: fs-taunt-warn .7s ease-out;
  }

  @keyframes fs-taunt-warn {
    0%, 100% { filter: none; }
    20%, 60% { filter: sepia(1) saturate(7) hue-rotate(-35deg) brightness(1.15); }
    40%, 80% { filter: none; }
  }
  .showcase .enlarge { transform: scale(1.6); }
  .showcase :global(.card) { opacity: 1; }
  .showcase :global(.card:hover) { transform: none; }

  /*
   * The fan. Each card hangs from the bottom centre of the hand, offset along
   * an arc and tilted by `--x`, `--y` and `--r` (laid out in the script). The
   * row only scales down when even a 30% overlap will not fit.
   */
  .hand {
    position: relative;
    /* Above the hero row's gems and plate, so a card lifted from the fan is never under them. */
    z-index: 10;
    height: 170px;
    flex: 0 0 170px;
    transform-origin: bottom center;
    transition: transform .2s ease;
  }

  .hand-slot {
    position: absolute;
    left: 50%;
    bottom: 0;
    transform: translateX(calc(var(--x) - 50%)) translateY(var(--y)) rotate(var(--r));
    transform-origin: 50% 100%;
    transition: transform .24s cubic-bezier(.2, .9, .3, 1);
  }

  /* Under the pointer: it rises clear of the fan, upright, at half again its size. */
  .hand-slot.hovered {
    z-index: 50;
    transform: translateX(calc(var(--x) - 50%)) translateY(-30px) scale(1.5);
    transition-duration: .16s;
  }

  /* The card's own hover lift is the fan's job here. */
  .hand :global(.card:hover) { transform: none; }

  /* Picked up but unaffordable: it shakes its head and stays put. */
  .hand-slot.refused :global(.card) { animation: fs-card-no .42s ease-out; }

  @keyframes fs-card-no {
    0%, 100% { transform: none; }
    20% { transform: translateX(-8px) rotate(-3deg); }
    45% { transform: translateX(7px) rotate(3deg); }
    70% { transform: translateX(-4px); }
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
