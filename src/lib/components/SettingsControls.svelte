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
</style>
