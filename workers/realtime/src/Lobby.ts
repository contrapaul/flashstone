/**
 * The public lobby: one Durable Object holding every open game.
 *
 * A single object rather than one per game, because "list the open games" has to
 * be one read. Games are small and short-lived, so this stays tiny.
 */

const STALE_MS = 10 * 60 * 1000;

export interface Game {
  id: string;
  hostId: string;
  hostName: string;
  isPublic: boolean;
  createdAt: number;
  /** Set once someone joins; a joined game leaves the list. */
  guestId: string | null;
}

export class Lobby {
  private state: DurableObjectState;
  private games = new Map<string, Game>();
  private loaded = false;

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  /**
   * Games live in storage, not just memory: a Durable Object is evicted when
   * idle, and an invite link handed out five minutes ago must still work.
   */
  private async load(): Promise<void> {
    if (this.loaded) return;
    const stored = (await this.state.storage.get<Game[]>('games')) ?? [];
    for (const game of stored) this.games.set(game.id, game);
    this.loaded = true;
  }

  private async save(): Promise<void> {
    await this.state.storage.put('games', [...this.games.values()]);
  }

  /** Drops games nobody joined. Cheap, and runs on every call. */
  private sweep(): void {
    const cutoff = Date.now() - STALE_MS;
    for (const [id, game] of this.games) {
      if (!game.guestId && game.createdAt < cutoff) this.games.delete(id);
    }
  }

  async fetch(request: Request): Promise<Response> {
    await this.load();
    this.sweep();

    const url = new URL(request.url);
    const action = url.pathname.split('/').pop();

    if (action === 'list') {
      // Public and still open only. A private game is reachable by its link and
      // must never appear here.
      const open = [...this.games.values()]
        .filter((g) => g.isPublic && !g.guestId)
        .sort((a, b) => b.createdAt - a.createdAt)
        .map((g) => ({ id: g.id, hostName: g.hostName, createdAt: g.createdAt }));
      return Response.json({ games: open });
    }

    const body = await request.json().catch(() => ({}) as any);

    if (action === 'create') {
      const game: Game = {
        id: crypto.randomUUID(),
        hostId: String(body.userId ?? ''),
        hostName: String(body.username ?? 'Player'),
        // Public unless explicitly turned off — DECISIONS/plan item 1.
        isPublic: body.isPublic !== false,
        createdAt: Date.now(),
        guestId: null
      };
      // One open game per host, so a host clicking twice does not litter the list.
      for (const [id, existing] of this.games) {
        if (existing.hostId === game.hostId && !existing.guestId) this.games.delete(id);
      }
      this.games.set(game.id, game);
      await this.save();
      return Response.json({ game });
    }

    if (action === 'join') {
      const gameId = String(body.gameId ?? '');
      const userId = String(body.userId ?? '');
      const game = this.games.get(gameId);

      if (!game) return Response.json({ error: 'That game no longer exists.' }, { status: 404 });
      if (game.hostId === userId) return Response.json({ game });
      if (game.guestId && game.guestId !== userId) {
        return Response.json({ error: 'Someone else already joined.' }, { status: 409 });
      }

      game.guestId = userId;
      await this.save();
      return Response.json({ game });
    }

    if (action === 'cancel') {
      const game = this.games.get(String(body.gameId ?? ''));
      if (game && game.hostId === String(body.userId ?? '')) {
        this.games.delete(game.id);
        await this.save();
      }
      return Response.json({ ok: true });
    }

    return new Response('Not found', { status: 404 });
  }
}
