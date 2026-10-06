import { cubicOut } from 'svelte/easing';

/**
 * How fast things move, in one place.
 *
 * Ported from Tome of Secrets' `ui/kit/motion.ts`. Every playback duration goes
 * through `d()`, so a single setting slows the whole table down or calms it,
 * and the opponent's turn can run slower than yours — a new player needs to
 * see what hit them, and the opponent's turn is the one they did not choose.
 *
 * One deliberate difference from Tome: **Reduced is not faster.** It keeps the
 * full pacing and drops only spatial motion (lunges, flights, shakes), because
 * a match still has to be followable without them.
 */
export type Motion = 'full' | 'fast' | 'reduced';
export type OpponentPace = 'measured' | 'fast';

export const MOTION_SCALE: Record<Motion, number> = { full: 1, fast: 0.55, reduced: 1 };
export const PACE_SCALE: Record<OpponentPace, number> = { measured: 1.3, fast: 1 };

let motion: Motion = 'full';
let pace = PACE_SCALE.measured;
let opponentsTurn = false;

export function setMotion(value: Motion): void {
  motion = value;
}

export function setOpponentPace(value: OpponentPace): void {
  pace = PACE_SCALE[value];
}

/** Set by playback before each cue, from whose turn is on screen. */
export function opponentTurn(on: boolean): void {
  opponentsTurn = on;
}

/** A duration in ms, scaled by the motion setting and, on their turn, by the opponent's pace. */
export function d(ms: number): number {
  return ms * MOTION_SCALE[motion] * (opponentsTurn ? pace : 1);
}

/** A pause that belongs to the opponent — their thinking — at their pace. */
export function dOpponent(ms: number): number {
  return ms * MOTION_SCALE[motion] * pace;
}

/** False under Reduced: no lunges, flights or shakes — fades only. */
export function spatial(): boolean {
  return motion !== 'reduced';
}

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Sleeps for a scaled duration. */
export const wait = (ms: number) => sleep(d(ms));

/**
 * How much an element is drawn larger than its own CSS pixels — by a `zoom` on
 * an ancestor (the table's fit) and any transform scale (the hand). Rects come
 * back in screen pixels; a transform on the element is applied in its own, so
 * every distance measured from rects has to be divided by this.
 */
export function drawnScale(el: HTMLElement): number {
  const rect = el.getBoundingClientRect();
  return el.offsetWidth > 0 ? rect.width / el.offsetWidth : 1;
}

/**
 * `animate:flip` for elements inside the zoomed table.
 *
 * Svelte's own flip measures in screen pixels and moves in CSS pixels, so on a
 * board zoomed to 1.3 everything slid from 30% too far away. This divides the
 * distance by the element's drawn scale. Sizes never change on a reflow here,
 * so there is no scale to animate.
 */
export function flipZoomed(
  node: HTMLElement,
  { from, to }: { from: DOMRect; to: DOMRect },
  { duration = 280 }: { duration?: number } = {}
) {
  const k = node.offsetWidth > 0 ? to.width / node.offsetWidth : 1;
  const dx = (from.left - to.left) / k;
  const dy = (from.top - to.top) / k;
  return {
    duration: dx === 0 && dy === 0 ? 0 : duration,
    easing: cubicOut,
    css: (_t: number, u: number) => `transform: translate(${u * dx}px, ${u * dy}px);`
  };
}
