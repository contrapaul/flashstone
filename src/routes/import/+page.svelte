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
    goto('/deck');
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

  h1 { font-size: 24px; margin: 0 0 6px; }
  h2 { font-size: 16px; margin: 0 0 6px; }

  .lead, .hint {
    color: #9ca3cf;
    font-size: 13px;
    line-height: 1.5;
    margin: 0 0 16px;
    max-width: 70ch;
  }
  .hint { font-size: 12px; }

  .file input {
    font-size: 13px;
    color: #9ca3cf;
  }

  .error {
    color: #f87171;
    font-size: 13px;
    background: #2a1620;
    border: 1px solid #7f1d1d;
    border-radius: 8px;
    padding: 10px 12px;
  }

  section {
    margin-top: 28px;
    border-top: 1px solid #2a2a4a;
    padding-top: 18px;
  }

  .fields {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
    gap: 12px;
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 12px;
    color: #9ca3cf;
  }

  .req { color: #f87171; }

  select {
    background: #1e1e3c;
    color: #e5e7eb;
    border: 1px solid #3f3f6b;
    border-radius: 6px;
    padding: 7px 8px;
    font-size: 13px;
  }

  .preview-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 12px;
    margin-bottom: 14px;
  }

  .actions {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .count { font-size: 12px; color: #9ca3cf; }
  .bad { color: #f87171; }

  button {
    padding: 9px 18px;
    border-radius: 8px;
    border: none;
    background: #4f46e5;
    color: #fff;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
  }
  button:disabled { background: #2a2a4a; color: #6b7280; cursor: default; }

  .grid {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }
</style>
