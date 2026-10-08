<script lang="ts">
  import { backUrlFor } from '../../utils/art';
  import { DEFAULT_BACK, cardBackById } from '../shop';
  import { settings } from '../settings';

  /**
   * Hue and mark of the generated field. Left unset, they come from the back's
   * own entry in the catalogue — passing them explicitly is only for one-off
   * decorative uses such as the deck pile.
   */
  export let hue: number | null = null;
  export let mark: string | null = null;
  /** Shrinks the whole back — used for the deck pile. */
  export let scale = 1;
  /**
   * Which back to wear. Drawn art is used when `static/art/backs/<id>.webp`
   * exists, and the generated field below when it does not — the same fallback
   * discipline as card art, so a back is never blank.
   *
   * Phase 4 stores the player's choice on their profile and passes it here; the
   * opponent gets the default until multiplayer supplies theirs.
   */
  export let backId = 'default';

  $: def = cardBackById(backId);
  $: art = backUrlFor(backId);
  $: shownHue = hue ?? def.hue;
  $: shownMark = mark ?? def.mark;
  /**
   * Every back but the free one moves (REVISIONS R10.5): a slow sheen sweeps
   * across it, which is what sells it in the shop. Ascendant, which can only be
   * earned, also turns its rays and breathes — the most alive of them.
   */
  $: alive = def.id !== DEFAULT_BACK && $settings.motion !== 'reduced';
</script>

<div
  class="back"
  class:drawn={art}
  style:--hue={shownHue}
  style:--back-art={art ? `url("${art}")` : 'none'}
  style:transform={`scale(${scale})`}
>
  {#if !art}
    <span class="field" aria-hidden="true"></span>
    {#if alive && def.id === 'ascendant'}<span class="rays" aria-hidden="true"></span>{/if}
    <span class="mark" class:breathing={alive && def.id === 'ascendant'}>{shownMark}</span>
  {/if}
  {#if alive}<span class="sheen" aria-hidden="true"></span>{/if}
</div>

<style>
  .back {
    position: relative;
    width: 134px;
    height: 168px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 13px;
    border: 2px solid #7a5c30;
    background: linear-gradient(180deg, #5a422a, #332415 14%, #241810);
    box-shadow: 0 14px 26px rgba(0, 0, 0, .6), inset 0 1px 0 rgba(255, 232, 180, .28);
    transform-origin: top left;
  }

  .back.drawn {
    background: var(--back-art) center / cover no-repeat;
  }

  .field {
    position: absolute;
    inset: 10px;
    border-radius: 8px;
    border: 1px solid rgba(224, 190, 118, .55);
    background: radial-gradient(70% 55% at 50% 42%, hsl(var(--hue) 60% 34%), hsl(var(--hue) 55% 14%) 70%);
    box-shadow: inset 0 0 26px rgba(0, 0, 0, .6);
  }

  .mark {
    position: relative;
    font-family: var(--display);
    font-size: 46px;
    font-weight: 700;
    color: rgba(240, 214, 138, .85);
    text-shadow: 0 0 22px rgba(240, 214, 138, .5);
  }

  /* A band of light crossing the back every few seconds, in the back's own hue. */
  .sheen {
    position: absolute;
    inset: 0;
    border-radius: 11px;
    overflow: hidden;
    pointer-events: none;
  }
  .sheen::before {
    content: '';
    position: absolute;
    top: -20%;
    bottom: -20%;
    left: 0;
    width: 55%;
    background: linear-gradient(100deg, transparent, hsla(var(--hue), 90%, 82%, .32) 45%, rgba(255, 250, 230, .45) 50%, hsla(var(--hue), 90%, 82%, .32) 55%, transparent);
    mix-blend-mode: screen;
    transform: translateX(-120%) skewX(-12deg);
    animation: fs-back-sheen 5.5s ease-in-out infinite;
  }

  @keyframes fs-back-sheen {
    0%, 55% { transform: translateX(-120%) skewX(-12deg); }
    100% { transform: translateX(260%) skewX(-12deg); }
  }

  /* Ascendant only: slow golden rays turning behind its star. */
  .rays {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 150px;
    height: 150px;
    margin: -75px 0 0 -75px;
    border-radius: 50%;
    background: repeating-conic-gradient(from 0deg, rgba(255, 214, 120, .26) 0deg 9deg, transparent 9deg 30deg);
    -webkit-mask: radial-gradient(circle, #000 18%, transparent 68%);
    mask: radial-gradient(circle, #000 18%, transparent 68%);
    animation: fs-back-rays 18s linear infinite;
  }

  @keyframes fs-back-rays {
    to { transform: rotate(360deg); }
  }

  .mark.breathing { animation: fs-back-breathe 3.2s ease-in-out infinite; }

  @keyframes fs-back-breathe {
    0%, 100% { text-shadow: 0 0 18px rgba(240, 214, 138, .45); }
    50% { text-shadow: 0 0 34px rgba(255, 220, 130, 1), 0 0 8px rgba(255, 250, 220, .9); }
  }
</style>
