<script lang="ts">
  import type { Card, Keyword } from '../../types/cards';
  import { RARITY_COLOR, artFor, artUrlFor, sigil, uiArtUrl } from '../../utils/art';

  export let card: Card;
  /** Dimmed and non-interactive when false. */
  export let playable = true;
  /** Set true for the card that just arrived in hand to play the draw arc. */
  export let drawn = false;
  /**
   * The gold (foil) variant. A variant, not a separate card — same art, same
   * stats, same text; a gold frame and a shimmer over the top. See
   * docs/plan/DECISIONS.md §10.
   */
  export let gold = false;

  $: isMinion = card.type === 'Minion';
  $: isWeapon = card.type === 'Weapon';

  /** Board/hand abbreviations spell keywords solid; the card face reads them out. */
  const KEYWORD_LABEL: Record<Keyword, string> = {
    Taunt: 'Taunt',
    Charge: 'Charge',
    DivineShield: 'Divine Shield',
    Windfury: 'Windfury',
    Stealth: 'Stealth'
  };

  $: keywordLine = card.keywords.map((k) => `${KEYWORD_LABEL[k]}.`).join(' ');

  // Drawn art when there is a file for this card, the generated gradient when
  // there is not — so every card renders whether or not its art exists yet.
  $: drawnArt = artUrlFor(card.id);

  /** A drawn UI element, as a CSS background value, or 'none' to keep the CSS shape. */
  const ui = (name: string) => {
    const url = uiArtUrl(name);
    return url ? `url("${url}")` : 'none';
  };
</script>

<div
  class={`card rare-${card.rarity}`}
  class:playable
  class:drawn
  class:gold
  style:--art={drawnArt ? `url("${drawnArt}") center / cover no-repeat` : artFor(card.name)}
  style:--rarity={RARITY_COLOR[card.rarity]}
  style:--ui-cost={ui('cost-crystal')}
  style:--ui-attack={ui('attack-gem')}
  style:--ui-health={ui('health-gem')}
  on:click
  on:keydown
  on:pointerdown
  role="button"
  tabindex="0"
