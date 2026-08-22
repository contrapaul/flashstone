<script lang="ts">
  import { onMount } from 'svelte';
  import PackOpening from '$lib/components/PackOpening.svelte';
  import CardBack from '$lib/components/CardBack.svelte';
  import QuestPanel from '$lib/components/QuestPanel.svelte';
  import { account } from '$lib/account';
  import { ALL_CARDS } from '$lib/data/cards';
  import { PACK_COST, PACK_SIZE } from '$lib/packs/pack';
  import { CARD_BACKS, CARD_BACK_COST } from '$lib/shop';

  type Dealt = { cardId: string; gold: boolean; isNew: boolean };

  let opening: Dealt[] | null = null;
  let busy = false;
  let error: string | null = null;

  let backs: { owned: string[]; selected: string } = { owned: ['default'], selected: 'default' };
  let collected = 0;
  let complete = false;



  onMount(async () => {
    await account.refresh();
    await Promise.all([refreshBacks(), refreshCollection()]);
  });

  async function refreshBacks() {
    const res = await fetch('/api/shop/backs');
    if (res.ok) {
      const data = await res.json();
      backs = { owned: data.owned, selected: data.selected };
    }
  }

  async function refreshCollection() {
    const res = await fetch('/api/collection');
    if (!res.ok) return;
    const owned = (await res.json()).owned as Record<string, { copies: number }>;
    collected = Object.keys(owned).length;
    complete = ALL_CARDS.every((c) => (owned[c.id]?.copies ?? 0) >= 2);
  }

  /**
   * Opening a pack, whether it was bought or awarded. The endpoint differs
   * because what it spends differs — gold, or one of the packs the intro track
   * granted — but everything after it is the same.
   */
  async function getPack(path: string) {
    if (busy) return;
    busy = true;
    error = null;

    const res = await fetch(path, { method: 'POST' });
    if (res.ok) {
      const data = await res.json();
      opening = data.pack;
      await account.refresh();
    } else {
      error = (await res.json().catch(() => ({}))).message ?? 'Could not open a pack.';
    }
    busy = false;
  }

  const buyPack = () => getPack('/api/shop/buy-pack');
  const openOwned = () => getPack('/api/shop/open-pack');

  async function finishOpening() {
    opening = null;
    await refreshCollection();
  }

  async function backAction(backId: string, action: 'buy' | 'select') {
    busy = true;
    error = null;
    const res = await fetch('/api/shop/backs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ backId, action })
    });
    if (res.ok) {
      const data = await res.json();
      backs = { owned: data.owned, selected: data.selected };
      await account.refresh();
    } else {
      error = (await res.json().catch(() => ({}))).message ?? 'Could not do that.';
    }
    busy = false;
  }

  $: gold = $account.gold;
  $: packsHeld = $account.packs;
  $: canAffordPack = gold >= PACK_COST;
</script>

<svelte:head><title>Shop — Flashstone</title></svelte:head>

