<script lang="ts">
  import { uiArtUrl } from '../../utils/art';

  /**
   * Something on the workbench to fiddle with while the other player thinks —
   * Hearthstone's board toys, from a D&T workshop:
   *   lamp     — click to switch it on and off; it throws warm light
   *   printer  — prints a tiny part, which pops off the bed
   *   vise     — the handle cranks round and the jaws close and open
   *   pencils  — the pot rattles
   * They do nothing for the rules. Each is drawn here until `ui/doodad-<kind>`
   * exists. The clicks are their own: they never start a drag or a play.
   */
  export let kind: 'lamp' | 'printer' | 'vise' | 'pencils';

  $: drawn = uiArtUrl(`doodad-${kind}`);

  let on = false;
  let busy = false;
  let prints = 0;

  function poke() {
    if (kind === 'lamp') {
      on = !on;
      return;
    }
    if (busy) return;
    busy = true;
    if (kind === 'printer') prints++;
    setTimeout(() => (busy = false), kind === 'printer' ? 1900 : 900);
  }
</script>

<button
  class="doodad {kind}"
  class:on
  class:busy
  on:click|stopPropagation={poke}
  aria-label={kind === 'lamp' ? (on ? 'Switch the lamp off' : 'Switch the lamp on') : `Poke the ${kind}`}
