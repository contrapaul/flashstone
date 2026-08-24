<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { account } from '$lib/account';
  import { lobbyCall } from '$lib/net/client';
  import { DECK_SIZE, isLegal } from '$lib/decks/deck';
  import { distinctCount } from '$lib/decks/deck';
  import { ALL_CARDS } from '$lib/data/cards';
  import { starterCollection } from '$lib/data/starter';
  import type { Owned } from '$lib/collection/owned';
  import { loadCollection, loadDeck } from '$lib/decks/storage';

  /**
   * New Game — one screen for every way a match starts.
   *
   * Practice, Online and the rules used to be three routes (`/play`, `/online`,
   * `/learn`). They are one page now because they answer the same question:
   * the player wants to play, and the only real choice is who against. The
   * match itself lives at `/play/ai`; this route never renders a table.
   *
   * `?mode=` picks the tab, so the redirects left behind at the old routes
   * still land where they used to — `/online` on Online, `/learn` on the rules.
   */

  type Mode = 'practice' | 'online' | 'learn';
  const MODES: { id: Mode; label: string }[] = [
    { id: 'practice', label: 'Practice' },
    { id: 'online', label: 'Online' },
    { id: 'learn', label: 'How to play' }
  ];

  function modeFrom(value: string | null): Mode {
    return MODES.some((m) => m.id === value) ? (value as Mode) : 'practice';
  }

  $: mode = modeFrom($page.url.searchParams.get('mode'));

  /** Tabs are a URL, not component state, so the back button steps through them. */
  function select(next: Mode) {
    void goto(next === 'practice' ? '/play' : `/play?mode=${next}`, {
      replaceState: true,
      noScroll: true,
      keepFocus: true
    });
  }

  // ── The deck you would take in ────────────────────────────
  let owned: Owned = {};
  let deckReady = false;
  let deckName = '';
  let deckPlayable = false;

  // ── Online lobby ──────────────────────────────────────────
  interface OpenGame {
    id: string;
    hostName: string;
    createdAt: number;
  }

  let games: OpenGame[] = [];
  let lobbyLoading = true;
  let error: string | null = null;
  let busy = false;
  let isPublic = true;
  let hosted: { id: string; isPublic: boolean } | null = null;
  let poller: ReturnType<typeof setInterval>;

  onMount(async () => {
    owned = loadCollection() ?? starterCollection();
    const deck = loadDeck();
    deckPlayable = Boolean(deck && isLegal(deck, owned));
    deckName = deck?.name ?? '';
    deckReady = true;

    await account.refresh();
    if ($account.user) {
      await refresh();
      // A 3s poll rather than a socket: the lobby changes rarely, a poll needs
      // no connection to keep alive, and the socket budget is better spent on
      // matches.
      poller = setInterval(refresh, 3000);
    }
    lobbyLoading = false;
  });

  onDestroy(() => clearInterval(poller));

  async function refresh() {
    try {
      const data = await lobbyCall('list');
      games = data.games ?? [];
      error = null;
    } catch (e) {
      error = e instanceof Error ? e.message : 'The lobby is unavailable.';
    }
  }

  async function create() {
    busy = true;
    error = null;
    try {
      const data = await lobbyCall('create', { isPublic });
      hosted = { id: data.game.id, isPublic: data.game.isPublic };
      await refresh();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Could not create a game.';
    }
    busy = false;
  }

  async function join(gameId: string) {
    busy = true;
    error = null;
    try {
      await lobbyCall('join', { gameId });
      await goto(`/online/${gameId}`);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Could not join.';
      await refresh();
    }
    busy = false;
  }

  async function cancelHosted() {
    if (!hosted) return;
    await lobbyCall('cancel', { gameId: hosted.id }).catch(() => {});
    hosted = null;
    await refresh();
  }

  $: inviteLink = hosted ? `${location.origin}/online/${hosted.id}` : '';

  let copied = false;
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(inviteLink);
      copied = true;
      setTimeout(() => (copied = false), 1800);
    } catch {
      copied = false;
    }
  }

  function ago(at: number): string {
    const seconds = Math.max(0, Math.round((Date.now() - at) / 1000));
    if (seconds < 60) return `${seconds}s ago`;
    return `${Math.round(seconds / 60)}m ago`;
  }

  $: deckLine = !deckReady
    ? ''
    : deckPlayable
      ? `Taking in “${deckName}” — ${DECK_SIZE} cards.`
      : `${distinctCount(owned)} of ${ALL_CARDS.length} cards collected — taking in the starter deck.`;