<main>
  {#if $account.loading}
    <p class="muted">Loading…</p>
  {:else if !$account.user}
    <section class="panel gate">
      <h1>Shop</h1>
      <p class="muted">
        Gold, packs and daily quests need an account — they have to live on the server so
        they follow you between devices and cannot be edited from the browser. Practice
        against the AI works without one.
      </p>
      <a class="cta" href="/account">Sign in or create an account</a>
    </section>
  {:else if opening}
    <section class="panel">
      <h1>Your pack</h1>
      <PackOpening pack={opening} backId={backs.selected} on:done={finishOpening} />
    </section>
  {:else}
    <header>
      <h1>Shop</h1>
      <span class="balance">
        {gold} gold{#if packsHeld > 0} · {packsHeld} unopened{/if}
      </span>
    </header>

    {#if error}<p class="error">{error}</p>{/if}

    <div class="grid">
      <section class="panel">
        <h2>Card pack</h2>
        <p class="muted">
          {PACK_SIZE} cards, at most one of any card, and the last is always Rare or
          better. Every card has a small chance of being gold.
        </p>

        {#if complete}
          <p class="note">
            You have every card at two copies. Packs would only repeat what you have —
            come back when more cards are added.
          </p>
        {:else}
          <p class="note">{collected} of {ALL_CARDS.length} cards collected.</p>
        {/if}

        <div class="pack-actions">
          {#if packsHeld > 0 && !complete}
            <button on:click={openOwned} disabled={busy}>
              {busy ? 'Opening…' : `Open a pack — ${packsHeld} waiting`}
            </button>
          {/if}

          <button
            class:ghost={packsHeld > 0 && !complete}
            on:click={buyPack}
            disabled={busy || !canAffordPack || complete}
          >
            {busy ? 'Opening…' : `Buy a pack — ${PACK_COST}g`}
          </button>
        </div>
        {#if !canAffordPack && !complete}
          <p class="short">{PACK_COST - gold} gold short. Win a game or finish a quest.</p>
        {/if}
      </section>

      <section class="panel">
        <h2>Card backs</h2>
        <p class="muted">
          What the other player sees. Card backs are the only thing gold buys besides
          packs — gold cards cannot be bought at all.
        </p>

        <div class="backs">
          {#each CARD_BACKS as back (back.id)}
            {@const backId = back.id}
            {@const owns = backs.owned.includes(backId)}
            {@const worn = backs.selected === backId}
            <div class="back-option" class:worn>
              <div class="thumb"><CardBack {backId} scale={0.62} /></div>
              <span class="back-name">{back.name}</span>
              {#if worn}
                <span class="worn-tag">Wearing</span>
              {:else if owns}
                <button class="ghost" on:click={() => backAction(backId, 'select')} disabled={busy}>
                  Wear
                </button>
              {:else if back.unlockOnly}
                <span class="locked" title="Win three games to unlock it">Locked</span>
              {:else}
                <button
                  class="ghost"
                  on:click={() => backAction(backId, 'buy')}
                  disabled={busy || gold < CARD_BACK_COST}
                >
                  {CARD_BACK_COST}g
                </button>
              {/if}
            </div>
          {/each}
        </div>
      </section>

      <QuestPanel on:claimed={() => account.refresh()} />
    </div>
  {/if}
</main>

<style>
  main {
    max-width: 1080px;
    margin: 0 auto;
    padding: 24px 16px 60px;
  }

  header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin-bottom: 20px;
  }

  h1 {
    margin: 0;
    font-family: var(--display);
    font-size: 26px;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--gold-bright);
  }

  h2 {
    margin: 0 0 10px;
    font-family: var(--display);
    font-size: 12px;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--gold);
  }

  .balance {
    font-family: var(--display);
    font-size: 15px;
    letter-spacing: 0.1em;
    color: var(--gold-bright);
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 16px;
    align-items: start;
  }

  .panel {
    padding: 20px 22px;
    border: 1px solid var(--frame);
    border-radius: 8px;
    background: linear-gradient(180deg, rgba(38, 27, 16, 0.9), rgba(22, 15, 9, 0.9));
  }

  .gate { max-width: 520px; margin: 40px auto; text-align: center; }

  .muted {
    margin: 0 0 12px;
    font-family: var(--body);
    font-size: 14px;
    line-height: 1.5;
    color: var(--text-dim);
    text-wrap: pretty;
  }

  .note,
  .short {
    margin: 0 0 12px;
    font-family: var(--body);
    font-size: 12.5px;
    color: var(--text-faint);
  }
  .short { margin: 8px 0 0; }

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

  button,
  .cta {
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

  .pack-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
  }

  button.ghost {
    padding: 6px 12px;
    background: var(--ink-2);
    border-color: var(--rule);
    color: var(--text-dim);
  }
  button.ghost:hover:not(:disabled) { border-color: var(--frame-lit); color: var(--gold-bright); }

  .backs {
    display: flex;
    flex-wrap: wrap;
    gap: 14px;
  }

  .back-option {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 10px;
    border: 1px solid var(--rule);
    border-radius: 6px;
  }
  .back-option.worn { border-color: #8a6c3c; background: rgba(74, 54, 32, 0.3); }

  /* CardBack scales from its top-left corner, so the box is sized to the result
     rather than to the card's intrinsic 134x168. */
  .thumb {
    width: 83px;
    height: 104px;
    overflow: hidden;
  }

  .back-name {
    font-family: var(--display);
    font-size: 9.5px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--text-dim);
  }

  .worn-tag {
    font-family: var(--display);
    font-size: 9px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--gold-bright);
  }

  .locked {
    font-family: var(--display);
    font-size: 9px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--text-faint);
  }
</style>
