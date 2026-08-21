import { verifyTicket } from '../../../src/lib/net/ticket';

export { MatchRoom } from './MatchRoom';
export { Lobby } from './Lobby';

/**
 * The realtime Worker's front door.
 *
 * Its only job is to check the ticket and route to the right Durable Object.
 * Every decision that matters happens inside the objects; nothing here is
 * stateful, so it can be as boring as possible.
 */

const LOBBY_KEY = 'public';

function cors(origin: string | null, env: any): Record<string, string> {
  // The Pages app is the only browser origin allowed to talk to this Worker.
  const allowed = env.APP_ORIGIN ?? 'http://localhost:5173';
  return {
    'Access-Control-Allow-Origin': origin === allowed ? origin : allowed,
    'Access-Control-Allow-Headers': 'Content-Type, X-Ticket',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Credentials': 'true'
  };
}

/** A verified ticket from the query string or the X-Ticket header, or null. */
async function ticketFrom(url: URL, request: Request, env: any) {
  const secret = env.TICKET_SECRET;
  if (!secret) return null;
  const token = url.searchParams.get('ticket') ?? request.headers.get('X-Ticket');
  return token ? verifyTicket(secret, token) : null;
}

export default {
  async fetch(request: Request, env: any): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');
    const headers = cors(origin, env);

    if (request.method === 'OPTIONS') return new Response(null, { headers });

    // ── Lobby ────────────────────────────────────────────────
    //
    // The browser talks to this Worker directly rather than through the Pages
    // app. Pages *could* bind the Durable Object with `script_name`, but that
    // binding cannot resolve in local development — `vite dev` has no way to
    // reach a class defined in another project — and it would put a proxy hop
    // in front of every lobby poll for nothing. The signed ticket is what
    // proves the caller is a real signed-in user either way.
    if (url.pathname.startsWith('/lobby/')) {
      const ticket = await ticketFrom(url, request, env);
      if (!ticket) return new Response('Unauthorised.', { status: 401, headers });

      const lobby = env.LOBBY.get(env.LOBBY.idFromName(LOBBY_KEY));
      // Identity comes from the signed ticket, never from the body — a client
      // cannot act as another user by sending their id.
      const body = (await request.json().catch(() => ({}))) as any;
      const response = await lobby.fetch(
        new Request(url.toString(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...body, userId: ticket.userId, username: ticket.username })
        })
      );
      return new Response(await response.text(), {
        status: response.status,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    // ── Match socket ─────────────────────────────────────────
    if (url.pathname === '/match') {
      if (request.headers.get('Upgrade') !== 'websocket') {
        return new Response('Expected a WebSocket upgrade.', { status: 426, headers });
      }

      const ticket = await ticketFrom(url, request, env);
      if (!ticket) return new Response('Unauthorised.', { status: 401, headers });

      // The ticket names the game, so a valid ticket for game A cannot open a
      // socket to game B.
      const room = env.MATCH.get(env.MATCH.idFromName(ticket.gameId));
      return room.fetch(
        new Request(`${url.origin}/ws`, {
          headers: { Upgrade: 'websocket', 'X-Ticket': JSON.stringify(ticket) }
        })
      );
    }

    return new Response('Not found', { status: 404, headers });
  }
};
