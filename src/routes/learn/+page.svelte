<svelte:head><title>Learn to play — Flashstone</title></svelte:head>

<main>
  <h1>Learn to play</h1>
  <p class="lead">
    Flashstone is a turn-based card game built from your own study material. Your
    flashcards become minions, so the reading happens while you play — there is no quiz
    interrupting the match.
  </p>

  <section>
    <h2>Winning</h2>
    <p>
      Both heroes start at 30 health. Reduce your opponent's to zero. If both hit zero at
      once, the match is a draw.
    </p>
  </section>

  <section>
    <h2>Your turn</h2>
    <ul>
      <li>You gain one mana crystal per turn, up to ten, and refill to full each turn.</li>
      <li>You draw one card at the start of every turn.</li>
      <li>
        Run out of cards and you take <strong>fatigue</strong> damage instead — one, then
        two, then three, climbing every draw. Long games end this way.
      </li>
      <li>You may hold at most seven minions on the board.</li>
      <li>
        The player going second gets <strong>The Coin</strong>: a free card granting one
        extra mana for that turn only.
      </li>
    </ul>
  </section>

  <section>
    <h2>Combat</h2>
    <ul>
      <li>
        A minion can't attack the turn it lands — it has summoning sickness — unless it has
        Charge.
      </li>
      <li>
        Attacking trades damage both ways: your minion deals its Attack to the target, and
        takes the target's Attack back. Anything at zero health dies.
      </li>
      <li>Each minion attacks once per turn, or twice with Windfury.</li>
      <li>You can attack the enemy hero directly, unless a Taunt minion is in the way.</li>
    </ul>
  </section>

  <section>
    <h2>Keywords</h2>
    <dl>
      <div><dt>Taunt</dt><dd>Enemies must attack this minion before anything else.</dd></div>
      <div><dt>Charge</dt><dd>Can attack the turn it is played.</dd></div>
      <div><dt>Divine Shield</dt><dd>Ignores the damage from the first hit it takes.</dd></div>
      <div><dt>Windfury</dt><dd>Attacks twice per turn.</dd></div>
    </dl>
  </section>

  <section>
    <h2>How your flashcards become cards</h2>
    <p>
      Import a CSV or Markdown export and every flashcard becomes a minion. The
      <strong>question becomes the card's name</strong> and the
      <strong>answer becomes its text</strong>, so your board is a review sheet.
    </p>
    <p>
      If your file has cost, attack, health, or rarity columns, those are used directly.
      Otherwise they are derived from the card's own words — the same flashcard always
      produces the same minion, so your collection is stable between imports.
    </p>
    <p>
      Rarity decides keywords. Commons are plain; rarer cards earn one, and legendaries
      always have one.
    </p>
  </section>

  <section>
    <h2>Deck rules</h2>
    <p>
      A deck is exactly 30 cards with at most two copies of any one card — so you need at
      least 15 flashcards to field a full deck. Build one by hand on the Decks page, or
      press Auto-build and adjust from there.
    </p>
  </section>

  <p class="cta-row">
    <a class="cta" href="/import">Import flashcards</a>
    <a class="cta ghost" href="/play">Play with the demo deck</a>
  </p>
</main>

<style>
  main {
    max-width: 720px;
    margin: 0 auto;
    padding: 28px 16px 70px;
    line-height: 1.6;
  }

  h1 { font-size: 26px; margin: 0 0 8px; }
  h2 { font-size: 15px; margin: 0 0 8px; color: #a5b4fc; }

  .lead { color: #9ca3cf; font-size: 14px; margin: 0; }

  section {
    margin-top: 26px;
    border-top: 1px solid #2a2a4a;
    padding-top: 18px;
  }

  p, li, dd { font-size: 13px; color: #cbd5f5; }
  p { margin: 0 0 10px; }

  ul { margin: 0; padding-left: 20px; }
  li { margin-bottom: 6px; }

  dl { margin: 0; }
  dl > div {
    display: flex;
    gap: 10px;
    margin-bottom: 6px;
    flex-wrap: wrap;
  }
  dt {
    font-size: 13px;
    font-weight: 700;
    color: #fbbf24;
    flex: 0 0 110px;
  }
  dd { margin: 0; flex: 1; min-width: 200px; }

  strong { color: #e5e7eb; }

  .cta-row {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    margin-top: 30px;
  }

  .cta {
    padding: 10px 20px;
    background: #4f46e5;
    color: #fff;
    border-radius: 8px;
    text-decoration: none;
    font-size: 14px;
    font-weight: 600;
  }
  .cta.ghost {
    background: #1e1e3c;
    color: #cbd5f5;
    border: 1px solid #3f3f6b;
  }
</style>
