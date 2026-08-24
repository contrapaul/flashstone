<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import QuestPanel from './QuestPanel.svelte';

  /**
   * The returning player's welcome: today's quests, floating over a blurred
   * home page.
   *
   * It renders `QuestPanel` rather than its own list — the panel already owns
   * fetching, claiming and the refresh countdown, and a second copy of that
   * would be a second thing to keep correct. This component is the frame and
   * the dismissal, nothing more.
   *
   * The blue glow is deliberate against a page that is otherwise entirely gold:
   * it reads as an interruption rather than as more furniture, and blue is
   * already in the palette as the mana colour.
   */
  const dispatch = createEventDispatcher<{ close: void; claimed: number }>();

  let card: HTMLDivElement;

  onMount(() => {
    // Focus the dialog, not the first Claim button — the player should read the
    // quests before the keyboard is aimed at claiming one.
    card?.focus();
  });

  function onKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') dispatch('close');
  }
</script>

<svelte:window on:keydown={onKeydown} />

<!--
  The backdrop closes on click; the card stops the click from reaching it, so
  pressing Claim inside does not also dismiss the dialog.
-->
<div
  class="scrim"
  role="button"
  tabindex="-1"
  aria-label="Dismiss quests"
  on:click|self={() => dispatch('close')}
  on:keydown={(e) => e.key === 'Enter' && dispatch('close')}
>
  <div
    class="card"
    bind:this={card}
    role="dialog"
    aria-modal="true"
    aria-labelledby="spotlight-title"
    tabindex="-1"
  >
    <header>
      <h2 id="spotlight-title">Today's quests</h2>
      <p>Three every day, and they reset at UTC midnight.</p>
    </header>

    <div class="tracks">
      <QuestPanel on:claimed={(e) => dispatch('claimed', e.detail)} />
    </div>

    <button class="dismiss" on:click={() => dispatch('close')}>Let's play</button>
  </div>
</div>

<style>
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 60;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px 16px;
    overflow-y: auto;
    cursor: default;
    background: rgba(6, 4, 2, 0.62);
    /* The blur is what makes the card read as floating above the page rather
       than as another panel on it. */
    backdrop-filter: blur(7px);
    -webkit-backdrop-filter: blur(7px);
    animation: fade 0.22s ease;
  }

  .card {
    position: relative;
    width: min(460px, 100%);
    max-height: 100%;
    overflow-y: auto;
    padding: 24px 24px 20px;
    border-radius: 12px;
    border: 1px solid var(--mana-lit);
    background: linear-gradient(180deg, rgba(24, 20, 30, 0.97), rgba(12, 10, 16, 0.97));
    box-shadow:
      0 0 0 1px rgba(127, 196, 255, 0.28),
      0 0 26px rgba(74, 143, 224, 0.5),
      0 0 70px rgba(74, 143, 224, 0.22),
      0 22px 60px rgba(0, 0, 0, 0.6);
    /* Rise on entry, then drift — the float is what sells it as detached from
       the page behind it. */
    animation:
      rise 0.26s cubic-bezier(0.2, 0.9, 0.3, 1),
      float 5.5s ease-in-out 0.26s infinite;
  }
  .card:focus { outline: none; }

  header { margin-bottom: 16px; text-align: center; }

  h2 {
    margin: 0;
    font-family: var(--display);
    font-size: 19px;
    font-weight: 700;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--mana-lit);
    text-shadow: 0 0 20px rgba(127, 196, 255, 0.45);
  }

  header p {
    margin: 7px 0 0;
    font-family: var(--body);
    font-size: 13.5px;
    font-style: italic;
    color: var(--text-dim);
  }

  /* The panel inside keeps its own gold styling — only its outer frame is
     dropped, so the two tracks read as content of this card. */
  .tracks :global(.panel) {
    border-color: rgba(127, 196, 255, 0.22);
    background: rgba(10, 9, 14, 0.5);
  }
  .tracks :global(.panel + .panel) { margin-top: 12px; }

  .dismiss {
    display: block;
    width: 100%;
    margin-top: 16px;
    padding: 11px 20px;
    border: 1px solid var(--mana-lit);
    border-radius: 4px;
    background: linear-gradient(180deg, var(--mana), #2f6bb0);
    color: #eaf5ff;
    cursor: pointer;
    font-family: var(--display);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.18em;
    text-transform: uppercase;
  }
  .dismiss:hover {
    background: linear-gradient(180deg, var(--mana-lit), var(--mana));
    color: #0b1622;
  }

  @keyframes fade {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes rise {
    from { opacity: 0; transform: translateY(14px) scale(0.97); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }

  @keyframes float {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-7px); }
  }

  /* A drifting dialog is a problem for anyone who needs stillness to read. */
  @media (prefers-reduced-motion: reduce) {
    .scrim, .card { animation: none; }
  }
</style>