>
  {#if kind === 'lamp' && on}<span class="glow" aria-hidden="true"></span>{/if}
  {#if drawn}
    <img class="drawn" src={drawn} alt="" />
  {:else if kind === 'lamp'}
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <ellipse class="base" cx="20" cy="58" rx="14" ry="4" />
      <path class="arm" d="M20 56 L26 32 L44 20" />
      <circle class="joint" cx="26" cy="32" r="2.5" />
      <path class="shade" d="M38 12 L54 20 L48 30 L36 22 Z" />
      <circle class="bulb" cx="48" cy="28" r="3.5" />
    </svg>
  {:else if kind === 'printer'}
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <rect class="frame" x="8" y="10" width="48" height="46" rx="3" />
      <path class="rail" d="M12 18 H52" />
      <g class="head"><rect x="26" y="15" width="12" height="7" rx="1" /><path d="M32 22 V26" /></g>
      <rect class="bed" x="14" y="46" width="36" height="4" rx="1" />
    </svg>
    {#key prints}
      {#if prints > 0}<span class="part" aria-hidden="true"></span>{/if}
    {/key}
  {:else if kind === 'vise'}
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <rect class="body" x="10" y="36" width="44" height="14" rx="2" />
      <rect class="jaw fixed" x="12" y="22" width="10" height="16" rx="1" />
      <rect class="jaw moving" x="36" y="22" width="10" height="16" rx="1" />
      <path class="screw" d="M46 30 H58" />
      <g class="handle"><path d="M58 22 V38" /><circle cx="58" cy="22" r="2.5" /><circle cx="58" cy="38" r="2.5" /></g>
      <rect class="foot" x="16" y="50" width="32" height="6" rx="1" />
    </svg>
  {:else}
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <g class="pencil p1"><path d="M22 34 L18 6" /><path class="tip" d="M18 6 L17 2 L20 5" /></g>
      <g class="pencil p2"><path d="M32 34 V4" /><path class="tip" d="M32 4 L31 0 L33 0 Z" /></g>
      <g class="pencil p3"><path d="M42 34 L48 8" /><path class="tip" d="M48 8 L50 3 L47 6" /></g>
      <path class="pot" d="M14 30 H50 L46 60 H18 Z" />
    </svg>
  {/if}
</button>

<style>
  .doodad {
    position: relative;
    width: 64px;
    height: 64px;
    padding: 0;
    border: none;
    background: none;
    cursor: pointer;
    filter: drop-shadow(0 6px 6px rgba(40, 24, 8, .45));
    transition: transform .15s ease;
  }

  .doodad:hover { transform: translateY(-2px) scale(1.06); }

  svg, .drawn { width: 100%; height: 100%; overflow: visible; }
  .drawn { object-fit: contain; }
  svg * { stroke: #3a2a15; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }

  /* Lamp */
  .base, .shade { fill: #6a7a86; }
  .arm { fill: none; stroke-width: 3; }
  .joint { fill: #c9a46a; }
  .bulb { fill: #8a8070; }
  .lamp.on .bulb { fill: #fff3b0; filter: drop-shadow(0 0 6px #ffd36a); }

  /* A warm pool of light thrown across the table. */
  .glow {
    position: absolute;
    left: 10px;
    top: 0;
    width: 360px;
    height: 220px;
    border-radius: 50%;
    background: radial-gradient(closest-side, rgba(255, 226, 150, .75), rgba(255, 200, 110, .3) 55%, transparent);
    mix-blend-mode: screen;
    pointer-events: none;
    animation: fs-lamp-on .3s ease-out;
  }

  @keyframes fs-lamp-on {
    0% { opacity: 0; }
    30% { opacity: 1; filter: brightness(1.6); }
    45% { opacity: .5; }
    100% { opacity: 1; }
  }

  /* Printer */
  .frame { fill: #2a2f36; }
  .rail { fill: none; }
  .head rect { fill: #e0be76; }
  .head path { fill: none; stroke: #ff9a4a; }
  .bed { fill: #8a9aa8; }
  .printer.busy .head { animation: fs-print-head 1.2s ease-in-out; }

  @keyframes fs-print-head {
    0%, 100% { transform: none; }
    20% { transform: translateX(-12px); }
    40% { transform: translateX(10px); }
    60% { transform: translateX(-8px); }
    80% { transform: translateX(6px); }
  }

  /* The printed part: rises out of the bed, then hops off. */
  .part {
    position: absolute;
    left: 27px;
    bottom: 17px;
    width: 10px;
    height: 10px;
    border-radius: 2px;
    background: linear-gradient(160deg, #ffb057, #c2672a);
    box-shadow: inset 0 0 0 1px #3a2a15;
    pointer-events: none;
    animation: fs-print-part 1.9s ease-in forwards;
  }

  @keyframes fs-print-part {
    0% { transform: scaleY(0); transform-origin: bottom; opacity: 1; }
    60% { transform: scaleY(1); }
    75% { transform: translate(18px, -26px) rotate(90deg); }
    100% { transform: translate(40px, 30px) rotate(260deg); opacity: 0; }
  }

  /* Vise */
  .body, .foot { fill: #4a5c6c; }
  .jaw { fill: #8a9aa8; }
  .screw, .handle path { fill: none; stroke-width: 3; }
  .handle circle { fill: #c9a46a; }
  .vise.busy .handle { animation: fs-crank .9s ease-in-out; transform-origin: 58px 30px; transform-box: view-box; }
  .vise.busy .jaw.moving { animation: fs-clamp .9s ease-in-out; }

  @keyframes fs-crank { to { transform: rotate(360deg); } }

  @keyframes fs-clamp {
    0%, 100% { transform: none; }
    50% { transform: translateX(-12px); }
  }

  /* Pencil pot */
  .pot { fill: #c2412a; }
  .pencil path { fill: none; stroke-width: 4; stroke: #f0b840; }
  .pencil .tip { stroke-width: 2; stroke: #3a2a15; fill: #3a2a15; }
  .p2 path:first-child { stroke: #2f9a86; }
  .p3 path:first-child { stroke: #8a4fc4; }
  .pencils.busy .pencil { animation: fs-rattle .25s ease-in-out 3; transform-box: view-box; transform-origin: 32px 40px; }
  .pencils.busy .p2 { animation-delay: .05s; }
  .pencils.busy .p3 { animation-delay: .1s; }

  @keyframes fs-rattle {
    0%, 100% { transform: none; }
    30% { transform: rotate(-6deg) translateY(-2px); }
    70% { transform: rotate(5deg); }
  }
</style>
