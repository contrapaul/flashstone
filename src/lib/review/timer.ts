/**
 * Counts **active** review time.
 *
 * Phase 4 pays gold for "review cards for 5 minutes", so this has to measure
 * attention rather than elapsed wall-clock: a tab left open overnight must be
 * worth nothing. Two rules do that — time stops while the tab is hidden, and it
 * stops after a stretch with no input.
 *
 * Pure and clock-injected: every method takes `now`, so the tests drive time
 * directly rather than sleeping.
 */

/** No keypress or click for this long and the player is no longer reviewing. */
export const IDLE_TIMEOUT_MS = 30_000;

export interface ReviewTimer {
  /** Records input and banks the time since the last call. */
  activity(now: number): void;
  /** Tab hidden or window blurred — bank what is owed and stop counting. */
  pause(now: number): void;
  /** Tab visible again. Counting restarts from `now`, not from the pause. */
  resume(now: number): void;
  /** Banks time up to `now` and returns the running total, in whole seconds. */
  tick(now: number): number;
  /** The total without advancing the clock. */
  seconds(): number;
}

export function createReviewTimer(now = 0): ReviewTimer {
  let activeMs = 0;
  let lastTick = now;
  let lastActivity = now;
  let running = true;

  function bank(at: number): void {
    if (!running) {
      lastTick = at;
      return;
    }
    const elapsed = at - lastTick;
    lastTick = at;
    if (elapsed <= 0) return;

    // Only the part of the gap before the idle cutoff counts. Without this, a
    // single click after ten idle minutes would bank all ten.
    const idleAt = lastActivity + IDLE_TIMEOUT_MS;
    const countedUntil = Math.min(at, idleAt);
    const counted = countedUntil - (at - elapsed);
    if (counted > 0) activeMs += counted;
  }

  return {
    activity(at: number) {
      bank(at);
      lastActivity = at;
    },
    pause(at: number) {
      bank(at);
      running = false;
    },
    resume(at: number) {
      lastTick = at;
      lastActivity = at;
      running = true;
    },
    tick(at: number) {
      bank(at);
      return Math.floor(activeMs / 1000);
    },
    seconds() {
      return Math.floor(activeMs / 1000);
    }
  };
}
