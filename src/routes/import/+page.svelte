<script lang="ts">
  import { goto } from '$app/navigation';
  import CardPreview from '$lib/components/CardPreview.svelte';
  import { saveCollection } from '$lib/decks/storage';
  import { parseCSV, type RawRow } from '$lib/parsers/csvParser';
  import { mapRowsToCards, type FieldMapping, type ImportSource } from '$lib/parsers/fieldMapper';
  import { parseMD } from '$lib/parsers/mdParser';
  import { CardSchema } from '../../validators/card.validator';

  let fileName = '';
  let rows: RawRow[] = [];
  let headers: string[] = [];
  let source: ImportSource = 'csv';
  let error = '';

  let front = '';
  let back = '';
  let nameCol = '';
  let costCol = '';
  let attackCol = '';
  let healthCol = '';
  let rarityCol = '';

  // Common header names across Anki, Quizlet and hand-rolled sheets.
  const FRONT_HINTS = ['front', 'question', 'term', 'prompt', 'q'];
  const BACK_HINTS = ['back', 'answer', 'definition', 'a'];

  $: mapping = {
    front,
    back,
    name: nameCol || undefined,
    cost: costCol || undefined,
    attack: attackCol || undefined,
    health: healthCol || undefined,
    rarity: rarityCol || undefined
  } satisfies FieldMapping;

  $: ready = Boolean(front && back && rows.length > 0);
  $: cards = ready ? mapRowsToCards(rows, mapping, source) : [];
  $: invalid = cards.filter((c) => !CardSchema.safeParse(c).success).length;

  function guess(hints: string[], exclude?: string): string {
    const match = headers.find(
      (h) => h !== exclude && hints.includes(h.trim().toLowerCase())
    );
    return match ?? '';
  }

  async function onFile(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    error = '';
    fileName = file.name;
    source = /\.(md|markdown)$/i.test(file.name) ? 'md' : 'csv';

    try {
      const text = await file.text();
      const parsed = source === 'md' ? parseMD(text) : parseCSV(text);

      if (parsed.length === 0) {
        error = 'No rows found. A CSV needs a header row plus at least one card.';
        rows = [];
        headers = [];
        return;
      }

      rows = parsed;
      headers = [...new Set(parsed.flatMap((r) => Object.keys(r)))];
      front = guess(FRONT_HINTS) || headers[0] || '';
      back = guess(BACK_HINTS, front) || headers[1] || '';
      nameCol = costCol = attackCol = healthCol = rarityCol = '';
    } catch (e) {
      error = `Could not read that file: ${e instanceof Error ? e.message : 'unknown error'}`;
      rows = [];
      headers = [];
    }
  }

  function save() {
    if (!ready) return;
    saveCollection({
      name: fileName || 'Imported cards',
      cards,
      importedAt: new Date().toISOString()
    });
    goto('/decks');
  }
</script>

<svelte:head><title>Import — Flashstone</title></svelte:head>

