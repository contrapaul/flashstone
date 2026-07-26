<script lang="ts">
  /** Damage numeral / "Shield" popup, placed over whatever was hit. */
  export let text: string;
  export let color = '#ff8a6a';
  /** Viewport coordinates of the thing that took the hit. */
  export let x = 0;
  export let y = 0;
</script>

<div class="float" style:left={`${x}px`} style:top={`${y}px`} style:color>{text}</div>

<style>
  .float {
    position: fixed;
    z-index: 360;
    /* Anchored on the target's centre, so the numeral rises out of it. */
    transform: translate(-50%, -50%);
    font-family: var(--display);
    font-size: 30px;
    font-weight: 700;
    text-shadow: 0 3px 8px rgba(0, 0, 0, .8), 0 0 14px rgba(0, 0, 0, .6);
    animation: fs-float .9s ease-out forwards;
    pointer-events: none;
  }
</style>
