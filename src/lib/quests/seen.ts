import { browser } from '$app/environment';

/**
 * Whether today's quests have been put in front of the player yet.
 *
 * The spotlight on the home page is meant to be the thing a returning player
 * sees once, on the first visit of a day — not a dialog that reappears every
 * time they navigate home. One stored day number is the whole state: quests
 * refresh at UTC midnight, so "the day changed" and "the quests are new" are
 * the same fact, and no fetch is needed to know it.
 */

const SEEN_KEY = 'flashstone.questsSeen';

/**
 * The UTC day number, matching the server's `utcDay` in `server/api.ts`.
 * Duplicated rather than imported — that module is server-only, and this is one
 * line that cannot drift without the quest day itself changing.
 */
export function utcDay(at = Date.now()): number {
  return Math.floor(at / 86_400_000);
}

/** True when today's quests have not been shown yet. */
export function questsUnseen(at = Date.now()): boolean {
  if (!browser) return false;
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    // Never shown before — a genuinely new player — counts as unseen.
    if (raw === null) return true;
    return Number(raw) !== utcDay(at);
  } catch {
    // Storage disabled. Showing it every visit is worse than never showing it.
    return false;
  }
}

/** Records that today's quests have been shown, so they are not shown again. */
export function markQuestsSeen(at = Date.now()): void {
  if (!browser) return;
  try {
    localStorage.setItem(SEEN_KEY, String(utcDay(at)));
  } catch {
    // Quota or storage disabled — it reappears next navigation, which is safe.
  }
}
