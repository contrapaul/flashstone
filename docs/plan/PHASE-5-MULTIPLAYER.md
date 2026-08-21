# Phase 5 — Play Online

**Covers list item 1.**
**Depends on:** Phase 3 (accounts, D1, session cookies). **Blocks:** nothing.

`Play Online` → a lobby screen listing joinable public games → create a game (public by
default, with a toggle to make it private) → an invite link either way → a
server-authoritative match.

This is the largest phase. Read all of §1 before writing code; the deployment shape is
the part that goes wrong.

---

## 1. Architecture — decide and record this first

**The constraint:** Cloudflare Pages **cannot define Durable Object classes.** It can
only *bind* to DOs exported by a separate Worker. Flashstone is a Pages project
(`pages_build_output_dir` in `wrangler.toml`), and Phase 3 keeps it there because that is
where `time` and `bloodbowl` live.

Two ways out. **Pick one, write the choice and the reason into `HANDOVER.md` §6, and do
not drift between them.**

**Option A — Pages + a separate realtime Worker (default).**
- `workers/realtime/` is its own wrangler project exporting `MatchRoom` and `Lobby`.
  Deployed separately (`npm run deploy:realtime`).
- The Pages app binds it via `[[durable_objects.bindings]]` with `script_name = "flashstone-realtime"`
  for server-to-server calls (creating a game, listing the lobby).
- The **browser opens its WebSocket directly against the realtime Worker's route**, not
  through Pages — Pages would otherwise have to proxy every socket.