</script>

<svelte:head><title>New Game — Flashstone</title></svelte:head>

<main>
  <header class="top">
    <h1>New Game</h1>
    <p class="deck" class:playable={deckPlayable}>{deckLine}</p>
  </header>

  <div class="tabs" role="tablist" aria-label="How to start a game">
    {#each MODES as tab}
      <button
        role="tab"
        aria-selected={mode === tab.id}
        class:active={mode === tab.id}
        on:click={() => select(tab.id)}
      >
        {tab.label}
      </button>
    {/each}
  </div>

  {#if mode === 'practice'}
    <section class="panel start">
      <h2>Practice against the AI</h2>
      <p class="muted">
        A full match against a computer opponent that rotates class each game, so all four
        get seen. No account needed, and it counts for quests and gold exactly like an
        online win does.
      </p>
      <a class="cta big" href="/play/ai">Start match</a>
    </section>
  {:else if mode === 'online'}
    {#if lobbyLoading}
      <p class="muted">Loading…</p>
    {:else if !$account.user}
      <section class="panel gate">
        <p class="muted">
          Online play needs an account — the match runs on the server, which has to know
          whose deck is whose. Practice against the AI works without one.
        </p>
        <a class="cta" href="/account">Sign in or create an account</a>
      </section>
    {:else}
      {#if error}<p class="error">{error}</p>{/if}

      <div class="grid">
        <section class="panel">
          <h2>Create a game</h2>

          {#if hosted}
            <p class="muted">
              Waiting for an opponent{hosted.isPublic
                ? ' — your game is in the list beside this'
                : ''}.
            </p>
            <div class="invite">
              <input readonly value={inviteLink} aria-label="Invite link" />
              <button class="ghost" on:click={copyLink}>{copied ? 'Copied' : 'Copy'}</button>
            </div>
            <div class="row">
              <a class="cta" href={`/online/${hosted.id}`}>Open the table</a>
              <button class="ghost" on:click={cancelHosted}>Cancel</button>
            </div>
          {:else}
            <label class="toggle">
              <input type="checkbox" bind:checked={isPublic} />
              <span>
                <span class="label">Public game</span>
                <span class="note">
                  Anyone can see and join it from this page. Turn this off and only your
                  invite link works.
                </span>
              </span>
            </label>
            <button on:click={create} disabled={busy}>
              {busy ? 'Creating…' : 'Create game'}
            </button>
          {/if}
        </section>

        <section class="panel">
          <div class="head">
            <h2>Open games</h2>
            <span class="count">{games.length}</span>
          </div>

          {#if games.length === 0}
            <p class="muted">
              Nobody is waiting right now. Create a game and yours will appear here.
            </p>
          {:else}
            <ul class="lobby">
              {#each games as game (game.id)}
                <li>
                  <div>
                    <span class="host">{game.hostName}</span>
                    <span class="when">{ago(game.createdAt)}</span>
                  </div>
                  <button class="ghost" on:click={() => join(game.id)} disabled={busy}>
                    Join
                  </button>
                </li>
              {/each}
            </ul>
          {/if}
        </section>
      </div>
    {/if}
  {:else}
    <div class="rules">
      <p class="lead">
        Flashstone is a turn-based card game built from the Design &amp; Technology
        syllabus. Every term is a card, so the reading happens while you play — there is
        no quiz interrupting the match.
      </p>

      <section>
        <h2>Winning</h2>
        <p>
          Both heroes start at 30 health. Reduce your opponent's to zero. If both hit zero
          at once, the match is a draw.
        </p>
      </section>

      <section>
        <h2>Your turn</h2>
        <ul>
          <li>You gain one mana crystal per turn, up to ten, and refill to full each turn.</li>
          <li>You draw one card at the start of every turn.</li>
          <li>
            Run out of cards and you take <strong>fatigue</strong> damage instead — one,
            then two, then three, climbing every draw. Long games end this way.
          </li>
          <li>You may hold at most seven minions on the board.</li>
          <li>
            The player going second gets <strong>The Coin</strong>: a free card granting
            one extra mana for that turn only.
          </li>
        </ul>
      </section>

      <section>
        <h2>Combat</h2>
        <ul>
          <li>
            A minion can't attack the turn it lands — it has summoning sickness — unless it
            has Charge.
          </li>
          <li>
            Attacking trades damage both ways: your minion deals its Attack to the target,
            and takes the target's Attack back. Anything at zero health dies.
          </li>
          <li>Each minion attacks once per turn, or twice with Windfury.</li>
          <li>
            You can attack the enemy hero directly, unless a Taunt minion is in the way.
          </li>
        </ul>
      </section>

      <section>
        <h2>Keywords</h2>
        <dl>
          <div><dt>Taunt</dt><dd>Enemies must attack this minion before anything else.</dd></div>
          <div><dt>Charge</dt><dd>Can attack the turn it is played.</dd></div>
          <div>
            <dt>Divine Shield</dt><dd>Ignores the damage from the first hit it takes.</dd>
          </div>
          <div><dt>Windfury</dt><dd>Attacks twice per turn.</dd></div>
        </dl>
      </section>

      <section>
        <h2>Where the cards come from</h2>
        <p>
          Every card is a syllabus term. The <strong>term is the card's name</strong>; its
          cost, stats and ability are fixed to that term and never change, so a card you
          have played once plays the same way forever.
        </p>
        <p>
          A card on the table shows only what matters to the game — its ability, and any
          keywords it has. The <strong>definition is not printed on the card</strong>:
          click a card to inspect it, or open the collection, and the definition is there.
        </p>
        <p>
          You start with 15 cards, two copies of each — one complete deck. The rest are
          collected by opening packs. A deck holds 30 cards, at most two copies of any
          card, and only one copy of a Legendary.
        </p>
      </section>

      <section>
        <h2>Deck rules</h2>
        <p>
          A deck is exactly 30 cards with at most two copies of any one card — so you need
          at least 15 flashcards to field a full deck. Build one by hand on the Collection
          page, or press Auto-build and adjust from there.
        </p>
      </section>

      <p class="cta-row">
        <a class="cta" href="/play/ai">Start a practice match</a>
        <a class="cta ghost" href="/decks">Build a deck</a>
      </p>
    </div>
  {/if}
</main>

<style>
  main { max-width: 900px; margin: 0 auto; padding: 24px 16px 60px; }

  .top { margin-bottom: 18px; }

  h1 {
    margin: 0;
    font-family: var(--display);
    font-size: 26px;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--gold-bright);
  }

  .deck {
    margin: 8px 0 0;
    font-family: var(--display);
    font-size: 10.5px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--text-faint);
    min-height: 16px;
  }
  .deck.playable { color: var(--good); }

  h2 {
    margin: 0 0 10px;
    font-family: var(--display);
    font-size: 12px;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--gold);
  }

  /* ── Tabs ─────────────────────────────────────────────── */
  .tabs {
    display: flex;
    gap: 4px;
    margin-bottom: 18px;
    border-bottom: 1px solid var(--rule);
  }

  .tabs button {
    padding: 9px 16px;
    border: 1px solid transparent;
    border-bottom: none;
    border-radius: 4px 4px 0 0;
    background: none;
    cursor: pointer;
    font-family: var(--display);
    font-size: 10.5px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--text-dim);
  }
  .tabs button:hover { color: var(--text); }
  .tabs button.active {
    border-color: #8a6c3c;
    background: linear-gradient(180deg, #4a3620, #2a1d10);
    color: var(--gold-bright);
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
    gap: 16px;
    align-items: start;
  }

  .panel {
    padding: 20px 22px;
    border: 1px solid var(--frame);
    border-radius: 8px;
    background: linear-gradient(180deg, rgba(38, 27, 16, 0.9), rgba(22, 15, 9, 0.9));
  }
  .gate { max-width: 520px; text-align: center; }
  .start { max-width: 560px; }

  .head { display: flex; align-items: baseline; justify-content: space-between; }
  .count {
    font-family: var(--display);
    font-size: 11px;
    color: var(--text-faint);
  }

  .muted {
    margin: 0 0 14px;
    font-family: var(--body);
    font-size: 14px;
    line-height: 1.5;
    color: var(--text-dim);
    text-wrap: pretty;
  }

  .error {
    margin: 0 0 16px;
    padding: 9px 11px;
    border: 1px solid var(--blood-deep);
    border-radius: 4px;
    background: rgba(140, 44, 36, 0.18);
    font-family: var(--body);
    font-size: 13.5px;
    color: #f0c4bd;
  }

  .toggle {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    margin-bottom: 16px;
    cursor: pointer;
  }
  .toggle input { width: 15px; height: 15px; margin-top: 2px; flex: none; }
  .toggle .label { display: block; font-family: var(--body); font-size: 14px; color: var(--text); }
  .toggle .note {
    display: block;
    margin-top: 3px;
    font-family: var(--body);
    font-size: 11.5px;
    line-height: 1.4;
    color: var(--text-faint);
  }

  .invite { display: flex; gap: 8px; margin-bottom: 12px; }
  .invite input {
    flex: 1;
    min-width: 0;
    padding: 7px 9px;
    border: 1px solid var(--rule);
    border-radius: 4px;
    background: var(--ink-2);
    color: var(--text-dim);
    font-family: var(--body);
    font-size: 12.5px;
  }

  .row { display: flex; gap: 10px; align-items: center; }

  ul.lobby { list-style: none; margin: 0; padding: 0; }
  ul.lobby li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 0;
    border-top: 1px solid var(--rule);
  }
  ul.lobby li:first-child { border-top: none; }

  .host { font-family: var(--body); font-size: 14.5px; color: var(--text); }
  .when {
    display: block;
    font-family: var(--display);
    font-size: 9.5px;
    letter-spacing: 0.1em;
    color: var(--text-faint);
  }

  button, .cta {
    display: inline-block;
    padding: 10px 20px;
    border: 1px solid #8a6c3c;
    border-radius: 4px;
    background: linear-gradient(180deg, var(--gold), #9c7c3c);
    color: #2a1d10;
    cursor: pointer;
    font-family: var(--display);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.16em;
    text-transform: uppercase;
  }
  button:disabled { opacity: 0.5; cursor: default; }
  .cta:hover { background: linear-gradient(180deg, var(--gold-bright), var(--gold)); }
  .cta.big { padding: 14px 30px; font-size: 13px; }

  button.ghost {
    padding: 7px 14px;
    background: var(--ink-2);
    border-color: var(--rule);
    color: var(--text-dim);
  }
  button.ghost:hover:not(:disabled) { border-color: var(--frame-lit); color: var(--gold-bright); }

  .cta.ghost {
    background: linear-gradient(180deg, var(--panel), var(--ink-2));
    border-color: var(--frame);
    color: var(--gold);
  }
  .cta.ghost:hover { border-color: var(--frame-lit); color: var(--gold-bright); }

  /* ── Rules ────────────────────────────────────────────── */
  .rules { max-width: 740px; line-height: 1.65; }

  .lead {
    font-family: var(--body);
    font-size: 16px;
    font-style: italic;
    color: var(--text-dim);
    margin: 0;
  }

  .rules section {
    margin-top: 30px;
    border-top: 1px solid var(--rule);
    padding-top: 20px;
  }

  .rules p, .rules li, .rules dd {
    font-family: var(--body);
    font-size: 15px;
    color: var(--text);
  }
  .rules p { margin: 0 0 10px; }

  .rules ul { margin: 0; padding-left: 20px; }
  .rules li { margin-bottom: 7px; }

  dl { margin: 0; }
  dl > div {
    display: flex;
    gap: 12px;
    margin-bottom: 8px;
    flex-wrap: wrap;
  }
  dt {
    font-family: var(--display);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--attack);
    flex: 0 0 120px;
    padding-top: 3px;
  }
  dd { margin: 0; flex: 1; min-width: 200px; }

  strong { color: var(--gold-bright); font-weight: 600; }

  .cta-row {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
    margin-top: 36px;
  }
</style>
