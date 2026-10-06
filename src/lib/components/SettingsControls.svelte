<script lang="ts">
  import { onMount } from 'svelte';
  import { settings } from '../settings';

  /**
   * The settings themselves, with no chrome around them.
   *
   * Two places show these: the nav's popover, and the in-game menu — which the
   * nav is hidden behind during a match. Extracted so a setting added here
   * appears in both rather than in whichever one was remembered.
   */

  // SSR renders the defaults; storage is only readable once mounted.
  onMount(() => settings.hydrate());

  const MOTIONS = [
    { value: 'full', label: 'Full' },
    { value: 'fast', label: 'Fast' },
    { value: 'reduced', label: 'Reduced' }
  ] as const;

  const PACES = [
    { value: 'measured', label: 'Measured' },
    { value: 'fast', label: 'Quick' }
  ] as const;
</script>

<label class="row">
  <input
    type="checkbox"
    checked={$settings.definitionsInGame}
    on:change={() => settings.toggle('definitionsInGame')}
  />
  <span>
    <span class="label">Show definitions in game</span>
    <span class="note">
      Shows a term's meaning beside a card when you click it during a match. The
      collection and review always show definitions.
    </span>
  </span>
</label>

<div class="row choice">
  <span>
    <span class="label">Animation</span>
    <span class="note">Fast plays everything quicker. Reduced stops anything moving across the table — it fades instead.</span>
  </span>
  <span class="segments" role="radiogroup" aria-label="Animation">
    {#each MOTIONS as option}
      <button
        role="radio"
        aria-checked={$settings.motion === option.value}
        class:on={$settings.motion === option.value}
        on:click={() => settings.choose('motion', option.value)}
      >{option.label}</button>
    {/each}
  </span>
</div>

<div class="row choice">
  <span>
    <span class="label">Opponent's turn</span>
    <span class="note">Measured slows their turn a little, so you can see what they played and what it hit.</span>
  </span>
  <span class="segments" role="radiogroup" aria-label="Opponent's turn">
    {#each PACES as option}
      <button
        role="radio"
        aria-checked={$settings.opponentPace === option.value}
        class:on={$settings.opponentPace === option.value}
        on:click={() => settings.choose('opponentPace', option.value)}
      >{option.label}</button>
    {/each}
  </span>
</div>

<style>
  .row {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    cursor: pointer;
  }

  .row input {
    flex: 0 0 auto;
    width: 15px;
    height: 15px;
    margin-top: 2px;
    accent-color: var(--gold);
  }

  .label {
    display: block;
    font-family: var(--body);
    font-size: 14px;
    color: var(--text);
  }

  .note {
    display: block;
    margin-top: 4px;
    font-family: var(--body);
    font-size: 11.5px;
    line-height: 1.4;
    color: var(--text-faint);
    text-wrap: pretty;
  }

  .row.choice {
    flex-direction: column;
    gap: 8px;
    margin-top: 16px;
    cursor: default;
  }

  .segments {
    display: inline-flex;
    border: 1px solid var(--rule);
    border-radius: 5px;
    overflow: hidden;
  }

  .segments button {
    padding: 5px 12px;
    border: none;
    border-right: 1px solid var(--rule);
    background: var(--ink-2);
    color: var(--text-dim);
    font-family: var(--display);
    font-size: 10px;
    letter-spacing: .12em;
    text-transform: uppercase;
    cursor: pointer;
  }

  .segments button:last-child { border-right: none; }
  .segments button:hover { color: var(--gold-bright); }
  .segments button.on { background: linear-gradient(180deg, #b98a34, #7a5620); color: #1a1207; }
</style>
