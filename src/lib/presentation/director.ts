import { gsap } from 'gsap';
import { tick } from 'svelte';
import type { Action, Card } from '../../types/cards';
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
export type Mark = 'summoning' | 'heavy' | 'struck' | 'dying' | 'triggered';
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
  /** Every back in the opponent's fan, left to right. */
  foeBacks(): HTMLElement[];
  foeDeck(): HTMLElement | undefined;
  /** Your hand card a `draw` cue is delivering. */
  nextDrawn(): Card | undefined;
  setDrawn(card: Card, on: boolean): void;
  mark(kind: Mark, instanceId: string, on: boolean): void;
  setHeroHit(side: Side | null): void;
  setQuake(on: boolean): void;
  setBanner(text: string | null): void;
  float(at: Point, text: string, color: string): void;
  setShowcase(card: Card | null, from?: Point): void;
  /** The red line from a caster to what it aimed at. */
  setAimLine(line: { from: Point; to: Point; color: string } | null): void;
  /** The highlight that flickers across a random effect's candidates. */
  setRoulette(rect: DOMRect | null): void;
  /** The End Turn button turning over to announce your turn. */
  setHandover(on: boolean): void;
  fx(): Fx | null;
}

/** Where minions were when they died, so a Deathrattle can still fly from there. */
const lastSeen = new Map<string, Point>();

/** The colour an effect travels in. */
const EFFECT_COLOR: Record<Action, string> = {
  DealDamage: '#ff8a3a',
  Destroy: '#b04cff',
  Freeze: '#8fdcff',
  Silence: '#c8c0b4',
  Heal: '#7dff9a',
  BuffAttack: '#ffd35a',
  BuffHealth: '#9dff7a',
  GainKeyword: '#ffe08a',
  SwapStats: '#e6d4ff',
  DrawCard: '#9fc8ff',
  SummonToken: '#ffe7b0',
  GainMana: '#6cc4ff',
  GainArmor: '#cfd8e0'
};

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

/** Where a thing is on screen — or, for a minion that has just died, where it was. */
function pointOf(stage: Stage, ref: CueRef): Point | undefined {
  const el = elementOf(stage, ref);
  if (el) return centreOf(el);
  return ref.kind === 'minion' ? lastSeen.get(ref.instanceId) : undefined;
}

/** The part of a fanned card back that moves, leaving the fan's own rotation alone. */
const liftOf = (back: HTMLElement | undefined) => back?.querySelector<HTMLElement>('.arrive') ?? back;

/** Puts a back down in the fan, stopping anything still moving it. */
function settle(el: HTMLElement | undefined): void {
  if (!el) return;
  gsap.killTweensOf(el);
  gsap.set(el, { clearProps: 'transform' });
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
      // They pick it out of their hand first: the back rises from the fan.
      for (const b of stage.foeBacks()) settle(liftOf(b));
      const lift = liftOf(back);
      if (lift && spatial()) {
        gsap.to(lift, { y: 34, scale: 1.08, duration: d(260) / 1000, ease: 'power2.out' });
        await wait(300);
      }
      const from = back ? centreOf(back) : { x: window.innerWidth / 2, y: 0 };
      stage.advance(cue);
      // The fan is drawn by position, not by card: whichever back was raised is
      // now standing in for another card, so every lift settles.
      for (const b of stage.foeBacks()) settle(liftOf(b));
      stage.setShowcase(cue.card, from);
      await wait(spatial() ? 1350 : 1000);
      stage.setShowcase(null);
      return;
    }

    case 'summon': {
      stage.advance(cue);
      // Weight by cost: 1–3 taps down, 4–6 lands with a thud and a ring of
      // dust, 7 and up drops from above, slams, and shakes the table.
      const cost = cue.minion.card.cost;
      const heavy = cost >= 7;
      const id = cue.instanceId;
      if (heavy) pulse(() => stage.mark('heavy', id, true), () => stage.mark('heavy', id, false), 760);
      pulse(() => stage.mark('summoning', id, true), () => stage.mark('summoning', id, false), heavy ? 760 : 620);
      void wait(heavy ? 400 : 300).then(() => {
        const el = stage.unit(id);
        if (!el) return;
        const at = centreOf(el);
        const ground = { x: at.x, y: at.y + el.getBoundingClientRect().height * 0.42 };
        const dust = ['#d9c39a', '#b89a6a', '#8f7454'];
        if (cost <= 3) {
          stage.fx()?.motes(ground.x, ground.y, { colors: dust, count: 6, speed: 120, gravity: -40, life: 0.6, size: 4 });
          return;
        }
        stage.fx()?.ring(ground.x, ground.y, { color: 'rgba(230, 200, 150, .75)', size: heavy ? 170 : 110 });
        stage.fx()?.shards(ground.x, ground.y, { colors: dust, count: heavy ? 22 : 10, speed: heavy ? 320 : 200, size: 5, angle: -Math.PI / 2, spread: 1.3 });
        if (heavy && spatial()) pulse(() => stage.setQuake(true), () => stage.setQuake(false), 500);
      });
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
      if (at) lastSeen.set(cue.instanceId, at);
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
      if (stage.side(cue.owner) === 'me') {
        const card = stage.nextDrawn();
        if (card) pulse(() => stage.setDrawn(card, true), () => stage.setDrawn(card, false), 500);
        return;
      }
      // Theirs slides out of their deck and into the fan.
      await tick();
      const deck = stage.foeDeck();
      const arriving = liftOf(stage.foeBacks().at(-1));
      if (!deck || !arriving || !spatial()) return;
      const from = centreOf(deck);
      const to = centreOf(arriving);
      const k = drawnScale(arriving);
      gsap.from(arriving, {
        x: (from.x - to.x) / k,
        y: (from.y - to.y) / k,
        rotation: -30,
        scale: 0.35,
        duration: d(420) / 1000,
        ease: 'power2.out',
        clearProps: 'transform'
      });
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

    case 'turn': {
      stage.advance(cue);
      const mine = stage.side(cue.owner) === 'me';
      pulse(() => stage.setBanner(mine ? 'Your turn' : "Opponent's turn"), () => stage.setBanner(null), 900);
      if (mine) pulse(() => stage.setHandover(true), () => stage.setHandover(false), 1300);
      // Whatever they held up while thinking goes back in the fan.
      for (const back of stage.foeBacks()) settle(liftOf(back));
      return;
    }

    case 'effect':
      stage.advance(cue);
      await fly(cue, stage);
      return;

    case 'mana':
      stage.advance(cue);
      return;
  }
}

