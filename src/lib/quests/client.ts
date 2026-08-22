import { browser } from '$app/environment';
import type { QuestMetric } from './quests';

/**
 * Reporting quest progress from the browser.
 *
 * Everything here is **best-effort and silent**: a player without an account,
 * or offline, must still be able to play a match. A failed report costs a
 * little quest progress; it must never interrupt a game.
 */

export interface QuestRow {
  id: string;
  label: string;
  detail: string;
  target: number;
  reward: number;
  progress: number;
  claimed: boolean;
  complete: boolean;
}

/** A one-time intro quest. Pays packs and a card back, not only gold. */
export interface IntroRow {
  id: string;
  label: string;
  detail: string;
  target: number;
  gold: number;
  packs: number;
  back?: string;
  progress: number;
  claimed: boolean;
  complete: boolean;
}

export interface QuestTracks {
  quests: QuestRow[];
  /** Empty once the new-player track is finished — the panel then hides it. */
  intro: IntroRow[];
}

export async function fetchQuests(): Promise<QuestTracks> {
  if (!browser) return { quests: [], intro: [] };
  try {
    const res = await fetch('/api/quests');
    if (!res.ok) return { quests: [], intro: [] };
    const data = await res.json();
    return { quests: data.quests ?? [], intro: data.intro ?? [] };
  } catch {
    return { quests: [], intro: [] };
  }
}

/** Fire-and-forget. Never awaited by gameplay. */
export function reportProgress(metric: QuestMetric, amount = 1): void {
  if (!browser || amount <= 0) return;
  void fetch('/api/quests/progress', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ metric, amount })
  }).catch(() => {
    // Signed out, offline, or rate-limited. Not the player's problem mid-match.
  });
}

export interface ClaimResult {
  ok: boolean;
  reason?: string;
  /** Gold paid. An intro quest may pay none and still succeed. */
  awarded: number;
  awardedPacks: number;
  awardedBack?: string;
  quests?: QuestRow[];
  intro?: IntroRow[];
}

export async function claimQuest(questId: string): Promise<ClaimResult> {
  try {
    const res = await fetch('/api/quests/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questId })
    });
    const data = await res.json();
    return {
      ok: !!data.ok,
      reason: data.reason,
      // Daily quests answer with `awarded`, intro quests with `awardedGold`.
      awarded: data.awarded ?? data.awardedGold ?? 0,
      awardedPacks: data.awardedPacks ?? 0,
      awardedBack: data.awardedBack,
      quests: data.quests,
      intro: data.intro
    };
  } catch {
    return { ok: false, reason: 'Could not reach the server.', awarded: 0, awardedPacks: 0 };
  }
}

/** Time until quests refresh, as `12h 04m`. Quests roll over at UTC midnight. */
export function nextRefreshIn(now = Date.now()): string {
  const msPerDay = 86_400_000;
  const remaining = msPerDay - (now % msPerDay);
  const hours = Math.floor(remaining / 3_600_000);
  const minutes = Math.floor((remaining % 3_600_000) / 60_000);
  return `${hours}h ${String(minutes).padStart(2, '0')}m`;
}
