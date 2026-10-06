<script lang="ts">
  import { afterUpdate } from 'svelte';
  import CardPreview from './CardPreview.svelte';
  import { ALL_CARDS } from '../data/cards';
  import { DESIGN_IDEAS, STUDY_NOTE } from '../data/tokens';
  import { COIN_CARD } from '../engine/engine';
  import type { PlayerId } from '../engine/state';
  import { RARITY_COLOR } from '../../utils/art';
  import type { Card } from '../../types/cards';

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
   *
   * It reads the engine's log strings and dresses them: seat ids become names,
   * turn headers become a divider in the side's colour, and card names become
   * chips that show the card on hover. A stopgap — REVISIONS.md R5 replaces the
   * strings with structured history, at which point the parsing below goes.
   */
  export let lines: string[] = [];
  /** Which seat is reading, so "player" and "ai" can become You and them. */
  export let you: PlayerId = 'player';
  export let opponentName = 'Opponent';
  export let open = true;
  /** Full-height rail rather than the compact overlay. Set by the play route. */
  export let rail = false;

  const MAX_OVERLAY_ENTRIES = 5;

  type Part =
    | { kind: 'text'; text: string }
    | { kind: 'actor'; side: 'me' | 'foe'; text: string }
    | { kind: 'card'; name: string; card?: Card; dead?: boolean }
    | { kind: 'num'; text: string };

  type Entry = { kind: 'divider'; side: 'me' | 'foe' } | { kind: 'line'; parts: Part[] };

  const BY_NAME = new Map<string, Card>(
    [...ALL_CARDS, STUDY_NOTE, ...DESIGN_IDEAS, COIN_CARD].map((c) => [c.name, c])
  );

  const sideOf = (id: string): 'me' | 'foe' => (id === you ? 'me' : 'foe');
  const nameOf = (id: string) => (id === you ? 'You' : opponentName);
  const actor = (id: string, text = nameOf(id)): Part => ({ kind: 'actor', side: sideOf(id), text });
  const card = (name: string, dead = false): Part => ({ kind: 'card', name, card: BY_NAME.get(name), dead });
  const text = (t: string): Part => ({ kind: 'text', text: t });
  const num = (t: string): Part => ({ kind: 'num', text: t });

  /** Possessive and verb forms differ between "You" and a name. */
  const verb = (id: string, mine: string, theirs: string) => (id === you ? mine : theirs);
  const possessive = (id: string) => (id === you ? 'Your' : `${opponentName}'s`);

  function parse(line: string): Entry | null {
    let m: RegExpMatchArray | null;

    if ((m = line.match(/^— (player|ai) turn \d+ \(\d+ mana\) —$/))) return { kind: 'divider', side: sideOf(m[1]) };
    if ((m = line.match(/^(player|ai) plays (.+)\.$/)))
      return { kind: 'line', parts: [actor(m[1]), text(verb(m[1], ' play ', ' plays ')), card(m[2])] };
    if ((m = line.match(/^(player|ai) uses (.+)\.$/)))
      return { kind: 'line', parts: [actor(m[1]), text(verb(m[1], ' use ', ' uses ')), card(m[2])] };
    if ((m = line.match(/^(.+) hits (player|ai) for (\d+)\.$/)))
      return { kind: 'line', parts: [card(m[1]), text(' hits '), actor(m[2]), text(' for '), num(m[3])] };
    if ((m = line.match(/^(.+) attacks (.+)\.$/)))
      return { kind: 'line', parts: [card(m[1]), text(' attacks '), card(m[2])] };
    if ((m = line.match(/^(.+)'s Divine Shield absorbs the hit\.$/)))
      return { kind: 'line', parts: [card(m[1]), text('’s Divine Shield breaks')] };
    if ((m = line.match(/^(.+) dies\.$/))) return { kind: 'line', parts: [card(m[1], true), text(' is destroyed')] };
    if ((m = line.match(/^(.+) is discarded\.$/))) return { kind: 'line', parts: [card(m[1], true), text(' is discarded')] };
    if ((m = line.match(/^(.+) breaks\.$/))) return { kind: 'line', parts: [card(m[1], true), text(' breaks')] };
    if ((m = line.match(/^(player|ai) is out of cards — (\d+) fatigue damage\.$/)))
      return {
        kind: 'line',
        parts: [actor(m[1]), text(verb(m[1], ' are', ' is') + ' out of cards — fatigue for '), num(m[2])]
      };
    if ((m = line.match(/^(player|ai)'s hand is full — (.+) burned\.$/)))
      return { kind: 'line', parts: [actor(m[1], possessive(m[1])), text(' hand is full — '), card(m[2], true), text(' burns')] };
    if ((m = line.match(/^(player|ai) concedes\.$/)))
      return { kind: 'line', parts: [actor(m[1]), text(verb(m[1], ' concede', ' concedes'))] };
    if ((m = line.match(/^Game over — (player|ai|draw)\.$/)))
      return {
        kind: 'line',
        parts: m[1] === 'draw' ? [text('A draw')] : [actor(m[1]), text(verb(m[1], ' win', ' wins'))]
      };
    return { kind: 'line', parts: [text(line)] };
  }

  // `parse` reads `you` and `opponentName` from its closure, and Svelte 4 only
  // re-runs a statement for the names written in it (HANDOVER §4.5) — so they
  // are passed here, or an online name arriving late would never be applied.
  $: entries = parseAll(lines, you, opponentName);

  function parseAll(all: string[], ..._readInside: unknown[]): Entry[] {
    return all.map(parse).filter((e): e is Entry => e !== null);
  }
  $: shown = rail ? entries : lastEntries(entries, MAX_OVERLAY_ENTRIES);

  /** The newest few lines, plus any dividers among them — dividers are not news. */
  function lastEntries(all: Entry[], count: number): Entry[] {
    let seen = 0;
    let from = all.length;
    while (from > 0 && seen < count) {
      from--;
      if (all[from].kind === 'line') seen++;
    }
    // A divider at the very top of the box separates nothing.
    while (from < all.length && all[from].kind === 'divider') from++;
    return all.slice(from);
  }

  let scroller: HTMLElement | undefined;

  // Newest line stays in view without stealing focus or the page's scroll —
  // in the compact box too, where a long line or two used to push it out of sight.
  afterUpdate(() => {
    if (open && scroller) scroller.scrollTop = scroller.scrollHeight;
  });

  /** The card under the pointer, shown large beside the log. */
  let hovered: { card: Card; top: number; left: number } | null = null;

  function showCard(event: PointerEvent | MouseEvent, c: Card | undefined) {
    if (!c) return;
    const chip = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const box = (event.currentTarget as HTMLElement).closest('.chronicle')?.getBoundingClientRect();
    const height = 168 * 1.4;
    hovered = {
      card: c,
      left: (box?.right ?? chip.right) + 14,
      top: Math.max(10, Math.min(window.innerHeight - height - 10, chip.top - height / 2))
    };
  }

  /** A tap on a touch screen toggles the card instead of hovering it. */
  function toggleCard(event: MouseEvent, c: Card | undefined) {
    if (hovered?.card === c) hovered = null;
    else showCard(event, c);
  }
</script>

<aside class="chronicle" class:rail>
  <button class="head" on:click={() => (open = !open)}>
    <span>Chronicle</span>
    <span>{open ? '—' : '+'}</span>
  </button>

  {#if open}
    <div class="scroll" bind:this={scroller}>
      {#each shown as entry}
        {#if entry.kind === 'divider'}
          <span class="divider {entry.side}" aria-hidden="true"></span>
        {:else}
          <span class="line">
            {#each entry.parts as part}
              {#if part.kind === 'actor'}
                <b class="actor {part.side}">{part.text}</b>
              {:else if part.kind === 'card'}
                <button
                  class="card-name"
                  class:dead={part.dead}
                  class:known={Boolean(part.card)}
                  style:--rarity={part.card ? RARITY_COLOR[part.card.rarity] : null}
                  on:pointerenter={(e) => e.pointerType === 'mouse' && showCard(e, part.card)}
                  on:pointerleave={(e) => e.pointerType === 'mouse' && (hovered = null)}
                  on:click={(e) => toggleCard(e, part.card)}
                >{part.name}</button>
              {:else if part.kind === 'num'}
                <b class="num">{part.text}</b>
              {:else}
                {part.text}
              {/if}
            {/each}
          </span>
        {/if}
      {/each}
    </div>
  {/if}
</aside>

{#if hovered}
  <div class="peek" style:left={`${hovered.left}px`} style:top={`${hovered.top}px`} aria-hidden="true">
    <CardPreview card={hovered.card} playable={false} />
  </div>
{/if}

<style>
  .chronicle {
    position: absolute;
    left: 18px;
    /* Below the Flashstone mark, which stands in for the hidden nav. */
    top: 40px;
    z-index: 35;
    width: 250px;
    padding: 11px 13px;
    border-radius: 6px;
    border: 1px solid var(--rule);
    background: rgba(19, 13, 8, .86);
    backdrop-filter: blur(6px);
    box-shadow: 0 14px 30px rgba(0, 0, 0, .55);
  }

  /* Fills the left margin top to bottom. `bottom` rather than a height, so it
     tracks the viewport without needing to be measured. */
  .chronicle.rail {
    /* Clear of the Flashstone mark, like the compact box. */
    top: 40px;
    bottom: 14px;
    width: 260px;
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
    max-height: 132px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 4px;
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
    font-size: 13px;
    line-height: 1.35;
    color: #c9b994;
  }

  /* A turn boundary, in the colour of whoever's turn it became. No words. */
  .divider {
    flex: none;
    height: 2px;
    margin: 3px 0;
    border-radius: 1px;
    opacity: .7;
  }
  .divider.me { background: linear-gradient(90deg, #4aa3ff, transparent); }
  .divider.foe { background: linear-gradient(90deg, #ff6a55, transparent); }

  .actor { font-weight: 600; }
  .actor.me { color: #8cc8ff; }
  .actor.foe { color: #ff9a88; }

  .card-name {
    display: inline;
    padding: 0;
    border: none;
    background: none;
    font: inherit;
    font-family: var(--display);
    font-size: 11.5px;
    font-weight: 600;
    letter-spacing: .02em;
    color: color-mix(in srgb, var(--rarity, #e6d9bd) 55%, #f4e8cc);
    cursor: default;
  }

  .card-name.known { cursor: help; border-bottom: 1px dotted color-mix(in srgb, var(--rarity) 60%, transparent); }
  .card-name.known:hover { color: #fff3d6; }
  .card-name.dead { text-decoration: line-through; text-decoration-color: rgba(255, 110, 90, .8); }

  .num {
    font-family: var(--display);
    font-weight: 700;
    color: #ff7a64;
  }

  .peek {
    position: fixed;
    z-index: 300;
    transform: scale(1.4);
    transform-origin: top left;
    pointer-events: none;
    filter: drop-shadow(0 18px 30px rgba(0, 0, 0, .7));
    animation: fs-peek .14s ease-out;
  }

  .peek :global(.card) { opacity: 1; }

  @keyframes fs-peek {
    from { opacity: 0; transform: scale(1.3); }
    to { opacity: 1; transform: scale(1.4); }
  }
</style>
