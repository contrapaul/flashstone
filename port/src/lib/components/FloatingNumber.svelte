<script lang="ts">
  /** Damage numeral / "Shield" popup. Positioned by the parent in % of the board. */
  export let text: string;
  export let color = '#ff8a6a';
  export let x = 50;
  export let y = 46;
</script>

<div class="float" style:left={`${x}%`} style:top={`${y}%`} style:color>{text}</div>

<style>
  .float {
    position: absolute;
    z-index: 55;
    font-family: var(--display);
    font-size: 30px;
    font-weight: 700;
    text-shadow: 0 3px 8px rgba(0, 0, 0, .8);
    animation: fs-float .9s ease-out forwards;
    pointer-events: none;
  }
</style>
