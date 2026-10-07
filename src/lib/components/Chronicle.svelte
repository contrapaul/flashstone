<script lang="ts">
  import { afterUpdate } from 'svelte';
  import { flip } from 'svelte/animate';
  import { fly } from 'svelte/transition';
  import CardPreview from './CardPreview.svelte';
  import ClassEmblem from './ClassEmblem.svelte';
  import { cardById } from '../data/cards';
  import { tokenById } from '../data/tokens';
  import { heroPowerFor } from '../data/classes';
  import { COIN_CARD } from '../engine/engine';
  import type { HistoryEntry, HistoryTarget, PlayerId } from '../engine/state';
  import { d } from '../presentation/motion';
  import { artFor, artUrlFor, RARITY_COLOR, sigil } from '../../utils/art';
  import type { Card, CardClass } from '../../types/cards';

  /**
   * The Chronicle: what each action did, as Hearthstone's play history does it.
   *
   *  - **Tiles** — a column down the left edge, newest at the top: the card's
   *    art in a frame blue for you and red for them, with a mark for what kind
   *    of action it was. Hover (or tap) opens the card full size, with an arrow
   *    to everything it hit and what happened to each.
   *  - **Text** — one line an action, for a wide screen's margin (the rail) or
   *    by the toggle: who acted as a coloured pip, the card's name in its
   *    rarity's colour, and the results as numbers and marks.
   *
   * Entries arrive from the table as their actions play, never ahead of them.
   * Nobody is ever a seat id: you are "You", they are their name.
   */
  export let entries: HistoryEntry[] = [];
  /** Which seat is reading. */
  export let you: PlayerId = 'player';
  export let opponentName = 'Opponent';
  export let myClass: CardClass = 'Neutral';
  export let foeClass: CardClass = 'Neutral';
  /** A wide screen's margin is free: text, full height. */
  export let rail = false;

  /** More than fit; the column clips the oldest. */
  const MAX_TILES = 14;

  /** The toggle overrides the default, which follows the space available. */
  let chosen: 'tiles' | 'text' | null = null;
  $: textMode = (chosen ?? (rail ? 'text' : 'tiles')) === 'text';

  $: tiles = entries.slice(-MAX_TILES).reverse();

  const cardOf = (id: string | undefined): Card | undefined =>
    id === undefined ? undefined : (cardById(id) ?? tokenById(id) ?? (id === COIN_CARD.id ? COIN_CARD : undefined));

  const sideOf = (owner: PlayerId) => (owner === you ? 'me' : 'foe');

  /** The art behind a card: its drawing if there is one, its generated gradient if not. */
  function artOf(cardId: string | undefined, name: string): string {
    const url = cardId ? artUrlFor(cardId) : null;
    return url ? `url("${url}") center / cover no-repeat` : artFor(name);
  }

  /** What an entry did to one thing, gathered: a minion can be hit and then killed. */
  interface Struck {
    key: string;
    hero: PlayerId | null;
    card?: Card;
    name: string;
    results: HistoryTarget[];
    killed: boolean;
  }

  function struck(entry: HistoryEntry, ..._readInside: unknown[]): Struck[] {
    const byKey = new Map<string, Struck>();
    for (const t of entry.targets) {
      const key = t.ref.kind === 'hero' ? `hero:${t.ref.owner}` : t.ref.instanceId;
      let s = byKey.get(key);
      if (!s) {
        const hero = t.ref.kind === 'hero' ? t.ref.owner : null;
        s = {
          key,
          hero,
          card: cardOf(t.cardId),
          name: hero ? (hero === you ? 'You' : opponentName) : t.name,
          results: [],
          killed: false
        };
        byKey.set(key, s);
      }
      if (t.result === 'killed') s.killed = true;
      else s.results.push(t);
    }
    return [...byKey.values()];
  }

  /** A sentence for a screen reader — the tiles themselves carry no words. */
  function describe(entry: HistoryEntry, ..._readInside: unknown[]): string {
    const who = entry.actor === you ? 'You' : opponentName;
    const what = entry.kind === 'fatigue' ? `fatigue, ${entry.amount}` : entry.name;
    const hits = struck(entry).map(
      (s) => `${s.name} ${s.results.map((r) => (r.amount ? `${r.result} ${r.amount}` : r.result)).join(', ')}${s.killed ? ' destroyed' : ''}`
    );
    return `${who}: ${what}${hits.length ? ` — ${hits.join('; ')}` : ''}`;
  }

  // ── The open entry ──────────────────────────────────────
  let focused: { entry: HistoryEntry; top: number; left: number } | null = null;
  let aside: HTMLElement | undefined;

  function focus(event: Event, entry: HistoryEntry) {
    const item = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const box = aside?.getBoundingClientRect();
    focused = {
      entry,
      left: (box?.right ?? item.right) + 12,
      top: Math.max(10, Math.min(window.innerHeight - PANEL_HEIGHT - 10, item.top - 24))
    };
  }
  const PANEL_HEIGHT = 168 * 1.2 + 24;

  /** A tap on a touch screen toggles the entry instead of hovering it. */
  function toggle(event: MouseEvent, entry: HistoryEntry) {
    if (focused?.entry.n === entry.n) focused = null;
    else focus(event, entry);
  }

  function outside(event: PointerEvent) {
    if (focused && aside && !aside.contains(event.target as Node)) focused = null;
  }

  // ── Text mode ───────────────────────────────────────────
  let scroller: HTMLElement | undefined;
  afterUpdate(() => {
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
  });

  /** A turn boundary sits before the first entry of each turn, in its side's colour. */
  const newTurn = (i: number) => i > 0 && entries[i].turn !== entries[i - 1].turn;

  const ICON: Record<HistoryEntry['kind'], 'burst' | 'sword' | 'cog' | 'recycle'> = {
    play: 'burst',
    attack: 'sword',
    heroPower: 'cog',
    trigger: 'cog',
    burn: 'recycle',
    fatigue: 'recycle'
  };
