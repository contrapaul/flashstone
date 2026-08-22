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

/**
 * Which browser origins may talk to this Worker.
 *
 * `APP_ORIGIN` is a comma-separated allowlist rather than one value, because
 * there are legitimately several: local development, the production domain, and
 * `*.pages.dev`. Pages preview deployments get a per-build subdomain
 * (`<hash>.flashstone.pages.dev`) that cannot be enumerated ahead of time, so
 * exact entries are matched literally and a leading `*.` matches one level of
 * subdomain — never a bare wildcard.
 */
function allowedOrigins(env: any): string[] {
  return String(env.APP_ORIGIN ?? 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function isAllowed(origin: string | null, env: any): boolean {
  if (!origin) return false;
  return allowedOrigins(env).some((allowed) => {
    if (allowed === origin) return true;
    if (!allowed.startsWith('*.')) return false;
    // `*.example.com` matches `https://anything.example.com`, and nothing deeper.
    const suffix = allowed.slice(1);
    try {
      const host = new URL(origin).host;
      const rest = host.slice(0, host.length - suffix.length);
      return host.endsWith(suffix) && rest.length > 0 && !rest.includes('.');
    } catch {
      return false;
    }
  });
}

function cors(origin: string | null, env: any): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'Content-Type, X-Ticket',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Credentials': 'true',
    Vary: 'Origin'
  };
  // Echoing an unrecognised origin back would defeat the check entirely, so an
  // origin that is not on the list simply gets no allow header.
  if (isAllowed(origin, env)) headers['Access-Control-Allow-Origin'] = origin as string;
  return headers;
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
