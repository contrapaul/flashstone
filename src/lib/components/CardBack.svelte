<script lang="ts">
  import { backUrlFor } from '../../utils/art';
  import { cardBackById } from '../shop';

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
    <span class="mark">{shownMark}</span>
  {/if}
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
</style>