</script>

<svelte:window on:pointerdown={outside} />

<aside class="chronicle" class:text={textMode} class:rail bind:this={aside} aria-label="Chronicle">
  <button
    class="mode"
    on:click={() => (chosen = textMode ? 'tiles' : 'text')}
    aria-label={textMode ? 'Show the Chronicle as tiles' : 'Show the Chronicle as text'}
  >
    {#if textMode}
      <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="3" width="7" height="8" rx="1.5" /><rect x="4" y="13" width="7" height="8" rx="1.5" /><path d="M14 7 H20 M14 17 H20" /></svg>
      <span class="label">Chronicle</span>
    {:else}
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6 H20 M4 12 H20 M4 18 H14" /></svg>
    {/if}
  </button>

  {#if textMode}
    <ol class="lines" bind:this={scroller}>
      {#each entries as entry, i (entry.n)}
        {#if newTurn(i)}<li class="divider {sideOf(entry.actor)}" aria-hidden="true"></li>{/if}
        <li>
          <button
            class="line"
            class:open={focused?.entry.n === entry.n}
            aria-label={describe(entry, you, opponentName)}
            on:pointerenter={(e) => e.pointerType === 'mouse' && focus(e, entry)}
            on:pointerleave={(e) => e.pointerType === 'mouse' && (focused = null)}
            on:click={(e) => toggle(e, entry)}
          >
            <span class="pip {sideOf(entry.actor)}" aria-hidden="true"></span>
            {#if entry.kind === 'fatigue'}
              <span class="kw">Fatigue</span> <b class="num dmg">−{entry.amount}</b>
            {:else}
              {@const card = cardOf(entry.cardId)}
              <span
                class="name"
                class:dead={entry.kind === 'burn'}
                class:power={entry.kind === 'heroPower'}
                style:--rarity={card ? RARITY_COLOR[card.rarity] : null}
              >{entry.name}</span>
            {/if}
            {#if entry.kind !== 'play' && entry.kind !== 'fatigue'}
              <svg class="mark {ICON[entry.kind]}" viewBox="0 0 24 24" aria-hidden="true"><use href="#fs-chronicle-{ICON[entry.kind]}" /></svg>
            {/if}
            {#each struck(entry, you, opponentName) as s, j}
              <span class="hit">
                {#if j === 0}<span class="arrow" aria-hidden="true">›</span>{/if}
                {#if s.hero}
                  <span class="hero-name {sideOf(s.hero)}">{s.name}</span>
                {:else}
                  <span class="name small" class:dead={s.killed} style:--rarity={s.card ? RARITY_COLOR[s.card.rarity] : null}>{s.name}</span>
                {/if}
                {#each s.results as r}
                  {#if r.result === 'damage'}<b class="num dmg">−{r.amount}</b>
                  {:else if r.result === 'heal'}<b class="num heal">+{r.amount}</b>
                  {:else if r.result === 'summoned'}<b class="num heal">+</b>
                  {:else if r.result === 'buff'}<b class="kw gold">Buffed</b>
                  {:else if r.result === 'frozen'}<b class="kw frost">Frozen</b>
                  {:else if r.result === 'silenced'}<b class="kw">Silenced</b>
                  {:else if r.result === 'shielded'}<b class="kw gold">Shield</b>
                  {:else if r.result === 'armor'}<b class="kw steel">Armor</b>
                  {/if}
                {/each}
                {#if s.killed}<svg class="mark recycle" viewBox="0 0 24 24" aria-hidden="true"><use href="#fs-chronicle-recycle" /></svg>{/if}
              </span>
            {/each}
          </button>
        </li>
      {/each}
    </ol>
  {:else}
    <ol class="tiles">
      {#each tiles as entry (entry.n)}
        <li animate:flip={{ duration: d(260) }} in:fly={{ x: -70, duration: d(320) }}>
          <button
            class="tile {sideOf(entry.actor)} {entry.kind} class-{(entry.heroClass ?? 'Neutral').toLowerCase()}"
            class:open={focused?.entry.n === entry.n}
            style:--art={entry.kind === 'heroPower' || entry.kind === 'fatigue' ? null : artOf(entry.cardId, entry.name)}
            aria-label={describe(entry, you, opponentName)}
            on:pointerenter={(e) => e.pointerType === 'mouse' && focus(e, entry)}
            on:pointerleave={(e) => e.pointerType === 'mouse' && (focused = null)}
            on:click={(e) => toggle(e, entry)}
          >
            {#if entry.kind === 'heroPower'}
              <span class="emblem"><ClassEmblem heroClass={entry.heroClass} /></span>
            {:else if entry.kind === 'fatigue'}
              <b class="fatigue-num">{entry.amount}</b>
            {:else if !(entry.cardId && artUrlFor(entry.cardId))}
              <span class="sigil">{sigil(entry.name)}</span>
            {/if}
            <svg class="badge {ICON[entry.kind]}" viewBox="0 0 24 24" aria-hidden="true"><use href="#fs-chronicle-{ICON[entry.kind]}" /></svg>
          </button>
        </li>
      {/each}
    </ol>
  {/if}
</aside>

<!-- The marks, drawn once and used by reference. -->
<svg class="defs" aria-hidden="true">
  <defs>
    <symbol id="fs-chronicle-burst" viewBox="0 0 24 24">
      <path d="M12 2 L14 9 L21 7 L16 12 L21 17 L14 15 L12 22 L10 15 L3 17 L8 12 L3 7 L10 9 Z" />
    </symbol>
    <symbol id="fs-chronicle-sword" viewBox="0 0 24 24">
      <path d="M20 4 L10 14 M20 4 H15.5 M20 4 V8.5 M7 11 L13 17 M9.5 14.5 L4 20" />
    </symbol>
    <symbol id="fs-chronicle-cog" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="4.5" />
      <path d="M12 2.5 V5.5 M12 18.5 V21.5 M2.5 12 H5.5 M18.5 12 H21.5 M5.3 5.3 L7.4 7.4 M16.6 16.6 L18.7 18.7 M5.3 18.7 L7.4 16.6 M16.6 7.4 L18.7 5.3" />
    </symbol>
    <symbol id="fs-chronicle-recycle" viewBox="0 0 24 24">
      <path d="M19 12 A7 7 0 0 1 7 17 M5 12 A7 7 0 0 1 17 7 M17 3 V7 H13 M7 21 V17 H11" />
    </symbol>
  </defs>
</svg>

{#if focused}
  {@const entry = focused.entry}
  {@const card = cardOf(entry.cardId)}
  {@const power = entry.kind === 'heroPower' ? heroPowerFor(entry.heroClass ?? 'Neutral') : null}
  {@const hits = struck(entry, you, opponentName)}
  <div
    class="panel {sideOf(entry.actor)}"
    style:left={`${focused.left}px`}
    style:top={`${focused.top}px`}
    aria-hidden="true"
  >
    <div class="source">
      {#if card}
        <div class="card-slot" class:burnt={entry.kind === 'burn'}><CardPreview {card} playable={false} /></div>
      {:else if power}
        <div class="block power class-{(entry.heroClass ?? 'Neutral').toLowerCase()}">
          <span class="disc"><ClassEmblem heroClass={entry.heroClass} /></span>
          <b>{power.name}</b>
          <small>{power.description}</small>
        </div>
      {:else if entry.kind === 'fatigue'}
        <div class="block fatigue">
          <svg viewBox="0 0 24 24"><use href="#fs-chronicle-recycle" /></svg>
          <b>Fatigue</b>
        </div>
      {:else}
        <div class="block"><b>{entry.name}</b></div>
      {/if}
    </div>

    {#if hits.length > 0}
      <svg class="pointer" viewBox="0 0 40 24"><path d="M2 12 H32 M24 4 L34 12 L24 20" /></svg>
      <ul class="hits" class:many={hits.length > 4}>
        {#each hits as s (s.key)}
          <li class="struck" class:killed={s.killed}>
            {#if s.hero}
              {@const cls = s.hero === you ? myClass : foeClass}
              <span class="mini hero {sideOf(s.hero)} class-{cls.toLowerCase()}"><ClassEmblem heroClass={cls} /></span>
            {:else}
              <span class="mini" style:--art={artOf(s.card?.id, s.name)}>
                {#if !(s.card && artUrlFor(s.card.id))}<span class="sigil">{sigil(s.name)}</span>{/if}
              </span>
            {/if}
            {#each s.results as r}
              <span class="result {r.result}">
                {#if r.result === 'damage'}−{r.amount}
                {:else if r.result === 'heal'}+{r.amount}
                {:else if r.result === 'buff'}▲
                {:else if r.result === 'summoned'}+
                {:else if r.result === 'frozen'}<svg viewBox="0 0 24 24"><path d="M12 3 V21 M4.2 7.5 L19.8 16.5 M4.2 16.5 L19.8 7.5" /></svg>
                {:else if r.result === 'silenced'}<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" /><path d="M6.5 6.5 L17.5 17.5" /></svg>
                {:else if r.result === 'shielded'}<svg viewBox="0 0 24 24"><path d="M12 3 L19 6 V12 C19 16 16 19 12 21 C8 19 5 16 5 12 V6 Z M9 9 L15 15" /></svg>
                {:else if r.result === 'armor'}<svg viewBox="0 0 24 24"><path d="M12 3 L19 6 V12 C19 16 16 19 12 21 C8 19 5 16 5 12 V6 Z" /></svg>
                {/if}
              </span>
            {/each}
            {#if s.killed}<svg class="slash" viewBox="0 0 40 40"><path d="M8 8 L32 32 M32 8 L8 32" /></svg>{/if}
            <span class="caption">{s.name}</span>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
{/if}

<style>
  .chronicle {
    --me: #4aa3ff;
    --foe: #ff5a46;
    position: absolute;
    left: 8px;
    /* Below the Flashstone mark, which stands in for the hidden nav. */
    top: 40px;
    bottom: 14px;
    z-index: 35;
    width: 56px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    pointer-events: none;
  }

  .chronicle > * { pointer-events: auto; }

  .chronicle.text {
    left: 18px;
    bottom: auto;
    width: 260px;
    padding: 9px 11px 11px;
    border-radius: 6px;
    border: 1px solid var(--rule);
    background: rgba(19, 13, 8, .88);
    backdrop-filter: blur(6px);
    box-shadow: 0 14px 30px rgba(0, 0, 0, .55);
  }

  /* Fills the left margin top to bottom. */
  .chronicle.text.rail { bottom: 14px; }

  .mode {
    align-self: flex-start;
    display: flex;
    align-items: center;
    gap: 8px;
    height: 24px;
    padding: 0 4px;
    border: none;
    border-radius: 4px;
    background: rgba(19, 13, 8, .6);
    color: #c9b994;
    cursor: pointer;
  }
  .chronicle.text .mode { align-self: stretch; background: none; padding: 0 0 6px; border-bottom: 1px solid var(--rule); border-radius: 0; height: auto; }
  .mode svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; }
  .mode:hover { color: #fff3d6; }
  .label {
    font-family: var(--display);
    font-size: 9.5px;
    letter-spacing: .22em;
    text-transform: uppercase;
    color: #a58d5f;
  }

  ol { list-style: none; margin: 0; padding: 0; }

  /* ── Tiles ── */
  .tiles {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
    overflow: hidden;
    /* The oldest fade out at the bottom rather than being cut. */
    -webkit-mask-image: linear-gradient(to bottom, #000 82%, transparent);
    mask-image: linear-gradient(to bottom, #000 82%, transparent);
  }

  .tile {
    --edge: var(--me);
    position: relative;
    display: grid;
    place-items: center;
    width: 56px;
    height: 62px;
    padding: 0;
    border: 3px solid var(--edge);
    border-radius: 8px;
    background: var(--art, linear-gradient(180deg, #2a1d12, #120c07));
    box-shadow: 0 0 0 1px rgba(0, 0, 0, .7), 0 0 10px color-mix(in srgb, var(--edge) 55%, transparent), 0 6px 12px rgba(0, 0, 0, .55);
    cursor: pointer;
    transition: transform .12s ease, box-shadow .12s ease;
  }
  .tile.foe { --edge: var(--foe); }
  .tile:hover, .tile.open { transform: translateX(3px) scale(1.05); box-shadow: 0 0 0 1px rgba(0, 0, 0, .7), 0 0 16px var(--edge), 0 8px 14px rgba(0, 0, 0, .6); }

  /* A burned card: the art scorched. */
  .tile.burn { filter: sepia(.8) saturate(1.6) hue-rotate(-18deg) brightness(.8); }

  .sigil {
    font-family: var(--display);
    font-size: 22px;
    font-weight: 700;
    color: rgba(255, 244, 220, .85);
    text-shadow: 0 2px 4px rgba(0, 0, 0, .8);
  }

  .emblem { width: 38px; height: 38px; color: var(--c1, #ffe08a); filter: drop-shadow(0 0 6px var(--c2, #9c7a3c)); }
  .tile.heroPower { background: radial-gradient(circle at 50% 40%, var(--c2, #6a5226), var(--c3, #2a1d0c)); }

  .fatigue-num {
    font-family: var(--display);
    font-size: 24px;
    color: #ff8a70;
    text-shadow: 0 0 8px rgba(255, 90, 70, .8);
  }

  /* Class colours, as on the hero frames. */
  .class-designer { --c1: #b8fff0; --c2: #2f9a86; --c3: #0f3d36; }
  .class-engineer { --c1: #ffd9a8; --c2: #c27a2c; --c3: #4d2a0c; }
  .class-consumer { --c1: #ecd4ff; --c2: #8a4fc4; --c3: #321650; }
  .class-manufacturer { --c1: #ffc4b4; --c2: #c2412a; --c3: #4a120a; }

  /* What kind of action, in the corner. */
  .badge {
    position: absolute;
    right: -7px;
    bottom: -7px;
    width: 22px;
    height: 22px;
    padding: 3px;
    box-sizing: border-box;
    border-radius: 50%;
    background: #170f08;
    border: 1.5px solid var(--edge);
    overflow: visible;
  }
  .badge, .mark { fill: none; stroke: #f4e2b8; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }
  .badge.burst, .mark.burst { fill: #ffcf5a; stroke: #3a2208; stroke-width: 1.2; }
  .badge.sword { stroke: #ffd2c4; }
  .badge.cog { stroke: #c8e6ff; }
  .badge.recycle, .mark.recycle { stroke: #ff8a70; }

  .defs { position: absolute; width: 0; height: 0; overflow: hidden; }

  /* ── Text ── */
  .lines {
    display: flex;
    flex-direction: column;
    gap: 3px;
    max-height: 30vh;
    overflow-y: auto;
    padding-right: 4px;
    scrollbar-width: thin;
  }
  .chronicle.text.rail .lines { flex: 1; max-height: none; }

  .line {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 2px 5px;
    width: 100%;
    padding: 3px 4px;
    border: none;
    border-radius: 4px;
    background: none;
    text-align: left;
    font-family: var(--body);
    font-size: 13px;
    line-height: 1.3;
    color: #c9b994;
    cursor: default;
  }
  .line:hover, .line.open { background: rgba(255, 236, 190, .07); }

  .pip {
    flex: none;
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: var(--me);
    box-shadow: 0 0 6px var(--me);
  }
  .pip.foe { background: var(--foe); box-shadow: 0 0 6px var(--foe); }

  .name {
    font-family: var(--display);
    font-size: 12px;
    font-weight: 700;
    letter-spacing: .02em;
    color: color-mix(in srgb, var(--rarity, #e6d9bd) 55%, #f4e8cc);
  }
  .name.small { font-size: 11px; font-weight: 600; }
  .name.power { color: #ffe08a; }
  .name.dead { text-decoration: line-through; text-decoration-color: rgba(255, 110, 90, .85); }

  .hit { display: inline-flex; align-items: center; gap: 4px; }
  .hit + .hit::before { content: '·'; color: #6e5c3e; margin-right: 1px; }
  .arrow { color: #8a744c; font-weight: 700; }

  .hero-name { font-weight: 700; color: #8cc8ff; }
  .hero-name.foe { color: #ff9a88; }

  .num { font-family: var(--display); font-weight: 700; }
  .num.dmg { color: #ff6a52; }
  .num.heal { color: #6fe08a; }
  .kw { font-weight: 700; color: #e9dcc0; font-size: 12px; }
  .kw.gold { color: #ffd76a; }
  .kw.frost { color: #9fdcff; }
  .kw.steel { color: #c4d2dc; }
  .mark { width: 14px; height: 14px; flex: none; }

  /* A turn boundary, in the colour of whoever's turn it became. No words. */
  .divider {
    flex: none;
    height: 2px;
    margin: 4px 0;
    border-radius: 1px;
    opacity: .75;
    background: linear-gradient(90deg, var(--me), transparent);
  }
  .divider.foe { background: linear-gradient(90deg, var(--foe), transparent); }

  /* ── The open entry ── */
  .panel {
    --me: #4aa3ff;
    --foe: #ff5a46;
    --edge: var(--me);
    position: fixed;
    z-index: 300;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 14px;
    border-radius: 10px;
    border: 1px solid color-mix(in srgb, var(--edge) 60%, transparent);
    background: rgba(16, 11, 6, .9);
    backdrop-filter: blur(6px);
    box-shadow: 0 20px 40px rgba(0, 0, 0, .7), 0 0 18px color-mix(in srgb, var(--edge) 30%, transparent);
    pointer-events: none;
    animation: fs-panel .14s ease-out;
  }
  .panel.foe { --edge: var(--foe); }

  @keyframes fs-panel {
    from { opacity: 0; transform: translateX(-8px); }
  }

  .card-slot { width: calc(134px * 1.2); height: calc(168px * 1.2); }
  .card-slot :global(.card) { opacity: 1; transform: scale(1.2); transform-origin: top left; }
  .card-slot.burnt :global(.card) { filter: sepia(.7) saturate(1.5) hue-rotate(-15deg) brightness(.85); }

  .block {
    width: 150px;
    min-height: 120px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 12px;
    box-sizing: border-box;
    border-radius: 8px;
    background: linear-gradient(180deg, #2a1d12, #120c07);
    text-align: center;
    color: #e6d9bd;
  }
  .block b { font-family: var(--display); font-size: 14px; }
  .block small { font-size: 12px; line-height: 1.3; color: #c9b994; }
  .block.power { background: radial-gradient(circle at 50% 30%, var(--c2, #6a5226), var(--c3, #1a1208) 75%); }
  .disc { width: 56px; height: 56px; color: var(--c1, #ffe08a); filter: drop-shadow(0 0 8px var(--c2, #9c7a3c)); }
  .block.fatigue svg { width: 54px; height: 54px; fill: none; stroke: #ff8a70; stroke-width: 2; stroke-linecap: round; }

  .pointer { flex: none; width: 40px; height: 24px; fill: none; stroke: color-mix(in srgb, var(--edge) 80%, #fff); stroke-width: 3; stroke-linecap: round; stroke-linejoin: round; filter: drop-shadow(0 0 4px var(--edge)); }

  .hits {
    display: grid;
    grid-template-columns: repeat(1, auto);
    gap: 12px 14px;
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .hits.many { grid-template-columns: repeat(2, auto); }

  .struck {
    position: relative;
    width: 64px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
  }

  .mini {
    display: grid;
    place-items: center;
    width: 54px;
    height: 64px;
    border-radius: 50%;
    border: 3px solid #b8945a;
    background: var(--art, linear-gradient(180deg, #2a1d12, #120c07));
    box-shadow: 0 4px 10px rgba(0, 0, 0, .6);
  }
  .mini .sigil { font-size: 18px; }
  .mini.hero { border-radius: 12px; border-color: var(--me); background: radial-gradient(circle at 50% 40%, var(--c2, #6a5226), var(--c3, #2a1d0c)); color: var(--c1, #ffe08a); padding: 9px; box-sizing: border-box; }
  .mini.hero.foe { border-color: var(--foe); }

  .struck.killed .mini { filter: grayscale(1) brightness(.6); }
  .slash {
    position: absolute;
    top: 12px;
    left: 12px;
    width: 40px;
    height: 40px;
    fill: none;
    stroke: #ff3b2a;
    stroke-width: 5;
    stroke-linecap: round;
    filter: drop-shadow(0 0 4px rgba(0, 0, 0, .9));
  }

  .caption {
    max-width: 72px;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-size: 10.5px;
    color: #c9b994;
  }

  /* Each result pinned to the portrait, like the splat on the board. */
  .result {
    position: absolute;
    top: 30px;
    right: -6px;
    min-width: 26px;
    height: 26px;
    padding: 0 4px;
    box-sizing: border-box;
    display: grid;
    place-items: center;
    border-radius: 13px;
    font-family: var(--display);
    font-size: 14px;
    font-weight: 700;
    color: #fff;
    text-shadow: 0 1px 2px #000;
    background: #5a4a30;
    border: 2px solid rgba(255, 240, 210, .8);
  }
  .result + .result { top: 2px; }
  .result svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2.4; stroke-linecap: round; stroke-linejoin: round; }
  .result.damage { background: #c4261a; border-color: #ffd7c8; }
  .result.heal, .result.summoned { background: #1f8a3a; border-color: #d6ffd8; }
  .result.buff, .result.shielded { background: #a87a10; border-color: #ffe7a0; }
  .result.frozen { background: #1d6fa8; border-color: #cdeeff; }
  .result.silenced { background: #4a4a52; }
  .result.armor { background: #5a6b78; border-color: #e6eef4; }
</style>
