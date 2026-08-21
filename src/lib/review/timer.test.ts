import { describe, expect, it } from 'vitest';
import { IDLE_TIMEOUT_MS, createReviewTimer } from './timer';

const S = 1000;

describe('the review timer', () => {
  it('counts time while the player is active', () => {
    const t = createReviewTimer(0);
    t.activity(5 * S);
    expect(t.tick(10 * S)).toBe(10);
  });

  it('starts at zero', () => {
    expect(createReviewTimer(0).seconds()).toBe(0);
  });

  it('stops counting while paused, and does not backfill on resume', () => {
    const t = createReviewTimer(0);
    t.pause(10 * S);
    expect(t.seconds()).toBe(10);

    // An hour hidden.
    t.resume(3610 * S);
    t.activity(3615 * S);
    expect(t.tick(3620 * S)).toBe(20);
  });

  it('stops counting after the idle cutoff', () => {
    const t = createReviewTimer(0);
    // No input at all: only the idle window counts.
    expect(t.tick(10 * 60 * S)).toBe(IDLE_TIMEOUT_MS / 1000);
  });

  // The obvious wrong implementation banks the whole gap on the next input.
  it('does not bank a long idle gap when input finally arrives', () => {
    const t = createReviewTimer(0);
    t.activity(10 * 60 * S);
    expect(t.seconds()).toBe(IDLE_TIMEOUT_MS / 1000);
  });

  it('resumes counting after input following an idle stretch', () => {
    const t = createReviewTimer(0);
    t.activity(10 * 60 * S);
    const afterIdle = t.seconds();
    t.activity(10 * 60 * S + 5 * S);
    expect(t.tick(10 * 60 * S + 10 * S)).toBe(afterIdle + 10);
  });

  it('reaches five minutes only with sustained attention', () => {
    const t = createReviewTimer(0);
    // A click every 10s for five minutes.
    for (let at = 10 * S; at <= 300 * S; at += 10 * S) t.activity(at);
    expect(t.tick(300 * S)).toBe(300);

    // The same span with one click and then nothing.
    const lazy = createReviewTimer(0);
    lazy.activity(1 * S);
    expect(lazy.tick(300 * S)).toBeLessThan(60);
  });

  it('never goes backwards when ticked repeatedly at the same instant', () => {
    const t = createReviewTimer(0);
    t.activity(5 * S);
    const first = t.tick(10 * S);
    expect(t.tick(10 * S)).toBe(first);
    expect(t.tick(9 * S)).toBe(first);
  });
});
