<script lang="ts">
  /** Hue of the inner field. 266 grimoire · 200 astral · 18 legendary foil. */
  export let hue = 266;
  export let mark = 'F';
  /** Shrinks the whole back — used for the deck pile and the opponent's fan. */
  export let scale = 1;
</script>

<div class="back" style:--hue={hue} style:transform={`scale(${scale})`}>
  <span class="field" aria-hidden="true"></span>
  <span class="mark">{mark}</span>
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
