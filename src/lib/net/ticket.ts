/**
 * Connection tickets.
 *
 * The Pages app owns the session cookie; the realtime Worker is a different
 * origin and never sees it. So Pages mints a short-lived signed ticket naming
 * the user and the match, and the Worker verifies it with a shared secret.
 *
 * Deliberately **not** "send the session cookie cross-origin": that would put a
 * 30-day credential on a second origin to save a few lines.
 *
 * Pure WebCrypto, no imports — this module is bundled into both projects.
 */

const TICKET_TTL_MS = 60_000;

export interface Ticket {
  userId: string;
  username: string;
  gameId: string;
  cardBack: string;
  expires: number;
}

function b64url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(text: string): Uint8Array {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

async function key(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

export async function signTicket(secret: string, payload: Omit<Ticket, 'expires'>): Promise<string> {
  const ticket: Ticket = { ...payload, expires: Date.now() + TICKET_TTL_MS };
  const body = b64url(new TextEncoder().encode(JSON.stringify(ticket)));
  const signature = await crypto.subtle.sign('HMAC', await key(secret), new TextEncoder().encode(body));
  return `${body}.${b64url(new Uint8Array(signature))}`;
}

/**
 * Verifies and decodes a ticket, or returns null.
 *
 * Uses `crypto.subtle.verify` rather than comparing strings, so the comparison
 * is constant-time and a forged signature cannot be found a byte at a time.
 */
export async function verifyTicket(secret: string, token: string): Promise<Ticket | null> {
  const dot = token.indexOf('.');
  if (dot <= 0) return null;

  const body = token.slice(0, dot);
  const signature = token.slice(dot + 1);

  try {
    const valid = await crypto.subtle.verify(
      'HMAC',
      await key(secret),
      fromB64url(signature) as BufferSource,
      new TextEncoder().encode(body)
    );
    if (!valid) return null;

    const ticket = JSON.parse(new TextDecoder().decode(fromB64url(body))) as Ticket;
    if (typeof ticket.expires !== 'number' || ticket.expires < Date.now()) return null;
    if (!ticket.userId || !ticket.gameId) return null;
    return ticket;
  } catch {
    return null;
  }
}
