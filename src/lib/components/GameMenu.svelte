<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import SettingsControls from './SettingsControls.svelte';

  /**
   * The menu a match is paused into.
   *
   * A match hides the nav, so this is the only way out of one and the only way
   * to the settings while playing. It is opened by Escape or by the Flashstone
   * mark in the corner — the mark is what is left of the header, and pressing
   * it should do what pressing the header always did: get you out.
   *
   * Nothing here is destructive except Quit, which is why Quit is the one
   * option that asks again before it acts.
   */

  export let open = false;

  const dispatch = createEventDispatcher<{ close: void; quit: void }>();

  let showSettings = false;
  let confirmingQuit = false;

  // Reopening should always land on the same first screen, never on whatever
  // was expanded last time.
  $: if (!open) {
    showSettings = false;
    confirmingQuit = false;
  }

  function onScrimClick(event: MouseEvent) {
    if (event.target === event.currentTarget) dispatch('close');
  }

  /** Escape is handled by the table, which owns the menu's open state. */
  function onScrimKey(event: KeyboardEvent) {
    if (event.key === 'Enter' || event.key === ' ') dispatch('close');
  }
</script>

{#if open}
  <!-- The backdrop dismisses; the panel is a plain container with no handler. -->
  <div
    class="scrim"
    role="button"
    tabindex="-1"
    aria-label="Close menu"
    on:click={onScrimClick}
    on:keydown={onScrimKey}
  >
    <div class="panel" role="dialog" aria-modal="true" aria-label="Game menu">
      <h2>Flashstone</h2>

      <div class="options">
        <button class="option" on:click={() => (showSettings = !showSettings)}>
          Settings
        </button>

        {#if showSettings}
          <div class="settings-body">
            <SettingsControls />
          </div>
        {/if}

        {#if confirmingQuit}
          <div class="confirm">
            <p>Leave this match? It will not be saved.</p>
            <div class="confirm-actions">
              <button class="danger" on:click={() => dispatch('quit')}>Quit</button>
              <button class="ghost" on:click={() => (confirmingQuit = false)}>Keep playing</button>
            </div>
          </div>
        {:else}
          <button class="option" on:click={() => (confirmingQuit = true)}>
            Quit and return to main menu
          </button>
        {/if}

        <button class="option primary" on:click={() => dispatch('close')}>Back to game</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 320;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    border: none;
    background: rgba(8, 5, 3, 0.72);
    backdrop-filter: blur(3px);
    cursor: default;
    animation: fs-scrim 0.14s ease-out;
  }

  @keyframes fs-scrim {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .panel {
    width: min(360px, 100%);
    padding: 26px 26px 22px;
    border: 1px solid var(--frame);
    border-radius: 10px;
    background: linear-gradient(180deg, rgba(38, 27, 16, 0.98), rgba(20, 14, 8, 0.98));
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.7);
    animation: fs-menu 0.18s cubic-bezier(0.2, 1, 0.3, 1);
  }

  @keyframes fs-menu {
    from { transform: translateY(10px) scale(0.97); opacity: 0; }
    to { transform: none; opacity: 1; }
  }

  h2 {
    margin: 0 0 18px;
    font-family: var(--display);
    font-size: 15px;
    font-weight: 700;
    letter-spacing: 0.24em;
    text-transform: uppercase;
    text-align: center;
    color: var(--gold);
    text-shadow: 0 0 18px rgba(232, 197, 106, 0.3);
  }

  .options {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .option {
    width: 100%;
    padding: 12px 16px;
    border: 1px solid var(--rule);
    border-radius: 5px;
    background: linear-gradient(180deg, #2a2118, #1a1410);
    color: var(--text-dim);
    cursor: pointer;
    font-family: var(--display);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    transition: border-color 0.16s ease, color 0.16s ease;
  }
  .option:hover { border-color: var(--frame-lit); color: var(--text); }

  .option.primary {
    margin-top: 4px;
    border-color: #e3bf72;
    background: linear-gradient(180deg, #b98a34, #7a5620);
    color: #1a1207;
    box-shadow: inset 0 1px 0 rgba(255, 240, 200, 0.5);
  }
  .option.primary:hover { color: #1a1207; border-color: #f0d68a; }

  .settings-body {
    padding: 14px;
    border: 1px solid var(--rule);
    border-radius: 5px;
    background: rgba(12, 8, 5, 0.6);
  }

  .confirm {
    padding: 14px;
    border: 1px solid #8d5a4a;
    border-radius: 5px;
    background: rgba(48, 20, 14, 0.5);
  }

  .confirm p {
    margin: 0 0 12px;
    font-family: var(--body);
    font-size: 14px;
    color: var(--text);
  }

  .confirm-actions { display: flex; gap: 8px; }

  .confirm-actions button {
    flex: 1;
    padding: 9px 12px;
    border-radius: 5px;
    cursor: pointer;
    font-family: var(--display);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }

  .danger {
    border: 1px solid #c4614c;
    background: linear-gradient(180deg, #8d3527, #5e2018);
    color: #ffe6df;
  }

  .ghost {
    border: 1px solid var(--rule);
    background: none;
    color: var(--text-dim);
  }
  .ghost:hover { border-color: var(--frame-lit); color: var(--text); }
</style>
