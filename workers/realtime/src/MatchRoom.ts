import type { Card } from '../../../src/types/cards';
import type { MatchState, PlayerId } from '../../../src/lib/engine/state';
import { resolveDeck, type Deck } from '../../../src/lib/decks/deck';
import { cardById } from '../../../src/lib/data/cards';
import {
  MAX_MISSED_TURNS,
  TURN_SECONDS,
  applyMessage,
  createRoomState,
  forceEndTurn,
  viewFor
} from '../../../src/lib/net/room';
import { parseClientMessage, type ServerMessage } from '../../../src/lib/net/protocol';
import type { Ticket } from '../../../src/lib/net/ticket';

/**
 * One match, one Durable Object.
 *
 * The engine runs *here*, not in either browser. A client sends intents and
 * receives state; it is never asked what happened and never told the opponent's
 * hand. Everything that decides an outcome — whose turn it is, what a deck
 * contains, who won — is read from D1 or computed here.
 */

interface Seat {
  socket: WebSocket;
  ticket: Ticket;
  side: PlayerId;
}

export class MatchRoom {
  private state: DurableObjectState;
  private env: any;

  private match: MatchState | null = null;
  private seats = new Map<string, Seat>();
  /** userId → side, so a reconnect returns to the same seat. */
  private sides = new Map<string, PlayerId>();
  private info = new Map<PlayerId, { username: string; cardBack: string }>();
  private turnDeadline = 0;
  private missed: Record<PlayerId, number> = { player: 0, ai: 0 };
  private paidOut = false;