- Auth across the boundary: the Pages API mints a **short-lived signed ticket** (HMAC over
  `userId + matchId + expiry`, shared secret in both projects' env) from the session
  cookie; the Worker verifies it on connect. Do not send the session cookie cross-origin.
- Cost: two deployments, one shared secret, one extra DNS route.

**Option B — migrate the whole app to Workers static assets.**
- One Worker serves SvelteKit, binds D1, and defines the DO classes inline. No ticket, no
  second deploy.
- Cost: `@sveltejs/adapter-cloudflare` **4.9.0 as installed emits a Pages `_worker.js`**
  and does not target Workers static assets. This means an adapter major bump and a
  re-verification of the whole build and deploy path — against `HANDOVER.md` §4's warning
  about casual dependency bumps. It also diverges from Paul's other two sites.

- [ ] **1.1** **Spike, timeboxed:** confirm which `@sveltejs/adapter-cloudflare` version
      targets Workers static assets and whether it holds Svelte 4 / Kit 2.70 without
      forcing a runes migration. If it is clean, Option B is the better long-term shape.
      If it is not, take Option A and stop looking.
      → **verify:** `npm run build` succeeds and the artifact serves `/` locally under the
      chosen shape. Record the outcome in this file before step 2.

> **Fallback if DOs prove more trouble than they are worth:** a turn-based card game does
> not strictly need sockets. The lobby and match state fit in D1, with the client polling
> every ~1.5s. Materially worse feel, materially less infrastructure, and it needs nothing
> beyond Phase 3. Keep this in your pocket; do not start here.

## 2. The engine, server-side

`src/lib/engine/` is pure TypeScript with no Svelte imports and no DOM — it already runs
in `vitest`, so it will run in a DO **unchanged**. Protect that property.

- [ ] **2.1** Add a test that imports every module under `src/lib/engine/` and asserts none
      of them reach for `window`, `document` or `localStorage`.
      → **verify:** the test passes now and fails if someone later adds a DOM dependency.

- [ ] **2.2** Define the wire protocol in `src/lib/net/protocol.ts`, shared by client and
      Worker: client → server **intents** (`playCard`, `attack`, `endTurn`, `concede`) and
      server → client **state + the event queue** (`HANDOVER.md` §5 — the queue is exactly
      what the client needs to animate; reuse it, do not invent a second channel).
      → **verify:** Zod schemas for both directions; tests for a malformed intent.
      **Phase 1B adds a target to `playCard`** — a `Chosen` spell's target crosses the
      wire and must be re-validated server-side against `spellTargets`, never trusted.

- [ ] **2.3** `MatchRoom` DO: holds one `MatchState`, accepts intents **only from the
      player whose turn it is**, applies them through the existing `playCard`/`attack`/
      `endTurn`, and broadcasts the resulting state and drained events to both sockets.
      Illegal intents are rejected, not applied — the engine already returns a boolean for
      legality, so this is a guard, not new logic.
      → **verify:** unit-test the room's reducer directly (no socket): an out-of-turn
      intent is rejected; an illegal play is rejected; a legal one advances state.

- [ ] **2.4** Both decks are **loaded server-side from D1** by user id and validated with
      `deck.ts` before the match starts. A client never supplies its own card list.
      → **verify:** a client that sends a deck is ignored; a user with an illegal saved
      deck cannot start a match.

- [ ] **2.5** Disconnect handling: a socket drop reconnects into the same room within a
      grace period (~60s) and receives full state. A turn timer (~75s) auto-ends the turn;
      exceeding it repeatedly concedes.
      → **verify:** kill the tab mid-match, reopen, land back in the same match.

## 3. The lobby

- [ ] **3.1** `Lobby` DO: the registry of open games. `create(userId, isPublic)`,
      `list()` (public and still open only), `join(gameId, userId)`, plus expiry of stale
      entries (~10 min unjoined).
      → **verify:** a created public game appears in `list()`; once joined it does not;
      a stale one is gone.

- [ ] **3.2** `/online` route — Paul's flow, exactly:
      1. **Play Online** on the home screen goes here.
      2. **Create game** → the game is created **public by default**, with a **toggle to
         turn public off**, and produces an **invite link** in both cases.
      3. Public games appear in the list on this screen for anyone to click and join.
      → **verify:** two browser profiles — A creates public, B sees it and joins, they
      play. Then A creates private, B does **not** see it, but B can join via the link.

- [ ] **3.3** Invite links are `/online/<gameId>` and work for a signed-in user who was
      not the creator. A signed-out visitor is sent to sign in and returned to the link.
      → **verify:** both paths, in a fresh private window.

- [ ] **3.4** The lobby list refreshes live (socket to the `Lobby` DO) or on a short poll.
      Live is nicer; a 3s poll is acceptable and much simpler — **choose and comment why**.
      → **verify:** A creates a game; B's open list shows it without a manual reload.

## 4. Playing the match

- [ ] **4.1** `/play` works for both local-AI and online matches behind one interface — a
      "match source" abstraction with a local implementation (today's synchronous engine
      calls) and a remote one (send intent, await broadcast). **The board UI should not
      branch on which mode it is in.**
      → **verify:** the same component renders both; the AI match still plays exactly as
      it does today.

- [ ] **4.2** The client **drains the server's event queue** through the existing `drain()`
      timeline. `myTurn` stays gated on `!draining` (`HANDOVER.md` §5).
      → **verify:** an online attack animates the same as an AI one; no input is accepted
      mid-playback.

- [ ] **4.3** Show the opponent's identity — username and their chosen card back (Phase 4
      §5), which is what Phase 2 §5.3 stubbed. Gold variants the opponent plays render as
      gold for both players — the variant travels with the card in the broadcast state.
      → **verify:** the opponent's hand shows *their* back; a gold card they play shimmers
      on your screen too.

- [ ] **4.4** On a win, the `MatchRoom` DO awards **40 gold** by calling the Phase 4 reward
      endpoint (or writing D1 directly), **once**, keyed on match id. This is the
      authoritative award — the client is not consulted.
      → **verify:** win online, check the balance; replay the award, balance unchanged.

- [ ] **4.5** Both players' **win-2-games quest** progress advances from the server.
      → **verify:** the quest ticks for the winner; check whether Paul wants losses to
      count toward "win 2 games" — they should not.

---

## Done when

- `npm test` green, `npm run check` 0 errors, both deploy targets (or the one, under
  Option B) build and deploy.
- Two accounts in two browsers complete a full public-lobby match and a full
  invite-link match.
- A mid-match reload rejoins; a disconnect does not corrupt state.
- No client can play out of turn, play a card it does not own, or play an illegal deck —
  verified by actually sending crafted intents, not by inspection.
- `HANDOVER.md` §3 loses "Opponent is a local scripted AI. No multiplayer"; §6 gains the
  deployment shape chosen in §1.

## Found along the way

_Real problems noticed but out of scope — record here, do not fix silently._
