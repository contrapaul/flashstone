<script lang="ts">
  /** Shown for ~1.3s at the top of each turn. Parent clears `text` to hide it. */
  export let text: string | null = null;
</script>

{#if text}
  <div class="wrap">
    <div class="banner">{text}</div>
  </div>
{/if}

<style>
  .wrap {
    position: absolute;
    left: 0;
    right: 0;
    top: 38%;
    z-index: 60;
    display: flex;
    justify-content: center;
    pointer-events: none;
  }

  .banner {
    padding: 12px 54px;
    border-top: 1px solid rgba(224, 190, 118, .55);
    border-bottom: 1px solid rgba(224, 190, 118, .55);
    background: linear-gradient(90deg, transparent, rgba(30, 20, 10, .9) 18%, rgba(30, 20, 10, .9) 82%, transparent);
    font-family: var(--display);
    font-size: 22px;
    font-weight: 700;
    letter-spacing: .28em;
    text-transform: uppercase;
    color: var(--gold-bright);
    text-shadow: 0 0 30px rgba(240, 214, 138, .6);
    animation: fs-banner 1.3s ease-out forwards;
  }
</style>
