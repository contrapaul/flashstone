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

  /** The three levels, each 0–100 on its slider. */
  const LEVELS = [
    { key: 'master', label: 'Volume' },
    { key: 'music', label: 'Music' },
    { key: 'sfx', label: 'Sounds' }
  ] as const;

  function setLevel(key: (typeof LEVELS)[number]['key'], event: Event) {
    const value = Number((event.currentTarget as HTMLInputElement).value) / 100;
    settings.choose('volume', { ...$settings.volume, [key]: value });
  }

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

<div class="row choice">
  <span>
    <span class="label">Sound</span>
    <span class="note">Music and sounds start on your first click. A sound with no file yet is simply silent.</span>
  </span>
  <span class="levels">
    {#each LEVELS as level}
      <label class="level">
        <span>{level.label}</span>
        <input
          type="range"
          min="0"
          max="100"
          step="5"
          value={Math.round($settings.volume[level.key] * 100)}
          on:input={(e) => setLevel(level.key, e)}
        />
        <b>{Math.round($settings.volume[level.key] * 100)}</b>
      </label>
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

  .levels { display: flex; flex-direction: column; gap: 6px; }

  .level {
    display: grid;
    grid-template-columns: 62px 1fr 28px;
    align-items: center;
    gap: 10px;
    font-family: var(--display);
    font-size: 10px;
    letter-spacing: .12em;
    text-transform: uppercase;
    color: var(--text-dim);
  }

  .level input { width: 100%; accent-color: var(--gold); }
  .level b { font-weight: 600; color: var(--text); text-align: right; font-variant-numeric: tabular-nums; }
  .segments button:hover { color: var(--gold-bright); }
  .segments button.on { background: linear-gradient(180deg, #b98a34, #7a5620); color: #1a1207; }
</style>