/**
 * An effect travelling to its targets.
 *
 * Aimed by the opponent: a red line to what they picked, held long enough to
 * read, then the shot. Drawn by chance: the highlight flickers across every
 * candidate, slowing, and lands on the one fate chose. Either way the projectile
 * flies in the effect's colour and the result lands as it arrives.
 */
async function fly(cue: Extract<GameEvent, { type: 'effect' }>, stage: Stage): Promise<void> {
  const caster = stage.side(cue.owner);
  const from = cue.source ? pointOf(stage, cue.source) : centreOfMaybe(stage.hero(caster));
  const first = cue.targets[0];
  if (!from || !first) return;
  const color = EFFECT_COLOR[cue.action];

  if (cue.aim === 'random' && cue.candidates) {
    await roulette(stage, cue.candidates, first);
  } else if (cue.aim === 'chosen' && caster === 'foe') {
    const to = pointOf(stage, first);
    if (to) {
      stage.setAimLine({ from, to, color: '#ff5a46' });
      await wait(520);
    }
  }

  const fx = stage.fx();
  const flights = cue.targets.flatMap((target) => {
    const to = pointOf(stage, target);
    if (!to) return [];
    // A minion acting on itself has nowhere to fly: it just flares.
    if (Math.hypot(to.x - from.x, to.y - from.y) < 30 || !spatial()) {
      fx?.ring(to.x, to.y, { color, size: 80 });
      return [];
    }
    return fx ? [fx.bolt(from, to, { color, duration: d(320) / 1000 })] : [];
  });
  await Promise.all(flights);
  stage.setAimLine(null);
  stage.setRoulette(null);
}

/** Hops the highlight across the candidates, slowing down, to land on `chosen`. */
async function roulette(stage: Stage, candidates: CueRef[], chosen: CueRef): Promise<void> {
  const rects = candidates.map((c) => elementOf(stage, c)?.getBoundingClientRect());
  const end = candidates.findIndex((c) => sameRef(c, chosen));
  if (end < 0 || rects.some((r) => !r)) return;
  // Enough hops to feel like a spin, few enough not to drag: 6 to 12.
  const hops = Math.min(12, Math.max(6, candidates.length + 3));
  const start = (end + 1 - (hops % candidates.length) + candidates.length * 4) % candidates.length;
  for (let i = 0; i < hops; i++) {
    stage.setRoulette(rects[(start + i) % candidates.length]!);
    // Ease out: quick at first, then each step lingers a little longer.
    const p = i / Math.max(1, hops - 1);
    await wait(60 + 200 * p * p);
  }
  await wait(260);
}

const sameRef = (a: CueRef, b: CueRef) =>
  a.kind === 'minion' ? b.kind === 'minion' && a.instanceId === b.instanceId : b.kind === 'hero' && a.owner === b.owner;

const centreOfMaybe = (el: HTMLElement | undefined) => (el ? centreOf(el) : undefined);

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
