import { gsap } from 'gsap';
import type { Card } from '../../types/cards';
import { EVENT_BEAT, type CueRef, type GameEvent } from '../engine/events';
import type { PlayerView } from '../net/protocol';
import type { Fx } from './fx';
import { d, drawnScale, sleep, spatial, wait } from './motion';

/**
 * Playback: what each cue looks like.
 *
 * One choreography per cue type. Each moves the board on screen past its cue
 * (`stage.advance`) at the moment its animation *lands* — after a lunge reaches
 * its target, after a shatter finishes — and awaits whatever must finish
 * before the next cue may start. Everything else it starts runs on alone.
 *
 * Durations all go through `d()`, so the motion setting and the opponent's
 * pace apply everywhere at once. Nothing here touches the component: it works
 * through `Stage`, which the table implements.
 */

export type Side = 'me' | 'foe';
export type Mark = 'summoning' | 'struck' | 'dying' | 'triggered';
export interface Point {
  x: number;
  y: number;
}

export interface Stage {
  side(owner: string): Side;
  /** The board on screen right now. */
  shown(): PlayerView;
  /** Moves the board on screen past this cue. */
  advance(cue: GameEvent): void;
  /** Cues still waiting behind the one playing. */
  queued(): readonly GameEvent[];
  unit(instanceId: string): HTMLElement | undefined;
  hero(side: Side): HTMLElement | undefined;
  /** The opponent's card back at this hand position, if the fan has one. */
  foeBack(index: number): HTMLElement | undefined;
  /** Your hand card a `draw` cue is delivering. */
  nextDrawn(): Card | undefined;
  setDrawn(card: Card, on: boolean): void;
  mark(kind: Mark, instanceId: string, on: boolean): void;
  setHeroHit(side: Side | null): void;
  setQuake(on: boolean): void;
  setBanner(text: string | null): void;
  float(at: Point, text: string, color: string): void;
  setShowcase(card: Card | null, from?: Point): void;
  fx(): Fx | null;
}

/** Hits that land together: the two sides of a trade, every target of a sweep. */
const IMPACT = new Set<GameEvent['type']>(['damage', 'shield', 'heal']);

/** How long to hold after a cue before the next one starts. */
export function hold(cue: GameEvent, next: GameEvent | undefined): number {
  const together = IMPACT.has(cue.type) && next !== undefined && IMPACT.has(next.type);
  return d(together ? 60 : EVENT_BEAT[cue.type]);
}

