<script lang="ts">
  /**
   * The match log, as a floating overlay pinned under the nav.
   * Deliberately short: it must stay clear of the enemy board row, which
   * starts around y=220 on a 900px-tall viewport.
   */
  export let lines: string[] = [];
  export let open = true;

  const MAX_LINES = 4;

  $: shown = lines.slice(-MAX_LINES).map((line) => ({
    text: line.replace(/—/g, '').trim(),
    system: line.startsWith('—')
  }));
</script>

<aside class="chronicle">
  <button class="head" on:click={() => (open = !open)}>
    <span>Chronicle</span>
    <span>{open ? '—' : '+'}</span>
  </button>

  {#if open}
    <div class="scroll">
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

  .scroll {
    max-height: 84px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 3px;
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
</style>
