import { browser } from '$app/environment';
import type { GameEvent } from '../engine/events';
import { parseServerMessage, type PlayerView, type ServerMessage } from './protocol';

/**
 * The browser's half of an online match.
 *
 * Deliberately thin: it opens a socket, sends intents, and hands state and cues
 * to whoever is listening. It holds no rules — the room decides everything, and
 * anything clever here would only be a second opinion the server ignores.
 */

export interface OnlineHandlers {
  onState(view: PlayerView, events: GameEvent[]): void;
  onJoined(you: 'player' | 'ai', opponent: { username: string; cardBack: string } | null): void;
  onWaiting(): void;
  onOver(view: PlayerView, winner: string, goldAwarded: number): void;
  onOpponentLeft(): void;
  onError(message: string): void;
  onDisconnected(): void;
}

export interface OnlineConnection {
  send(message: unknown): void;
  close(): void;
}

async function mintTicket(gameId: string): Promise<{ ticket: string; realtimeUrl: string }> {
  const res = await fetch('/api/online/ticket', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ gameId })
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? 'Could not get a connection ticket.');
  }
  return res.json();
}

/** Lobby calls go straight to the realtime Worker, authenticated by ticket. */
export async function lobbyCall(action: string, body: Record<string, unknown> = {}): Promise<any> {
  const { ticket, realtimeUrl } = await mintTicket('lobby');
  const res = await fetch(`${realtimeUrl}/lobby/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Ticket': ticket },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? 'The lobby is unavailable.');
  return data;
}

/**
 * Opens a match socket.
 *
 * Reconnects on an unexpected drop, with a backoff, and asks for a resync each
 * time — the room keeps the seat, so a dropped connection costs a moment rather
 * than the match.
 */
export function connectToMatch(gameId: string, handlers: OnlineHandlers): OnlineConnection {
  if (!browser) return { send() {}, close() {} };

  let socket: WebSocket | null = null;
  let closed = false;
  let attempt = 0;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;

  async function open() {
    if (closed) return;
    try {
      const { ticket, realtimeUrl } = await mintTicket(gameId);
      const ws = new WebSocket(
        `${realtimeUrl.replace(/^http/, 'ws')}/match?ticket=${encodeURIComponent(ticket)}`
      );
      socket = ws;

      ws.addEventListener('open', () => {
        attempt = 0;
        ws.send(JSON.stringify({ type: 'hello', version: 1 }));
      });

      ws.addEventListener('message', (event) => {
        const message = parseServerMessage(String(event.data));
        if (message) dispatch(message);
      });

      ws.addEventListener('close', () => {
        if (closed) return;
        handlers.onDisconnected();
        retry();
      });

      ws.addEventListener('error', () => ws.close());
    } catch (e) {
      handlers.onError(e instanceof Error ? e.message : 'Could not connect.');
      retry();
    }
  }

  function retry() {
    if (closed) return;
    attempt += 1;
    if (attempt > 6) return handlers.onError('Lost connection to the match.');
    // 1s, 2s, 4s… capped, so a server restart is ridden out without hammering it.
    retryTimer = setTimeout(open, Math.min(1000 * 2 ** (attempt - 1), 10_000));
  }

  function dispatch(message: ServerMessage) {
    switch (message.type) {
      case 'joined':
        return handlers.onJoined(message.you, message.opponent);
      case 'waiting':
        return handlers.onWaiting();
      case 'state':
        return handlers.onState(message.view, message.events ?? []);
      case 'over':
        return handlers.onOver(message.view, message.winner, message.goldAwarded);
      case 'opponentLeft':
        return handlers.onOpponentLeft();
      case 'error':
        return handlers.onError(message.message);
    }
  }

  void open();

  return {
    send(message: unknown) {
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
    },
    close() {
      closed = true;
      clearTimeout(retryTimer);
      socket?.close();
    }
  };
}
