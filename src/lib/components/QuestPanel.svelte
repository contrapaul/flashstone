<script lang="ts">
  import { onMount, createEventDispatcher } from 'svelte';
  import type { IntroRow, QuestRow } from '$lib/quests/client';
  import { fetchQuests, claimQuest, nextRefreshIn } from '$lib/quests/client';

  /**
   * Two tracks, one panel each: the one-time intro quests that hand a new
   * player their runway, and today's three dailies. The intro section
   * disappears for good once every one of its quests is claimed.
   */
  const dispatch = createEventDispatcher<{ claimed: number }>();

  let quests: QuestRow[] = [];
  let intro: IntroRow[] = [];
  let loading = true;
  let busy = '';
  let error: string | null = null;
  /** Which section the error belongs under, so it is not printed twice. */
  let errorTrack: 'intro' | 'daily' | null = null;
  let countdown = '';
  let ticker: ReturnType<typeof setInterval>;

  onMount(() => {
    void load();
    tick();
    ticker = setInterval(tick, 1000);
    return () => clearInterval(ticker);
  });

  function tick() {
    countdown = nextRefreshIn();
  }

  async function load() {
    const tracks = await fetchQuests();
    quests = tracks.quests;
    intro = tracks.intro;
    loading = false;
  }

  async function claim(questId: string) {
    busy = questId;
    error = null;
    errorTrack = intro.some((q) => q.id === questId) ? 'intro' : 'daily';
    const result = await claimQuest(questId);
    if (result.quests) quests = result.quests;
    if (result.intro) intro = result.intro;
    if (result.ok) {
      dispatch('claimed', result.awarded);
    } else {
      error = result.reason ?? 'Could not claim that.';
    }
    busy = '';
  }

  /** "100g + 1 pack", "5 packs + a card back". Gold-only quests just say "40g". */
  function introReward(quest: IntroRow): string {
    const parts: string[] = [];
    if (quest.gold > 0) parts.push(`${quest.gold}g`);
    if (quest.packs > 0) parts.push(quest.packs === 1 ? '1 pack' : `${quest.packs} packs`);
    if (quest.back) parts.push('a card back');
    return parts.join(' + ');
  }
</script>

{#if intro.length > 0}
  <section class="panel">
    <div class="head">
      <h2>Getting started</h2>
      <span class="countdown" title="These do not expire">One time</span>
    </div>

    {#if error && errorTrack === 'intro'}<p class="error">{error}</p>{/if}

    <ul>
      {#each intro as quest (quest.id)}
        <li class:done={quest.claimed}>
          <div class="row">
            <span class="label">{quest.label}</span>
            <span class="reward">{introReward(quest)}</span>
          </div>
          <p class="detail">{quest.detail}</p>

          <div
            class="bar"
            role="progressbar"
            aria-valuenow={quest.progress}
            aria-valuemax={quest.target}
          >
            <span class="fill" style:width={`${(quest.progress / quest.target) * 100}%`}></span>
          </div>

          <div class="row foot">
            <span class="count">{quest.progress} / {quest.target}</span>
            {#if quest.claimed}
              <span class="claimed">Claimed</span>
            {:else if quest.complete}
              <button on:click={() => claim(quest.id)} disabled={busy === quest.id}>
                {busy === quest.id ? '…' : 'Claim'}
              </button>
            {/if}
          </div>
        </li>
      {/each}
    </ul>
  </section>
{/if}

<section class="panel">
  <div class="head">
    <h2>Daily quests</h2>
    <span class="countdown" title="New quests at UTC midnight">{countdown}</span>
  </div>

  {#if loading}
    <p class="muted">Loading…</p>
  {:else if quests.length === 0}
    <p class="muted">Quests are unavailable right now.</p>
  {:else}
    {#if error && errorTrack === 'daily'}<p class="error">{error}</p>{/if}

    <ul>
      {#each quests as quest (quest.id)}
        <li class:done={quest.claimed}>
          <div class="row">
            <span class="label">{quest.label}</span>
            <span class="reward">{quest.reward}g</span>
          </div>
          <p class="detail">{quest.detail}</p>

          <div class="bar" role="progressbar" aria-valuenow={quest.progress} aria-valuemax={quest.target}>
            <span class="fill" style:width={`${(quest.progress / quest.target) * 100}%`}></span>
          </div>

          <div class="row foot">
            <span class="count">{quest.progress} / {quest.target}</span>
            {#if quest.claimed}
              <span class="claimed">Claimed</span>
            {:else if quest.complete}
              <button on:click={() => claim(quest.id)} disabled={busy === quest.id}>
                {busy === quest.id ? '…' : 'Claim'}
              </button>
            {/if}
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .panel {
    padding: 20px 22px;
    border: 1px solid var(--frame);
    border-radius: 8px;
    background: linear-gradient(180deg, rgba(38, 27, 16, 0.9), rgba(22, 15, 9, 0.9));
  }

  .head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin-bottom: 12px;
  }

  h2 {
    margin: 0;
    font-family: var(--display);
    font-size: 12px;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--gold);
  }

  .countdown {
    font-family: var(--display);
    font-size: 10px;
    letter-spacing: 0.1em;
    color: var(--text-faint);
  }

  ul { list-style: none; margin: 0; padding: 0; }

  li {
    padding: 12px 0;
    border-top: 1px solid var(--rule);
  }
  li:first-child { border-top: none; padding-top: 0; }
  li.done { opacity: 0.55; }

  .row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 10px;
  }

  .label {
    font-family: var(--body);
    font-size: 14.5px;
    color: var(--text);
  }

  .reward {
    font-family: var(--display);
    font-size: 11px;
    letter-spacing: 0.1em;
    color: var(--gold-bright);
  }

  .detail {
    margin: 2px 0 8px;
    font-family: var(--body);
    font-size: 12px;
    color: var(--text-faint);
  }

  .bar {
    height: 6px;
    border-radius: 3px;
    background: var(--ink-2);
    border: 1px solid var(--rule);
    overflow: hidden;
  }

  .fill {
    display: block;
    height: 100%;
    background: linear-gradient(90deg, #9c7c3c, var(--gold));
    transition: width 0.3s ease;
  }

  .foot { margin-top: 7px; }

  .count {
    font-family: var(--display);
    font-size: 10px;
    letter-spacing: 0.1em;
    color: var(--text-dim);
  }

  .claimed {
    font-family: var(--display);
    font-size: 10px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--text-faint);
  }

  button {
    padding: 4px 14px;
    border: 1px solid #8a6c3c;
    border-radius: 4px;
    background: linear-gradient(180deg, var(--gold), #9c7c3c);
    color: #2a1d10;
    cursor: pointer;
    font-family: var(--display);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }
  button:disabled { opacity: 0.6; cursor: default; }

  .muted {
    margin: 0;
    font-family: var(--body);
    font-size: 13.5px;
    color: var(--text-dim);
  }

  .error {
    margin: 0 0 10px;
    padding: 7px 10px;
    border: 1px solid var(--blood-deep);
    border-radius: 4px;
    background: rgba(140, 44, 36, 0.18);
    font-family: var(--body);
    font-size: 12.5px;
    color: #f0c4bd;
  }
</style>
