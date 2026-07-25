<script lang="ts">
  import { MAX_MANA } from '../engine/state';

  export let mana: number;
  export let maxMana: number;

  $: pips = Array.from({ length: MAX_MANA }, (_, i) => i < mana);
</script>

<div class="tray">
  <div class="pips">
    {#each pips as filled}
      <span class="pip" class:filled></span>
    {/each}
  </div>
  <span class="count">{mana}/{maxMana}</span>
</div>

<style>
  .tray {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .pips {
    display: flex;
    align-items: flex-end;
    gap: 3px;
  }

  .pip {
    width: 12px;
    height: 17px;
    clip-path: polygon(50% 0, 100% 30%, 100% 72%, 50% 100%, 0 72%, 0 30%);
    background: linear-gradient(160deg, #2a2620, #15120d);
    border: 1px solid #33291c;
  }

  .pip.filled {
    border: none;
    background: linear-gradient(160deg, var(--mana-lit), #2a63b8);
    box-shadow: 0 0 8px rgba(120, 190, 255, .6);
  }

  .count {
    font-family: var(--display);
    font-size: 13px;
    letter-spacing: .06em;
    color: #8fc4ff;
  }
</style>