  constructor(state: DurableObjectState, env: any) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.endsWith('/ws')) return this.handleSocket(request);
    return new Response('Not found', { status: 404 });
  }

  private async handleSocket(request: Request): Promise<Response> {
    const ticket = JSON.parse(request.headers.get('X-Ticket') ?? 'null') as Ticket | null;
    if (!ticket) return new Response('Unauthorised', { status: 401 });

    // A third player cannot watch. Reconnecting to a seat you already hold is
    // fine — that is exactly what a dropped connection looks like.
    if (!this.sides.has(ticket.userId) && this.sides.size >= 2) {
      return new Response('This match is full.', { status: 409 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    server.accept();

    const side: PlayerId = this.sides.get(ticket.userId) ?? (this.sides.size === 0 ? 'player' : 'ai');
    this.sides.set(ticket.userId, side);
    this.info.set(side, { username: ticket.username, cardBack: ticket.cardBack });

    const seat: Seat = { socket: server, ticket, side };
    this.seats.set(ticket.userId, seat);

    server.addEventListener('message', (event) => {
      void this.onMessage(seat, String(event.data));
    });
    const drop = () => {
      // The seat is kept: `sides` still holds it, so a reconnect lands back in
      // the same chair with full state rather than starting a new match.
      if (this.seats.get(ticket.userId) === seat) this.seats.delete(ticket.userId);
      this.broadcast({ type: 'opponentLeft' }, side);
    };
    server.addEventListener('close', drop);
    server.addEventListener('error', drop);

    this.send(seat, { type: 'joined', you: side, opponent: this.opponentInfo(side) });

    if (this.sides.size < 2) {
      this.send(seat, { type: 'waiting' });
    } else {
      // A failure here — a database blip, a missing deck — must not take the
      // socket down with it. The players get a message they can act on instead
      // of a connection that refuses to open for no stated reason.
      try {
        if (!this.match) await this.start();
        this.pushState([]);
      } catch (e) {
        console.error('Failed to start match:', e);
        this.broadcast({
          type: 'error',
          message: 'Could not start the match. Check that both players have a saved deck.'
        });
      }
    }

    return new Response(null, { status: 101, webSocket: client });
  }

  private opponentInfo(side: PlayerId) {
    const other: PlayerId = side === 'player' ? 'ai' : 'player';
    return this.info.get(other) ?? null;
  }

  /**
   * Starts the match, loading **both decks from D1**.
   *
   * A client never supplies its card list. This is the single most important
   * line in the file: it is what stops a player fielding thirty legendaries.
   */
  private async start(): Promise<void> {
    const seats = [...this.sides.entries()];
    const decks = await Promise.all(seats.map(([userId]) => this.loadDeck(userId)));

    // An empty deck is not a playable match — say so rather than dealing a
    // fatigue-only game neither player understands.
    const short = decks.findIndex((d) => d.length === 0);
    if (short >= 0) throw new Error(`player ${seats[short][0]} has no saved deck`);

    const bySide = new Map<PlayerId, Card[]>();
    seats.forEach(([, side], i) => bySide.set(side, decks[i]));

    this.match = createRoomState(
      bySide.get('player') ?? [],
      bySide.get('ai') ?? [],
      Math.floor(Math.random() * 100000)
    );
    this.resetTurnClock();
  }

  private async loadDeck(userId: string): Promise<Card[]> {
    const row = await this.env.DB.prepare(
      'SELECT name, card_ids FROM decks WHERE user_id = ?1 ORDER BY updated_at DESC LIMIT 1'
    )
      .bind(userId)
      .first();

    if (!row) return [];
    try {
      const cardIds = JSON.parse(String(row.card_ids));
      if (!Array.isArray(cardIds)) return [];
      const deck: Deck = { name: String(row.name), cardIds: cardIds.map(String) };
      // Resolved through the registry, so an id that no longer exists is simply
      // dropped rather than becoming an undefined card mid-match.
      return resolveDeck(deck).filter((c) => cardById(c.id));
    } catch {
      return [];
    }
  }

  private async onMessage(seat: Seat, raw: string): Promise<void> {
    const message = parseClientMessage(raw);
    if (!message) return this.send(seat, { type: 'error', message: 'Malformed message.' });

    if (message.type === 'hello' || message.type === 'resync') {
      if (this.match) this.sendState(seat, []);
      return;
    }
    if (!this.match) return this.send(seat, { type: 'error', message: 'The match has not started.' });

    const result = applyMessage(this.match, seat.side, message);
    if (!result.ok) return this.send(seat, { type: 'error', message: result.error ?? 'Rejected.' });

    if (message.type === 'endTurn' || message.type === 'playCard') this.resetTurnClock();
    if (message.type === 'endTurn') this.missed[seat.side] = 0;

    await this.publish(result.events);
  }

  private resetTurnClock(): void {
    this.turnDeadline = Date.now() + TURN_SECONDS * 1000;
    void this.state.storage.setAlarm(this.turnDeadline);
  }

  /** The turn timer. Two missed turns in a row concedes. */
  async alarm(): Promise<void> {
    if (!this.match || this.match.winner) return;
    if (Date.now() < this.turnDeadline - 500) {
      void this.state.storage.setAlarm(this.turnDeadline);
      return;
    }

    const stalled = this.match.current;
    this.missed[stalled] += 1;

    if (this.missed[stalled] > MAX_MISSED_TURNS) {
      this.match.winner = stalled === 'player' ? 'ai' : 'player';
      this.match.log.push(`${stalled} timed out.`);
      await this.publish([]);
      return;
    }

    const events = forceEndTurn(this.match);
    this.resetTurnClock();
    await this.publish(events);
  }

  private async publish(events: any[]): Promise<void> {
    this.pushState(events);
    if (this.match?.winner) await this.finish();
  }

  private pushState(events: any[]): void {
    for (const seat of this.seats.values()) this.sendState(seat, events);
  }

  private sendState(seat: Seat, events: any[]): void {
    if (!this.match) return;
    const secondsLeft = Math.max(0, Math.round((this.turnDeadline - Date.now()) / 1000));
    this.send(seat, { type: 'state', view: viewFor(this.match, seat.side, secondsLeft), events });
  }

  /**
   * Pays the winner, once.
   *
   * Written here rather than trusted from the client: this object is the only
   * thing that knows who actually won. Keyed on the room's own id so a replay
   * or a reconnect cannot pay twice.
   */
  private async finish(): Promise<void> {
    if (!this.match?.winner || this.paidOut) return;
    this.paidOut = true;

    const winner = this.match.winner;
    const secondsLeft = 0;

    let awarded = 0;
    if (winner !== 'draw') {
      const entry = [...this.sides.entries()].find(([, side]) => side === winner);
      if (entry) {
        awarded = await this.payWinner(entry[0]);
      }
    }

    for (const seat of this.seats.values()) {
      if (!this.match) break;
      this.send(seat, {
        type: 'over',
        view: viewFor(this.match, seat.side, secondsLeft),
        winner,
        goldAwarded: seat.side === winner ? awarded : 0
      });
    }
  }

  private async payWinner(userId: string): Promise<number> {
    const GOLD_ONLINE_WIN = 40;
    const ref = `online:${this.state.id.toString()}`;
    try {
      const claimed = await this.env.DB.prepare(
        "SELECT amount FROM gold_awards WHERE user_id = ?1 AND source = 'win' AND ref = ?2"
      )
        .bind(userId, ref)
        .first();
      if (claimed) return 0;

      await this.env.DB.batch([
        this.env.DB.prepare(
          "INSERT INTO gold_awards (user_id, source, ref, amount, created_at) VALUES (?1, 'win', ?2, ?3, ?4)"
        ).bind(userId, ref, GOLD_ONLINE_WIN, Date.now()),
        this.env.DB.prepare('UPDATE profiles SET gold = gold + ?1 WHERE user_id = ?2').bind(
          GOLD_ONLINE_WIN,
          userId
        ),
        // The "win 2 games" quest, advanced by the authority rather than by the
        // client — the one counter that cannot be faked.
        this.env.DB.prepare(
          `INSERT INTO quests (user_id, day, quest_id, progress) VALUES (?1, ?2, 'win2', 1)
           ON CONFLICT(user_id, day, quest_id) DO UPDATE SET progress = progress + 1`
        ).bind(userId, Math.floor(Date.now() / 86_400_000))
      ]);
      return GOLD_ONLINE_WIN;
    } catch (e) {
      console.error('Payout failed:', e);
      return 0;
    }
  }

  private send(seat: Seat, message: ServerMessage): void {
    try {
      seat.socket.send(JSON.stringify(message));
    } catch {
      this.seats.delete(seat.ticket.userId);
    }
  }

  private broadcast(message: ServerMessage, except?: PlayerId): void {
    for (const seat of this.seats.values()) {
      if (seat.side !== except) this.send(seat, message);
    }
  }
}
