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
    max-width: 740px;
    margin: 0 auto;
    padding: 40px 16px 80px;
    line-height: 1.65;
  }

  h1 {
    font-family: var(--display);
    font-size: 30px;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--gold-bright);
    margin: 0 0 10px;
  }

  h2 {
    font-family: var(--display);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--gold);
    margin: 0 0 10px;
  }

  .lead {
    font-family: var(--body);
    font-size: 16px;
    font-style: italic;
    color: var(--text-dim);
    margin: 0;
  }

  section {
    margin-top: 30px;
    border-top: 1px solid var(--rule);
    padding-top: 20px;
  }

  p, li, dd {
    font-family: var(--body);
    font-size: 15px;
    color: var(--text);
  }
  p { margin: 0 0 10px; }

  ul { margin: 0; padding-left: 20px; }
  li { margin-bottom: 7px; }

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

  .cta {
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

  .cta.ghost {
    background: linear-gradient(180deg, var(--panel), var(--ink-2));
    border-color: var(--frame);
    color: var(--gold);
  }
  .cta.ghost:hover { border-color: var(--frame-lit); color: var(--gold-bright); }
</style>
