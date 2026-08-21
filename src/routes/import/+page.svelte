<!--
  The import mechanic is shelved.

  Flashstone is now built entirely from the SL topic set (docs/plan/DECISIONS.md
  §1, §7), so there is no collection for an imported flashcard to join: the
  collection is a count of cards you own from a fixed, curated registry.

  The parsing pipeline it fed — `lib/parsers/csvParser.ts`, `mdParser.ts`,
  `fieldMapper.ts` — is untouched and still fully tested, and the previous
  version of this page is in git history. This route is unlinked from the nav;
  it exists so an old bookmark explains itself rather than 404ing.
-->
<svelte:head><title>Import — Flashstone</title></svelte:head>

<main>
  <h1>Import is shelved</h1>
  <p>
    Flashstone is now built from a single curated set of Design &amp; Technology
    cards, so there is nothing to import into. Every card you can collect is in the
    collection browser already — you unlock them by opening packs.
  </p>
  <a class="cta" href="/decks">Open the collection</a>
</main>

<style>
  main {
    max-width: 560px;
    margin: 0 auto;
    padding: 80px 16px 60px;
    text-align: center;
  }

  h1 {
    font-family: var(--display);
    font-size: 26px;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--gold-bright);
    margin: 0 0 14px;
  }

  p {
    font-family: var(--body);
    font-size: 16px;
    line-height: 1.55;
    color: var(--text-dim);
    text-wrap: pretty;
  }

  .cta {
    display: inline-block;
    margin-top: 20px;
    padding: 11px 24px;
    border: 1px solid #8a6c3c;
    border-radius: 4px;
    background: linear-gradient(180deg, var(--gold), #9c7c3c);
    color: #2a1d10;
    font-family: var(--display);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.16em;
    text-transform: uppercase;
  }
  .cta:hover { background: linear-gradient(180deg, var(--gold-bright), var(--gold)); }
</style>