<main>
  <h1>Import flashcards</h1>
  <p class="lead">
    Bring in a CSV or Markdown export. Every flashcard becomes a minion — the question is
    its name, the answer is its text. Stats are derived from the card's own words, so the
    same flashcard always makes the same minion.
  </p>

  <label class="file">
    <input type="file" accept=".csv,.tsv,.txt,.md,.markdown" on:change={onFile} />
  </label>

  {#if error}
    <p class="error">{error}</p>
  {/if}

  {#if headers.length > 0}
    <section class="mapping">
      <h2>Match your columns</h2>
      <p class="hint">
        {rows.length} row{rows.length === 1 ? '' : 's'} found in {fileName}. Only question
        and answer are required — supply the rest to hand-tune cards.
      </p>

      <div class="fields">
        <label>
          Question <span class="req">*</span>
          <select bind:value={front}>
            {#each headers as h}<option value={h}>{h}</option>{/each}
          </select>
        </label>
        <label>
          Answer <span class="req">*</span>
          <select bind:value={back}>
            {#each headers as h}<option value={h}>{h}</option>{/each}
          </select>
        </label>
        <label>
          Card name
          <select bind:value={nameCol}>
            <option value="">Use the question</option>
            {#each headers as h}<option value={h}>{h}</option>{/each}
          </select>
        </label>
        <label>
          Mana cost
          <select bind:value={costCol}>
            <option value="">Derive it</option>
            {#each headers as h}<option value={h}>{h}</option>{/each}
          </select>
        </label>
        <label>
          Attack
          <select bind:value={attackCol}>
            <option value="">Derive it</option>
            {#each headers as h}<option value={h}>{h}</option>{/each}
          </select>
        </label>
        <label>
          Health
          <select bind:value={healthCol}>
            <option value="">Derive it</option>
            {#each headers as h}<option value={h}>{h}</option>{/each}
          </select>
        </label>
        <label>
          Rarity
          <select bind:value={rarityCol}>
            <option value="">Derive it</option>
            {#each headers as h}<option value={h}>{h}</option>{/each}
          </select>
        </label>
      </div>
    </section>
  {/if}

  {#if ready}
    <section class="preview">
      <div class="preview-head">
        <h2>Preview</h2>
        <div class="actions">
          <span class="count">
            {cards.length} cards
            {#if invalid > 0}<span class="bad">· {invalid} invalid</span>{/if}
          </span>
          <button on:click={save} disabled={invalid > 0}>Save collection</button>
        </div>
      </div>

      <div class="grid">
        {#each cards.slice(0, 12) as card (card.id)}
          <CardPreview {card} />
        {/each}
      </div>
      {#if cards.length > 12}
        <p class="hint">…and {cards.length - 12} more.</p>
      {/if}
    </section>
  {/if}
</main>

<style>
  main {
    max-width: 1100px;
    margin: 0 auto;
    padding: 20px 16px 60px;
  }

  h1 {
    font-family: var(--display);
    font-size: 28px;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--gold-bright);
    margin: 0 0 8px;
  }

  h2 {
    font-family: var(--display);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--gold);
    margin: 0 0 8px;
  }

  .lead, .hint {
    font-family: var(--body);
    color: var(--text-dim);
    font-size: 15px;
    line-height: 1.55;
    margin: 0 0 18px;
    max-width: 70ch;
  }
  .hint { font-size: 13px; }

  .file input {
    font-family: var(--body);
    font-size: 14px;
    color: var(--text-dim);
  }

  /* The native control is a stark OS button against the dark frame. */
  .file input::file-selector-button {
    margin-right: 12px;
    padding: 9px 18px;
    border: 1px solid var(--frame);
    border-radius: 4px;
    background: linear-gradient(180deg, var(--panel), var(--ink-2));
    color: var(--gold);
    font-family: var(--display);
    font-size: 10.5px;
    font-weight: 700;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    cursor: pointer;
  }
  .file input::file-selector-button:hover {
    border-color: var(--frame-lit);
    color: var(--gold-bright);
  }

  .error {
    font-family: var(--body);
    color: var(--blood);
    font-size: 14px;
    background: rgba(141, 31, 22, 0.16);
    border: 1px solid var(--blood-deep);
    border-radius: 4px;
    padding: 11px 13px;
  }

  section {
    margin-top: 30px;
    border-top: 1px solid var(--rule);
    padding-top: 20px;
  }

  .fields {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
    gap: 14px;
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 5px;
    font-family: var(--display);
    font-size: 10px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--text-dim);
  }

  .req { color: var(--blood); }

  select {
    background: var(--ink-2);
    color: var(--text);
    border: 1px solid var(--frame);
    border-radius: 3px;
    padding: 8px;
    font-family: var(--body);
    font-size: 14px;
    letter-spacing: 0;
    text-transform: none;
  }
  select:focus { outline: none; border-color: var(--frame-lit); }

  .preview-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 12px;
    margin-bottom: 16px;
  }

  .actions {
    display: flex;
    align-items: center;
    gap: 14px;
  }

  .count {
    font-family: var(--display);
    font-size: 10px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--text-dim);
  }
  .bad { color: var(--blood); }

  button {
    padding: 10px 22px;
    border: 1px solid #8a6c3c;
    border-radius: 4px;
    background: linear-gradient(180deg, var(--gold), #9c7c3c);
    color: #2a1d10;
    font-family: var(--display);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    cursor: pointer;
  }
  button:hover:not(:disabled) {
    background: linear-gradient(180deg, var(--gold-bright), var(--gold));
  }
  button:disabled {
    background: var(--ink-2);
    border-color: var(--rule);
    color: var(--text-faint);
    cursor: default;
  }

  .grid {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }
</style>
