import { beforeAll, describe, expect, it } from 'vitest';
import { MatchRoom } from './MatchRoom';
import { starterDeck } from '../../../src/lib/data/starter';

/**
 * How a match is announced to the two people playing it.
 *
 * This exists because of a bug that made every online match unplayable for the
 * player who arrived first. They were sent `waiting` when they connected alone,
 * and nothing ever revised it — `joined` was sent once, at socket-open time, so
 * the second player's arrival told only the second player. The first player's
 * board stayed uninteractive, they missed turn after turn on the 60s clock, and
 * the missed-turn rule handed the match to their opponent. From the other side
 * it looked like an opponent who never moved.
 */

// ── Workers globals, as far as this object touches them ─────

class FakeSocket {
  accepted = false;
  sent: any[] = [];
  listeners = new Map<string, ((e: any) => void)[]>();

  accept() {
    this.accepted = true;
  }
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  addEventListener(type: string, fn: (e: any) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }
  /** Messages of one type, in the order the room sent them. */
  ofType(type: string) {
    return this.sent.filter((m) => m.type === type);
  }
  types() {
    return this.sent.map((m) => m.type);
  }
}

/** The sockets handed out, in connection order, so a test can read them back. */
const servers: FakeSocket[] = [];

beforeAll(() => {
  (globalThis as any).WebSocketPair = function () {
    const client = new FakeSocket();
    const server = new FakeSocket();
    servers.push(server);
    return { 0: client, 1: server };
  };

  // Node's Response rejects status 101 outright, and this object returns one on
  // every successful upgrade. Only the status is ever read back.
  (globalThis as any).Response = class {
    status: number;
    constructor(_body?: unknown, init?: { status?: number }) {
      this.status = init?.status ?? 200;
    }
  };
});

function fakeState() {
  return {
    id: { toString: () => 'room-1' },
    storage: { setAlarm: async () => {} }
  } as any;
}

/** Both players own the same legal starter deck. */
function fakeEnv() {
  const deck = starterDeck();
  const row = {
    name: deck.name,
    card_ids: JSON.stringify(deck.cardIds),
    class: deck.class
  };
  const statement = (): any => ({
    bind: () => statement(),
    async first() {
      return row;
    },
    async all() {
      return { results: [] };
    },
    async run() {
      return { meta: { changes: 1 } };
    }
  });
  return { DB: { prepare: () => statement(), batch: async () => [] } };
}

const connect = (room: MatchRoom, userId: string) =>
  room.fetch(
    new Request('http://room/ws', {
      headers: {
        Upgrade: 'websocket',
        'X-Ticket': JSON.stringify({
          userId,
          username: userId,
          gameId: 'g1',
          cardBack: 'default',
          expires: Date.now() + 60_000
        })
      }
    })
  );

describe('starting an online match', () => {
  it('tells BOTH players the match has started, not just the second to arrive', async () => {
    servers.length = 0;
    const room = new MatchRoom(fakeState(), fakeEnv());

    await connect(room, 'host');
    const host = servers[0];
    // Alone in the room, the host is waiting — correct, so far.
    expect(host.types()).toContain('waiting');
    expect(host.ofType('joined')).toHaveLength(1);

    await connect(room, 'guest');
    const guest = servers[1];

    // The regression: before the fix the host received nothing further, and sat
    // on `waiting` — uninteractive — for the whole match.
    const hostJoins = host.ofType('joined');
    expect(hostJoins.length).toBeGreaterThan(1);
    expect(host.types().lastIndexOf('joined')).toBeGreaterThan(host.types().lastIndexOf('waiting'));

    // And each is told their own side, not a shared message.
    expect(hostJoins.at(-1).you).toBe('player');
    expect(guest.ofType('joined').at(-1).you).toBe('ai');
  });

  it('names the opponent to the player who was already sitting there', async () => {
    servers.length = 0;
    const room = new MatchRoom(fakeState(), fakeEnv());

    await connect(room, 'host');
    await connect(room, 'guest');

    // The host connected when there was nobody to name; the start announcement
    // is the only chance to tell them who turned up.
    expect(servers[0].ofType('joined').at(-1).opponent?.username).toBe('guest');
    expect(servers[1].ofType('joined').at(-1).opponent?.username).toBe('host');
  });

  it('deals both players a board once the second arrives', async () => {
    servers.length = 0;
    const room = new MatchRoom(fakeState(), fakeEnv());

    await connect(room, 'host');
    expect(servers[0].ofType('state')).toHaveLength(0);

    await connect(room, 'guest');
    for (const socket of servers) expect(socket.ofType('state')).toHaveLength(1);
  });

  it('puts a running turn clock in the state it sends', async () => {
    servers.length = 0;
    const room = new MatchRoom(fakeState(), fakeEnv());

    await connect(room, 'host');
    await connect(room, 'guest');

    // Nothing renders a countdown that arrives as 0, which is how the timer
    // stayed invisible for so long.
    const state = servers[0].ofType('state')[0];
    expect(state.view.turnEndsIn).toBeGreaterThan(0);
    expect(state.view.turnEndsIn).toBeLessThanOrEqual(60);
  });
});
