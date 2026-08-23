<script lang="ts">
  import SettingsControls from './SettingsControls.svelte';

  /**
   * The nav's settings popover. The settings themselves live in
   * `SettingsControls`, because the in-game menu shows the same ones.
   */
  let open = false;
  let root: HTMLElement | undefined;

  function onWindowPointerDown(event: PointerEvent) {
    if (!open || !root) return;
    if (!root.contains(event.target as Node)) open = false;
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') open = false;
  }
</script>

<svelte:window on:pointerdown={onWindowPointerDown} on:keydown={onKeydown} />

<div class="settings" bind:this={root}>
  <button class="trigger" class:open on:click={() => (open = !open)} aria-expanded={open}>
    Settings
  </button>

  {#if open}
    <div class="panel">
      <SettingsControls />
    </div>
  {/if}
</div>

<style>
  .settings { position: relative; }

  .trigger {
    padding: 6px 13px;
    border: 1px solid transparent;
    border-radius: 4px;
    background: none;
    cursor: pointer;
    font-family: var(--display);
    font-size: 10.5px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--text-dim);
  }
  .trigger:hover { color: var(--text); }
  .trigger.open {
    border-color: #8a6c3c;
    background: linear-gradient(180deg, #4a3620, #2a1d10);
    color: var(--gold-bright);
  }

  .panel {
    position: absolute;
    right: 0;
    top: calc(100% + 8px);
    z-index: 50;
    width: 290px;
    padding: 14px;
    border: 1px solid var(--frame);
    border-radius: 6px;
    background: linear-gradient(180deg, rgba(38, 27, 16, 0.98), rgba(22, 15, 9, 0.98));
    box-shadow: 0 18px 40px rgba(0, 0, 0, 0.6);
  }

</style>