>
  <div class="bevel" aria-hidden="true"></div>
  {#if gold}<div class="foil" aria-hidden="true"></div>{/if}

  <div class="cost">{card.cost}</div>

  <div class="art">
    {#if !drawnArt}<span class="sigil">{sigil(card.name)}</span>{/if}
  </div>

  <div class="plate">
    <span>{card.name}</span>
  </div>

  <div class="rules">
    <span class="desc" class:with-keywords={card.keywords.length > 0}>{card.description}</span>
    {#if card.keywords.length > 0}
      <span class="keywords">{keywordLine}</span>
    {/if}
  </div>

  <div class="foot"></div>

  {#if isMinion}
    <div class="attack"><span>{card.attack}</span></div>
    <div class="health">{card.health}</div>
  {:else if isWeapon}
    <!-- Same two corners as a minion, so the numbers read in the same places.
         Durability wears the steel gem rather than the blood one — it is not
         health, and a player must not read it as something that heals. -->
    <div class="attack"><span>{card.attack}</span></div>
    <div class="durability">{card.durability}</div>
    <div class="type weapon-line">Weapon</div>
  {:else}
    <div class="type">{card.type}</div>
  {/if}
</div>

<style>
  .card {
    position: relative;
    box-sizing: border-box;
    width: 134px;
    height: 168px;
    /* Keep the intrinsic size wherever the card is laid out. As a flex item it
       was being squashed to ~91px, which wrapped the text far more than the
       type scale assumes. */
    flex: none;
    display: flex;
    flex-direction: column;
    padding: 0 0 8px;
    border-radius: 13px;
    /*
     * The frame is the rarity marker. It replaced a small gem on the nameplate,
     * which read as decoration rather than information — at hand size it was
     * 11px of colour on a busy card, and the one thing rarity has going for it
     * is that it should be readable without looking for it.
     *
     * How much of the colour reaches the frame rises with rarity (see the
     * `.rare-*` rules below), so the scale reads as a scale rather than as four
     * arbitrary hues. This is the Common end of it: barely tinted, because a
     * Common should still look like a card rather than one outlined in bone.
     */
    border: 2px solid color-mix(in srgb, var(--rarity) 30%, #5a4429);
    background: linear-gradient(180deg, #5a422a 0%, #332415 12%, #241810 100%);
    box-shadow: 0 14px 26px rgba(0, 0, 0, .6), inset 0 1px 0 rgba(255, 232, 180, .28);
    opacity: .62;
    cursor: default;
    transition: transform .16s cubic-bezier(.2, 1, .3, 1), box-shadow .16s ease;
  }

  .card.playable {
    opacity: 1;
    cursor: pointer;
    /* The green halo and the orbit below carry "you can play this"; the border
       is spoken for by rarity now. */
    box-shadow: 0 0 0 1px rgba(205, 255, 215, .55), inset 0 0 16px rgba(126, 214, 140, .3),
      0 0 20px rgba(224, 190, 118, .35), 0 14px 26px rgba(0, 0, 0, .6),
      inset 0 1px 0 rgba(255, 232, 180, .28);
    /* A spell circling the card. The animation keeps one even halo lit at all
       times and orbits a brighter accent around it, so no edge ever goes dark. */
    animation: fs-spell 3.4s linear infinite;
  }

  /* A lift, not a zoom.
     This used to be scale(1.75), justified by the description type being
     unreadable at native size. That justification is gone twice over: the face
     now carries only short game text, and clicking a card opens it centred at
     2.5x with its definition beside it. A hover big enough to cover its
     neighbours' cost crystals and stat gems was buying nothing.
     Growing from the bottom edge still keeps the card's grip under the pointer
     and sends what expansion there is up into the board, not off-screen. */
  .card:hover {
    transform-origin: bottom center;
    transform: translateY(-10px) scale(1.12);
    box-shadow: 0 24px 40px rgba(0, 0, 0, .7), 0 0 20px rgba(240, 214, 138, .2);
    opacity: 1;
    z-index: 200;
  }

  .card.playable:hover {
    box-shadow: 0 24px 40px rgba(0, 0, 0, .7), 0 0 28px rgba(240, 214, 138, .4);
  }

  /* Hover is a pointer affordance. On a touch screen it sticks after a tap,
     leaving a card raised with nothing to dismiss it. */
  @media (hover: none) {
    .card:hover { transform: none; z-index: auto; }
  }

  .card.rare-Uncommon { border-color: color-mix(in srgb, var(--rarity) 62%, #5a4429); }
  .card.rare-Rare { border-color: color-mix(in srgb, var(--rarity) 80%, #5a4429); }

  /* The top two take the colour neat and add a ring of it outside the frame.
     Epic and Legendary are singular enough that they should carry across a
     board, not reward a close look. */
  .card.rare-Epic,
  .card.rare-Legendary {
    border-color: var(--rarity);
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--rarity) 55%, transparent),
      0 0 14px color-mix(in srgb, var(--rarity) 30%, transparent),
      0 14px 26px rgba(0, 0, 0, .6), inset 0 1px 0 rgba(255, 232, 180, .28);
  }

  .card.drawn { animation: fs-draw .5s cubic-bezier(.2, .9, .3, 1); }

  /* Gold variant. Deliberately a frame-and-sheen treatment rather than separate
     art: one gold frame and one shimmer serve all 155 cards. */
  .card.gold {
    border-color: #f5cf5e;
    box-shadow: 0 0 0 1px rgba(255, 226, 140, .7), 0 0 22px rgba(245, 207, 94, .45),
      0 14px 26px rgba(0, 0, 0, .6), inset 0 1px 0 rgba(255, 240, 200, .4);
  }

  .foil {
    position: absolute;
    inset: 0;
    z-index: 4;
    border-radius: 13px;
    overflow: hidden;
    pointer-events: none;
    /* A narrow highlight band sweeping across the face. Kept low-contrast so
       the rules panel stays readable underneath it. */
    background: linear-gradient(
      108deg,
      transparent 38%,
      rgba(255, 245, 205, .34) 47%,
      rgba(255, 255, 255, .5) 50%,
      rgba(255, 245, 205, .34) 53%,
      transparent 62%
    );
    background-size: 260% 100%;
    animation: fs-foil 3.6s ease-in-out infinite;
    mix-blend-mode: screen;
  }

  @keyframes fs-foil {
    0%, 100% { background-position: 130% 0; }
    50% { background-position: -30% 0; }
  }

  @media (prefers-reduced-motion: reduce) {
    .foil { animation: none; background-position: 50% 0; }
  }

  .bevel {
    position: absolute;
    inset: 5px;
    border-radius: 9px;
    border: 1px solid rgba(255, 232, 180, .14);
    pointer-events: none;
  }

  .cost {
    position: absolute;
    top: -7px;
    left: -7px;
    z-index: 3;
    width: 38px;
    height: 42px;
    display: flex;
    align-items: center;
    justify-content: center;
    clip-path: polygon(50% 0, 100% 26%, 100% 74%, 50% 100%, 0 74%, 0 26%);
    /* A drawn crystal replaces the gradient AND the clip below when one exists;
       with no file, --ui-cost is `none` and this is exactly the shape it was. */
    background: var(--ui-cost, none) center / contain no-repeat,
      linear-gradient(160deg, var(--mana-lit), #1f4d94 60%, #3f86d8);
    font-family: var(--display);
    font-weight: 700;
    font-size: 19px;
    color: #fff;
    text-shadow: 0 2px 4px rgba(0, 0, 0, .7);
  }

  /*
   * The art window is **4:3**, near enough — 104 x 78 inside a 134-wide card.
   *
   * It was 118 x 50, a 2.36:1 letterbox, which is a cinematic crop and a poor
   * one for a single subject: an illustration of one object or one figure has
   * to be cropped to a slot until nothing of it survives but a band. Squaring
   * it up costs 28px of width and buys 28px of height, and the wider side
   * margins read as a mount around a picture rather than as wasted frame.
   *
   * The rules panel gives up 3px for it (see `.rules`), which is inside the
   * slack the five-line clamp already had.
   */
  .art {
    margin: 8px 15px 0;
    height: 78px;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 7px;
    border: 1px solid rgba(255, 230, 180, .22);
    background: var(--art);
    box-shadow: inset 0 -14px 24px rgba(0, 0, 0, .4);
  }

  .sigil {
    font-family: var(--display);
    font-size: 34px;
    font-weight: 700;
    color: rgba(255, 246, 224, .3);
    text-shadow: 0 3px 10px rgba(0, 0, 0, .55);
  }

  /*
   * Docked to the top of the description box rather than sitting in flow
   * under the art: its bottom edge sits flush on the same line as the rules
   * panel's top (both anchor to the card's centre line), so the two read as
   * one joined header-and-body unit. Everything above it is art's to use.
   */
  .plate {
    position: absolute;
    z-index: 2;
    left: 9px;
    right: 9px;
    bottom: 48.5%;
    min-height: 13px;
    padding: 1px 0;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid #8a6c3c;
    border-radius: 3px;
    background: linear-gradient(180deg, #4a3620, #2a1d10);
    box-shadow: 0 3px 8px rgba(0, 0, 0, .5), inset 0 1px 0 rgba(255, 228, 170, .22);
  }

  .plate span {
    width: 100%;
    padding: 0 5px;
    font-family: var(--display);
    font-size: 8px;
    font-weight: 600;
    letter-spacing: .02em;
    line-height: 1.15;
    text-align: center;
    text-transform: uppercase;
    color: #f2e2bd;
    /* One line only — the tighter plate has no room for more, so a long
       title truncates instead of pushing the box taller. */
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /*
   * Fixed panel, not a flexible one. It is pinned from the card's centre line
   * down to just above the base, so its top edge is a hard stop: nothing above
   * the midpoint, nothing past the frame. Size and type are locked, so the only
   * thing that varies is how much of a long answer is shown.
   */
  .rules {
    position: absolute;
    top: 51.5%;
    left: 9px;
    right: 9px;
    bottom: 9px;
    padding: 6px 7px 9px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    border-radius: 4px;
    background: linear-gradient(180deg, var(--parchment), #cfbe98);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, .6), inset 0 -6px 12px rgba(120, 95, 55, .25);
    overflow: hidden;
  }

  .rules .desc {
    width: 100%;
    font-family: var(--body);
    font-size: 9px;
    line-height: 1.25;
    text-align: center;
    text-wrap: pretty;
    color: var(--parchment-ink);
    /* Five lines is what the locked panel holds with nothing else in it; the
       rest ellipsises. A keyword line below eats into that budget. */
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 5;
    line-clamp: 5;
    overflow: hidden;
  }

  .rules .desc.with-keywords {
    -webkit-line-clamp: 4;
    line-clamp: 4;
  }

  /* Taunt, Divine Shield and the like — the only thing an imported flashcard
     ever needs to state beyond its own answer, since imports never carry
     structured effects. Bold is the entire signal.
     7.5px, not 9px: the one template with two keywords reads "Divine Shield.
     Windfury." — measured at 115px against 98px available at 9px bold, wide
     enough to ellipsis away "Windfury" entirely. 7.5px fits it with room. */
  .rules .keywords {
    flex: 0 0 auto;
    width: 100%;
    font-family: var(--body);
    font-size: 7.5px;
    font-weight: 700;
    line-height: 1.15;
    text-align: center;
    color: var(--parchment-ink);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .foot { height: 26px; }

  /* Smaller shapes so they encroach less on the rules panel — the numerals
     stay at 17px and simply sit closer to the edges. */
  .attack,
  .health {
    position: absolute;
    bottom: -4px;
    width: 23px;
    height: 23px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--display);
    font-weight: 700;
    font-size: 17px;
    color: #fff6e6;
    text-shadow: 0 2px 3px rgba(0, 0, 0, .65);
  }

  .attack {
    left: -4px;
    transform: rotate(45deg);
    border-radius: 6px;
    border: 2px solid #f6dd93;
    background: var(--ui-attack, none) center / contain no-repeat,
      linear-gradient(135deg, var(--attack), #a9741a);
    box-shadow: 0 3px 8px rgba(0, 0, 0, .6), inset 0 1px 4px rgba(255, 232, 170, .6);
  }

  .attack span { transform: rotate(-45deg); }

  .durability {
    position: absolute;
    bottom: -4px;
    right: -4px;
    width: 23px;
    height: 23px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    border: 2px solid #cfd8e0;
    background: linear-gradient(150deg, #9fb0c0, #4a5c6c 70%);
    font-family: var(--display);
    font-weight: 700;
    font-size: 17px;
    color: #f2f7fb;
    text-shadow: 0 2px 3px rgba(0, 0, 0, .65);
  }

  .weapon-line { bottom: 26px; }

  .health {
    right: -4px;
    border-radius: 50% 50% 50% 50% / 42% 42% 58% 58%;
    border: 2px solid #f0a08c;
    background: var(--ui-health, none) center / contain no-repeat,
      radial-gradient(circle at 35% 28%, var(--blood), var(--blood-deep) 70%);
    box-shadow: 0 3px 8px rgba(0, 0, 0, .6), inset 0 2px 5px rgba(255, 190, 170, .5);
  }

  .type {
    position: absolute;
    bottom: 8px;
    left: 0;
    right: 0;
    text-align: center;
    font-family: var(--display);
    font-size: 8px;
    letter-spacing: .22em;
    text-transform: uppercase;
    color: var(--gold);
  }
</style>