export function centreOf(el: HTMLElement): Point {
  const rect = el.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

/** Sets a state now and unsets it after `ms`, without holding up playback. */
function pulse(on: () => void, off: () => void, ms: number): void {
  on();
  void sleep(d(ms)).then(off);
}

function elementOf(stage: Stage, ref: CueRef): HTMLElement | undefined {
  return ref.kind === 'minion' ? stage.unit(ref.instanceId) : stage.hero(stage.side(ref.owner));
}

/** 0–1: how hard a hit lands. Every impact effect scales from this one number. */
export function hitIntensity(amount: number): number {
  return Math.min(1, 0.2 + amount / 8);
}

export async function direct(cue: GameEvent, stage: Stage): Promise<void> {
  switch (cue.type) {
    case 'play': {
      // Your own card is already where you dropped it; only the opponent's
      // needs to be shown being played.
      if (stage.side(cue.owner) === 'me') return stage.advance(cue);
      const back = stage.foeBack(cue.handIndex);
      const from = back ? centreOf(back) : { x: window.innerWidth / 2, y: 0 };
      stage.advance(cue);
      stage.setShowcase(cue.card, from);
      await wait(spatial() ? 1350 : 1000);
      stage.setShowcase(null);
      return;
    }

    case 'summon': {
      stage.advance(cue);
      pulse(() => stage.mark('summoning', cue.instanceId, true), () => stage.mark('summoning', cue.instanceId, false), 620);
      // A big minion lands with weight: dust, and the table jolts as it touches down.
      if (cue.minion.card.cost >= 5) {
        void wait(300).then(() => {
          const el = stage.unit(cue.instanceId);
          if (el) {
            const at = centreOf(el);
            stage.fx()?.ring(at.x, at.y + 40, { color: 'rgba(230, 200, 150, .7)', size: 110 });
          }
          if (spatial() && cue.minion.card.cost >= 6) pulse(() => stage.setQuake(true), () => stage.setQuake(false), 500);
        });
      }
      return;
    }

    case 'attack':
      await lunge(stage.unit(cue.instanceId), elementOf(stage, cue.target));
      stage.advance(cue);
      return;

    case 'heroAttack': {
      const hero = stage.hero(stage.side(cue.owner))?.querySelector<HTMLElement>('.hero') ?? undefined;
      await lunge(hero, elementOf(stage, cue.target));
      stage.advance(cue);
      return;
    }

    case 'death': {
      const el = stage.unit(cue.instanceId);
      const at = el ? centreOf(el) : undefined;
      stage.mark('dying', cue.instanceId, true);
      void wait(220).then(() => at && stage.fx()?.shards(at.x, at.y));
      // The shatter plays on the minion still on screen; only then does it go.
      // Deaths in a row shatter together rather than one after another.
      const gone = wait(600).then(() => {
        stage.advance(cue);
        stage.mark('dying', cue.instanceId, false);
      });
      if (stage.queued()[0]?.type !== 'death') await gone;
      return;
    }

    case 'damage': {
      stage.advance(cue);
      const el = elementOf(stage, cue.target);
      const intensity = hitIntensity(cue.amount);
      if (cue.target.kind === 'hero') {
        const side = stage.side(cue.target.owner);
        pulse(() => stage.setHeroHit(side), () => stage.setHeroHit(null), 500);
        if (spatial() && cue.amount >= 4) pulse(() => stage.setQuake(true), () => stage.setQuake(false), 500);
      } else {
        const id = cue.target.instanceId;
        pulse(() => stage.mark('struck', id, true), () => stage.mark('struck', id, false), 500);
      }
      if (el) {
        const at = centreOf(el);
        stage.fx()?.sparks(at.x, at.y, { count: Math.round(8 + 22 * intensity), speed: 380 + 320 * intensity });
        stage.float(at, `-${cue.amount}`, 'var(--blood)');
      }
      return;
    }

    case 'heal': {
      stage.advance(cue);
      const el = elementOf(stage, cue.target);
      if (el) {
        const at = centreOf(el);
        stage.fx()?.motes(at.x, at.y, { colors: ['#d8ffd8', '#8ef0a0'] });
        stage.float(at, `+${cue.amount}`, 'var(--good)');
      }
      return;
    }

    case 'shield': {
      // The bubble bursts on its own (MinionView); this throws its gold out.
      const el = stage.unit(cue.instanceId);
      stage.advance(cue);
      if (el) {
        const at = centreOf(el);
        stage.fx()?.sparks(at.x, at.y, { colors: ['#fff6d0', '#ffd96a'], count: 22, speed: 420, gravity: 300 });
      }
      return;
    }

    case 'buff': {
      const before = findShown(stage.shown(), cue.instanceId);
      stage.advance(cue);
      const el = stage.unit(cue.instanceId);
      if (el && before) {
        const at = centreOf(el);
        const da = cue.attack - before.attack;
        const dh = cue.health - before.health;
        stage.fx()?.motes(at.x, at.y + 30, { colors: ['#b8ffc4', '#5fe07a'], count: 10, gravity: -220 });
        stage.float(at, `${sign(da)}/${sign(dh)}`, 'var(--good)');
      }
      return;
    }

    case 'freeze':
    case 'silence':
    case 'keyword': {
      stage.advance(cue);
      const el = stage.unit(cue.instanceId);
      if (el) {
        const at = centreOf(el);
        const color = cue.type === 'freeze' ? 'rgba(170, 230, 255, .9)' : cue.type === 'silence' ? 'rgba(200, 190, 175, .8)' : 'rgba(255, 228, 150, .9)';
        stage.fx()?.ring(at.x, at.y, { color, size: 100 });
        if (cue.type === 'freeze') stage.fx()?.shards(at.x, at.y, { colors: ['#e6f8ff', '#a8e2ff', '#6cc4f0'], count: 12, speed: 220, size: 7 });
      }
      return;
    }

    case 'trigger':
      pulse(() => stage.mark('triggered', cue.instanceId, true), () => stage.mark('triggered', cue.instanceId, false), 520);
      return;

    case 'armor': {
      const side = stage.side(cue.owner);
      const gained = cue.armor - stage.shown()[side].armor;
      stage.advance(cue);
      const el = stage.hero(side);
      if (el && gained > 0) {
        const at = centreOf(el);
        stage.fx()?.ring(at.x, at.y, { color: 'rgba(200, 215, 230, .9)', size: 80 });
        stage.float(at, `+${gained}`, '#cfd8e0');
      }
      return;
    }

    case 'equip':
    case 'weaponBreak':
    case 'heroPower': {
      stage.advance(cue);
      const el = stage.hero(stage.side(cue.owner));
      if (el) {
        const at = centreOf(el);
        if (cue.type === 'weaponBreak') stage.fx()?.shards(at.x, at.y, { colors: ['#cfd8e0', '#8a9aa8', '#5a6874'] });
        else stage.fx()?.ring(at.x, at.y, { color: cue.type === 'equip' ? 'rgba(220, 230, 240, .9)' : 'rgba(255, 220, 140, .9)' });
      }
      return;
    }

    case 'draw': {
      stage.advance(cue);
      if (stage.side(cue.owner) !== 'me') return;
      const card = stage.nextDrawn();
      if (card) pulse(() => stage.setDrawn(card, true), () => stage.setDrawn(card, false), 500);
      return;
    }

    case 'burn': {
      // Shown and destroyed: a card lost to a full hand is public, and should be seen.
      stage.advance(cue);
      stage.setShowcase(cue.card, { x: window.innerWidth - 80, y: window.innerHeight / 2 });
      await wait(900);
      stage.setShowcase(null);
      return;
    }

    case 'fatigue': {
      const el = stage.hero(stage.side(cue.owner));
      if (el) stage.float(centreOf(el), 'Fatigue', '#c9b4ff');
      return;
    }

    case 'turn':
      stage.advance(cue);
      pulse(() => stage.setBanner(stage.side(cue.owner) === 'me' ? 'Your turn' : "Opponent's turn"), () => stage.setBanner(null), 900);
      return;

    case 'mana':
    case 'effect':
      stage.advance(cue);
      return;
  }
}

/**
 * An attack you can see: the attacker rises, dashes most of the way to its
 * target, holds for a beat at contact, and springs home.
 *
 * Resolves **at contact**, so the hit that follows lands as it arrives while
 * the recoil plays on. Distances are divided by the element's drawn scale —
 * rects are screen pixels, a transform inside the zoomed table is not.
 */
async function lunge(mover: HTMLElement | undefined, at: HTMLElement | undefined): Promise<void> {
  if (!mover || !at || !spatial()) return;
  const from = centreOf(mover);
  const to = centreOf(at);
  const k = drawnScale(mover);
  const reach = 0.78;
  const s = (ms: number) => d(ms) / 1000;
  gsap
    .timeline()
    .set(mover, { zIndex: 60 })
    .to(mover, { scale: 1.12, y: -8, duration: s(130), ease: 'power2.out' })
    .to(mover, { x: ((to.x - from.x) * reach) / k, y: ((to.y - from.y) * reach) / k, duration: s(170), ease: 'power3.in' })
    .to(mover, { x: 0, y: 0, scale: 1, duration: s(320), ease: 'back.out(1.8)' }, `+=${s(70)}`)
    .set(mover, { clearProps: 'transform,zIndex' });
  await sleep(d(300));
}

function findShown(view: PlayerView, instanceId: string) {
  return view.me.board.find((m) => m.instanceId === instanceId) ?? view.foe.board.find((m) => m.instanceId === instanceId);
}

const sign = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
