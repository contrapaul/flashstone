<script lang="ts">
  import { afterUpdate } from 'svelte';

  /**
   * The match log.
   *
   * Two shapes, because the space available is not the same on every screen:
   *
   *  - **Rail** — on a wide desktop the board's content column tops out around
   *    1260px, so everything past that is dead margin. The log fills it: full
   *    height, the whole match, scrolled to the newest line. It is positioned
   *    in the margin rather than in flow, so it never narrows the board.
   *  - **Overlay** — the compact box it has always been, on anything narrower,
   *    where taking width from the board would cost more than the log is worth.
   */
  export let lines: string[] = [];
  export let open = true;
  /** Full-height rail rather than the compact overlay. Set by the play route. */
  export let rail = false;

  const MAX_OVERLAY_LINES = 4;

  $: shown = (rail ? lines : lines.slice(-MAX_OVERLAY_LINES)).map((line) => ({
    text: line.replace(/—/g, '').trim(),
    system: line.startsWith('—')
  }));

  let scroller: HTMLElement | undefined;

  // Newest line stays in view without stealing focus or the page's scroll.
  afterUpdate(() => {
    if (rail && open && scroller) scroller.scrollTop = scroller.scrollHeight;
  });
</script>

<aside class="chronicle" class:rail>
  <button class="head" on:click={() => (open = !open)}>
    <span>Chronicle</span>
    <span>{open ? '—' : '+'}</span>
  </button>

  {#if open}
    <div class="scroll" bind:this={scroller}>
      {#each shown as line}
        <span class="line" class:system={line.system}>{line.text}</span>
      {/each}
    </div>
  {/if}
</aside>

<style>
  .chronicle {
    position: absolute;
    left: 18px;
    top: 12px;
    z-index: 35;
    width: 230px;
    padding: 11px 13px;
    border-radius: 6px;
    border: 1px solid var(--rule);
    background: rgba(19, 13, 8, .82);
    backdrop-filter: blur(6px);
    box-shadow: 0 14px 30px rgba(0, 0, 0, .55);
  }

  /* Fills the left margin top to bottom. `bottom` rather than a height, so it
     tracks the viewport without needing to be measured. */
  .chronicle.rail {
    top: 14px;
    bottom: 14px;
    width: 250px;
    display: flex;
    flex-direction: column;
  }

  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 0 0 6px;
    border: none;
    background: none;
    cursor: pointer;
    font-family: var(--display);
    font-size: 9.5px;
    letter-spacing: .22em;
    text-transform: uppercase;
    color: #a58d5f;
  }

  .chronicle.rail .head {
    margin-bottom: 4px;
    border-bottom: 1px solid var(--rule);
    padding-bottom: 8px;
  }

  .scroll {
    max-height: 84px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .chronicle.rail .scroll {
    flex: 1;
    max-height: none;
    gap: 5px;
    padding-right: 4px;
    /* A long match is hundreds of lines; the rail is the only place they fit. */
    scrollbar-width: thin;
  }

  .line {
    font-family: var(--body);
    font-size: 12px;
    line-height: 1.35;
    color: #c3b391;
  }

  .line.system {
    font-family: var(--display);
    font-size: 10px;
    letter-spacing: .12em;
    text-transform: uppercase;
    color: var(--gold);
  }

  .chronicle.rail .line.system {
    margin-top: 6px;
    padding-top: 6px;
    border-top: 1px solid rgba(122, 92, 48, .35);
  }
</style>
