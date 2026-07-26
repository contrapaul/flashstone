<script lang="ts">
  import type { Card } from '../../types/cards';
  import { RARITY_COLOR, artFor, sigil } from '../../utils/art';

  export let card: Card;
  /** Dimmed and non-interactive when false. */
  export let playable = true;
  /** Set true for the card that just arrived in hand to play the draw arc. */
  export let drawn = false;

  $: isMinion = card.type === 'Minion';

  // Flashcard answers vary from two words to a paragraph, so the type steps
  // down as the text grows rather than overflowing the frame.
  $: descStep = card.description.length > 132 ? 'xs' : card.description.length > 76 ? 'sm' : 'md';
  $: titleStep = card.name.length > 42 ? 'xs' : card.name.length > 28 ? 'sm' : 'md';
</script>

<div
  class="card"
  class:playable
  class:drawn
  class:desc-sm={descStep === 'sm'}
  class:desc-xs={descStep === 'xs'}
  style:--art={artFor(card.name)}
  style:--rarity={RARITY_COLOR[card.rarity]}
  on:click
  on:keydown
  on:pointerdown
  role="button"
  tabindex="0"
>
  <div class="bevel" aria-hidden="true"></div>

  <div class="cost">{card.cost}</div>

  <div class="art"><span class="sigil">{sigil(card.name)}</span></div>

  <div class="plate"><span class={titleStep}>{card.name}</span></div>

  <div class="rules">
    <span class={descStep}>{card.description}</span>
    <div class="gem" aria-hidden="true"></div>
  </div>

  <div class="foot"></div>

  {#if isMinion}
    <div class="attack"><span>{card.attack}</span></div>
    <div class="health">{card.health}</div>
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
    border: 2px solid #5a4429;
    background: linear-gradient(180deg, #5a422a 0%, #332415 12%, #241810 100%);
    box-shadow: 0 14px 26px rgba(0, 0, 0, .6), inset 0 1px 0 rgba(255, 232, 180, .28);
    opacity: .62;
    cursor: default;
    transition: transform .16s cubic-bezier(.2, 1, .3, 1), box-shadow .16s ease;
  }

  .card.playable {
    opacity: 1;
    cursor: pointer;
    border-color: var(--frame-lit);
    box-shadow: 0 0 20px rgba(224, 190, 118, .35), 0 14px 26px rgba(0, 0, 0, .6),
      inset 0 1px 0 rgba(255, 232, 180, .28);
    /* A spell circling the card. The animation keeps one even halo lit at all
       times and orbits a brighter accent around it, so no edge ever goes dark. */
    animation: fs-spell 3.4s linear infinite;
  }

  /* Every card lifts on hover — unplayable ones too, so you can always read
     a card's text without having the mana to cast it. */
  .card:hover {
    transform: translateY(-22px) scale(1.1);
    box-shadow: 0 30px 50px rgba(0, 0, 0, .75), 0 0 26px rgba(240, 214, 138, .22);
    opacity: 1;
    z-index: 200;
  }

  .card.playable:hover {
    box-shadow: 0 30px 50px rgba(0, 0, 0, .75), 0 0 34px rgba(240, 214, 138, .4);
  }

  .card.drawn { animation: fs-draw .42s cubic-bezier(.2, .9, .3, 1); }

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
    background: linear-gradient(160deg, var(--mana-lit), #1f4d94 60%, #3f86d8);
    font-family: var(--display);
    font-weight: 700;
    font-size: 19px;
    color: #fff;
    text-shadow: 0 2px 4px rgba(0, 0, 0, .7);
  }

  /* The art yields to the words. On a flashcard the answer is the point, so a
     long one takes the space rather than being cut off. */
  .card.desc-sm .art { height: 40px; }
  .card.desc-sm .sigil { font-size: 30px; }
  .card.desc-xs .art { height: 22px; }
  .card.desc-xs .sigil { font-size: 17px; }

  .art {
    margin: 8px 8px 0;
    height: 58px;
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
    font-size: 44px;
    font-weight: 700;
    color: rgba(255, 246, 224, .3);
    text-shadow: 0 3px 10px rgba(0, 0, 0, .55);
  }

  .plate {
    position: relative;
    z-index: 2;
    margin: -13px 8px 0;
    min-height: 26px;
    padding: 2px 0;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid #8a6c3c;
    border-radius: 3px;
    background: linear-gradient(180deg, #4a3620, #2a1d10);
    box-shadow: 0 3px 8px rgba(0, 0, 0, .5), inset 0 1px 0 rgba(255, 228, 170, .22);
  }

  .plate span {
    padding: 0 6px;
    font-family: var(--display);
    font-weight: 600;
    letter-spacing: .04em;
    line-height: 1.15;
    text-align: center;
    text-transform: uppercase;
    text-wrap: pretty;
    color: #f2e2bd;
    /* Never taller than four lines, and never spilling past the plate. */
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 4;
    line-clamp: 4;
    overflow: hidden;
  }

  .plate span.md { font-size: 9px; }
  .plate span.sm { font-size: 8px; letter-spacing: .02em; }
  .plate span.xs { font-size: 7px; letter-spacing: 0; }

  .rules {
    position: relative;
    flex: 1;
    min-height: 0;
    margin: 6px 9px 0;
    /* Extra bottom padding keeps the text clear of the stat gems, which sit
       over the lower corners of this panel. */
    padding: 6px 7px 11px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    background: linear-gradient(180deg, var(--parchment), #cfbe98);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, .6), inset 0 -6px 12px rgba(120, 95, 55, .25);
    overflow: hidden;
  }

  .rules span {
    width: 100%;
    font-family: var(--body);
    text-align: center;
    text-wrap: pretty;
    color: var(--parchment-ink);
    /* Clamped so a long answer can never escape the card frame. */
    display: -webkit-box;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .rules span.md { font-size: 10px; line-height: 1.26; -webkit-line-clamp: 4; line-clamp: 4; }
  .rules span.sm { font-size: 9px; line-height: 1.22; -webkit-line-clamp: 5; line-clamp: 5; }
  .rules span.xs { font-size: 8px; line-height: 1.18; -webkit-line-clamp: 9; line-clamp: 9; }

  .gem {
    position: absolute;
    top: -6px;
    left: 50%;
    width: 11px;
    height: 11px;
    margin-left: -5.5px;
    transform: rotate(45deg);
    border-radius: 2px;
    border: 1px solid rgba(255, 240, 210, .7);
    background: linear-gradient(135deg, var(--rarity), rgba(0, 0, 0, .45));
    box-shadow: 0 0 8px color-mix(in srgb, var(--rarity) 60%, transparent);
  }

  .foot { height: 26px; }

  /* Smaller shapes so they encroach less on the rules panel — the numerals
     stay at 17px and simply sit closer to the edges. */
  .attack,
  .health {
    position: absolute;
    bottom: -5px;
    width: 27px;
    height: 27px;
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
    left: -5px;
    transform: rotate(45deg);
    border-radius: 6px;
    border: 2px solid #f6dd93;
    background: linear-gradient(135deg, var(--attack), #a9741a);
    box-shadow: 0 3px 8px rgba(0, 0, 0, .6), inset 0 1px 4px rgba(255, 232, 170, .6);
  }

  .attack span { transform: rotate(-45deg); }

  .health {
    right: -5px;
    border-radius: 50% 50% 50% 50% / 42% 42% 58% 58%;
    border: 2px solid #f0a08c;
    background: radial-gradient(circle at 35% 28%, var(--blood), var(--blood-deep) 70%);
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
