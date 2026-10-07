import { gsap } from 'gsap';
import { tick } from 'svelte';
import type { Action, Card } from '../../types/cards';
import { EVENT_BEAT, type CueRef, type GameEvent } from '../engine/events';
import type { PlayerView } from '../net/protocol';
import type { Fx } from './fx';
import { d, drawnScale, sleep, spatial, wait } from './motion';
import { audio } from '../audio';

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
 *
 * Each sound plays at the moment it describes — a landing as it lands, a hit
 * as it hits — so sound and picture are one event, not two.
 */

export type Side = 'me' | 'foe';
export type Mark = 'summoning' | 'heavy' | 'struck' | 'dying' | 'triggered' | 'swapping' | 'refused';
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
  /** That card's face in the fan, once it is there. */
  handCard(card: Card): HTMLElement | undefined;
  myDeck(): HTMLElement | undefined;
  mark(kind: Mark, instanceId: string, on: boolean): void;
  setHeroHit(side: Side | null): void;
  /** A hero brought to 0: its portrait breaks apart. */
  setHeroDown(side: Side | null): void;
  /** Shakes the table, 0–1; 0 stops it. */
  setQuake(intensity: number): void;
  setBanner(text: string | null): void;
  float(at: Point, text: string, color: string): void;
  /** A number pinned to what it happened to: damage, healing, armor. */
  splat(at: Point, kind: 'damage' | 'heal' | 'armor', amount: number, intensity: number): void;
  setShowcase(show: Showcase | null): void;
  /** The red line from a caster to what it aimed at. */
  setAimLine(line: { from: Point; to: Point; color: string } | null): void;
  /** The highlight that flickers across a random effect's candidates. */
  setRoulette(rect: DOMRect | null): void;
  /** The End Turn button turning over to announce your turn. */
  setHandover(on: boolean): void;
  fx(): Fx | null;
}

/**
 * A card held up for the table to see:
 *  - `reveal` — the opponent's play, flying up out of their hand;
 *  - `burn` — a card drawn into a full hand, burning away above it;
 *  - `fatigue` — the empty card an empty deck deals, which then strikes its hero.
 */
export type Showcase =
  | { mode: 'reveal'; card: Card; from: Point }
  | { mode: 'burn'; card: Card; at: Point }
  | { mode: 'fatigue'; amount: number; from: Point; at: Point; strike: Point };

/** Where minions were when they died, so a Deathrattle can still fly from there. */
const lastSeen = new Map<string, Point>();

/**
 * Where the last blow came from, so a hit knocks its target *away* from it.
 * An attack sets both ends — the attacker is knocked back by the defender too.
 */
let blow: { from: Point; to?: Point; attacker?: CueRef } | null = null;

/** Each class's colour, for its hero power's burst. */
const CLASS_COLOR: Record<string, string[]> = {
  Designer: ['#7fffd4', '#d4fff2'],
  Engineer: ['#ffb057', '#ffe2b8'],
  Consumer: ['#c78bff', '#f0dcff'],
  Manufacturer: ['#ff6a4a', '#ffd0c4'],
  Neutral: ['#ffe08a', '#fff6d8']
};

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
  GainArmor: '#cfd8e0',
  ReturnToHand: '#bfe3ff',
  Resummon: '#ffe7b0',
  DestroyLater: '#9a7cff',
  Transform: '#e6d4ff'
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
  return ref.kind === 'minion' ? stage.unit(ref.instanceId) : portraitOf(stage, stage.side(ref.owner));
}

/** A hero's portrait itself — not the block it sits in with its gems and power. */
function portraitOf(stage: Stage, side: Side): HTMLElement | undefined {
  const block = stage.hero(side);
  return block?.querySelector<HTMLElement>('.hero .ring') ?? block;
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
      if (stage.side(cue.owner) === 'me') {
        played(cue.card);
        return stage.advance(cue);
      }
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
      stage.setShowcase({ mode: 'reveal', card: cue.card, from });
      played(cue.card);
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
        // The same three weights, heard: a tap, a thud, and a slam pitched down.
        if (cost <= 3) audio().play('minion-land');
        else audio().play('minion-land-heavy', heavy ? { rate: 0.85 } : {});
        if (cue.minion.keywords.includes('Taunt')) audio().play('taunt-up');
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
        if (heavy && spatial()) pulse(() => stage.setQuake(1), () => stage.setQuake(0), 500);
      });
      // Charge: it arrives already moving — streaks off both flanks, no lasting mark.
      if (cue.minion.keywords.includes('Charge')) {
        void wait(200).then(() => {
          const el = stage.unit(id);
          if (!el) return;
          const at = centreOf(el);
          for (const angle of [Math.PI, 0]) {
            stage.fx()?.sparks(at.x, at.y, { angle, spread: 0.25, count: 10, speed: 700, gravity: 0, colors: ['#fff6d8', '#9dff7a'] });
          }
        });
      }
      return;
    }

    case 'attack': {
      const mover = stage.unit(cue.instanceId);
      const at = elementOf(stage, cue.target);
      if (mover && at) blow = { from: centreOf(mover), to: centreOf(at), attacker: { kind: 'minion', instanceId: cue.instanceId } };
      audio().play('attack-swing');
      const attacker = findShown(stage.shown(), cue.instanceId);
      if (attacker) audio().line(attacker.card.id, 'attack');
      await lunge(mover, at);
      stage.advance(cue);
      return;
    }

    case 'heroAttack': {
      const side = stage.side(cue.owner);
      const hero = stage.hero(side)?.querySelector<HTMLElement>('.hero') ?? undefined;
      const at = elementOf(stage, cue.target);
      if (hero && at) blow = { from: centreOf(hero), to: centreOf(at), attacker: { kind: 'hero', owner: cue.owner } };
      // The weapon swings as the hero goes in: back, then through.
      const weapon = hero?.querySelector<HTMLElement>('.weapon-icon');
      if (weapon && spatial()) {
        gsap
          .timeline()
          .to(weapon, { rotation: -50, duration: d(140) / 1000, ease: 'power2.out' })
          .to(weapon, { rotation: 35, duration: d(130) / 1000, ease: 'power3.in' })
          .to(weapon, { rotation: 0, duration: d(260) / 1000, ease: 'back.out(2)', clearProps: 'transform' });
      }
      audio().play('attack-swing');
      await lunge(hero, at);
      stage.advance(cue);
      return;
    }

    case 'death': {
      const el = stage.unit(cue.instanceId);
      const at = el ? centreOf(el) : undefined;
      if (at) lastSeen.set(cue.instanceId, at);
      stage.mark('dying', cue.instanceId, true);
      const dying = findShown(stage.shown(), cue.instanceId);
      if (dying) audio().line(dying.card.id, 'death');
      void wait(220).then(() => {
        audio().play('death');
        if (at) stage.fx()?.shards(at.x, at.y);
      });
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
      // One number drives the whole impact: knockback, shake, sparks and splat.
      if (spatial() && intensity >= 0.5) {
        const strength = Math.min(1, (intensity - 0.4) * 1.6);
        pulse(() => stage.setQuake(strength), () => stage.setQuake(0), 420);
      }
      // Heavier hits are a different sound, not just a louder one.
      if (cue.target.kind === 'hero') audio().play('hero-hurt', { volume: 0.6 + 0.4 * intensity });
      else audio().play(intensity >= 0.7 ? 'hit-heavy' : 'hit-light');
      if (cue.target.kind === 'hero') {
        const side = stage.side(cue.target.owner);
        pulse(() => stage.setHeroHit(side), () => stage.setHeroHit(null), 500);
        if (cue.health <= 0) {
          // The killing blow. The result waits for playback, so this is seen first.
          stage.setHeroDown(side);
          const at = el ? centreOf(el) : undefined;
          if (at) {
            void wait(300).then(() => {
              stage.fx()?.shards(at.x, at.y, { count: 40, speed: 520, size: 12, colors: ['#e0be76', '#9c7a3c', '#f3dc9c', '#3a2a15'] });
              stage.fx()?.ring(at.x, at.y, { size: 220, color: 'rgba(255, 220, 160, .9)', life: 0.7 });
            });
          }
          if (spatial()) pulse(() => stage.setQuake(1), () => stage.setQuake(0), 700);
        }
      } else {
        const id = cue.target.instanceId;
        pulse(() => stage.mark('struck', id, true), () => stage.mark('struck', id, false), 420);
        knockBack(stage, cue.target, intensity);
      }
      if (el) {
        const at = centreOf(el);
        stage.fx()?.sparks(at.x, at.y, { count: Math.round(8 + 22 * intensity), speed: 380 + 320 * intensity });
        stage.splat(at, 'damage', cue.amount, intensity);
      }
      return;
    }

    case 'heal': {
      audio().play('heal');
      stage.advance(cue);
      const el = elementOf(stage, cue.target);
      if (el) {
        const at = centreOf(el);
        stage.fx()?.motes(at.x, at.y, { colors: ['#d8ffd8', '#8ef0a0'] });
        stage.splat(at, 'heal', cue.amount, hitIntensity(cue.amount));
      }
      return;
    }

    case 'shield': {
      // The bubble bursts on its own (MinionView); this throws its gold out.
      const el = stage.unit(cue.instanceId);
      stage.advance(cue);
      audio().play('shield-pop');
      if (el) {
        const at = centreOf(el);
        stage.fx()?.shards(at.x, at.y, { colors: ['#fff6d0', '#ffd96a', '#f0b840'], count: 18, speed: 380, size: 6 });
        stage.fx()?.sparks(at.x, at.y, { colors: ['#fff6d0', '#ffd96a'], count: 14, speed: 420, gravity: 300 });
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
        // Growing: chevrons rise. A swap, or a loss, is shown by the numbers alone.
        if (da > 0 || dh > 0) {
          stage.fx()?.chevrons(at.x, at.y + 20);
          audio().play('buff');
        }
        if (da !== 0 || dh !== 0) stage.float(at, `${sign(da)}/${sign(dh)}`, da < 0 || dh < 0 ? '#e6d4ff' : 'var(--good)');
      }
      return;
    }

    case 'freeze':
    case 'silence':
    case 'keyword': {
      if (cue.type === 'keyword') {
        const before = findShown(stage.shown(), cue.instanceId);
        const taunts = cue.keywords.includes('Taunt') && !before?.keywords.includes('Taunt');
        audio().play(taunts ? 'taunt-up' : 'buff');
      } else audio().play(cue.type);
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

    case 'trigger': {
      pulse(() => stage.mark('triggered', cue.instanceId, true), () => stage.mark('triggered', cue.instanceId, false), 520);
      // A Deathrattle: something rises out of it as it goes.
      const el = cue.trigger === 'Deathrattle' ? stage.unit(cue.instanceId) : undefined;
      if (el) {
        const at = centreOf(el);
        stage.fx()?.motes(at.x, at.y, { colors: ['#e8ffe0', '#b8f5a0'], count: 10, speed: 60, gravity: -260, life: 1.2, size: 6 });
      }
      return;
    }

    case 'armor': {
      const side = stage.side(cue.owner);
      const gained = cue.armor - stage.shown()[side].armor;
      stage.advance(cue);
      const el = stage.hero(side);
      if (gained > 0) audio().play('armor');
      if (el && gained > 0) {
        const at = centreOf(el);
        stage.fx()?.ring(at.x, at.y, { color: 'rgba(200, 215, 230, .9)', size: 80 });
        stage.splat(at, 'armor', gained, hitIntensity(gained));
      }
      return;
    }

    case 'heroPower': {
      const side = stage.side(cue.owner);
      stage.advance(cue);
      audio().play('hero-power');
      // The disc turns over (HeroPowerButton) in a burst of its class's colour.
      const button = stage.hero(side)?.querySelector<HTMLElement>('.power');
      if (button) {
        const at = centreOf(button);
        const colors = CLASS_COLOR[stage.shown()[side].heroClass] ?? CLASS_COLOR.Neutral;
        stage.fx()?.ring(at.x, at.y, { color: colors[0], size: 90 });
        stage.fx()?.sparks(at.x, at.y, { colors, count: 18, speed: 300, gravity: 0 });
      }
      return;
    }

    case 'equip':
    case 'weaponBreak': {
      stage.advance(cue);
      audio().play(cue.type === 'equip' ? 'weapon-equip' : 'weapon-break');
      // The weapon arrives and breaks in HeroPortrait; this is the flash and the fragments.
      await tick();
      const weapon = stage.hero(stage.side(cue.owner))?.querySelector<HTMLElement>('.weapon-icon');
      const at = weapon ? centreOf(weapon) : undefined;
      if (at && cue.type === 'equip') stage.fx()?.ring(at.x, at.y, { color: 'rgba(220, 230, 240, .9)', size: 70 });
      if (at && cue.type === 'weaponBreak') stage.fx()?.shards(at.x, at.y, { colors: ['#cfd8e0', '#8a9aa8', '#5a6874'] });
      return;
    }

    case 'draw': {
      stage.advance(cue);
      // Theirs is heard, more quietly: a card reaching their hand is worth knowing.
      audio().play('card-draw', { volume: stage.side(cue.owner) === 'me' ? 1 : 0.55 });
      if (stage.side(cue.owner) === 'me') {
        // Yours leaves your deck, turns face up in flight, and lands in the fan.
        const card = stage.nextDrawn();
        await tick();
        const face = card ? stage.handCard(card) : undefined;
        const deck = stage.myDeck();
        if (!face || !deck) return;
        if (!spatial()) {
          gsap.from(face, { opacity: 0, duration: d(200) / 1000, clearProps: 'opacity' });
          return;
        }
        const from = centreOf(deck);
        const to = centreOf(face);
        const k = drawnScale(face);
        gsap.from(face, {
          x: (from.x - to.x) / k,
          y: (from.y - to.y) / k,
          scale: 0.42,
          rotationY: -100,
          rotation: -20,
          transformPerspective: 800,
          duration: d(460) / 1000,
          ease: 'power2.out',
          clearProps: 'transform'
        });
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
      // Shown and destroyed above the hand it could not join: a card lost to a
      // full hand is public, and should be seen going.
      stage.advance(cue);
      const mine = stage.side(cue.owner) === 'me';
      const at = { x: window.innerWidth / 2, y: mine ? window.innerHeight - 300 : 220 };
      stage.setShowcase({ mode: 'burn', card: cue.card, at });
      audio().play('burn');
      const embers = setInterval(() => stage.fx()?.sparks(at.x, at.y + 60, { colors: ['#ffb24a', '#ff6a2a', '#ffe08a'], count: 6, speed: 160, angle: -Math.PI / 2, spread: 0.9, gravity: -200, life: 0.7 }), 90);
      await wait(1150);
      clearInterval(embers);
      stage.setShowcase(null);
      return;
    }

    case 'fatigue': {
      // An empty card slides out of the empty deck, shows what it will cost, and strikes.
      const side = stage.side(cue.owner);
      const deck = side === 'foe' ? stage.foeDeck() : undefined;
      const from = deck ? centreOf(deck) : { x: window.innerWidth - 140, y: window.innerHeight - 240 };
      const portrait = portraitOf(stage, side);
      const strike = portrait ? centreOf(portrait) : from;
      // Held on its owner's side of the centre line, clear of the screen's edge.
      const at = { x: window.innerWidth * 0.68, y: window.innerHeight * (side === 'foe' ? 0.36 : 0.62) };
      stage.setShowcase({ mode: 'fatigue', amount: cue.amount, from, at, strike });
      audio().play('fatigue');
      await wait(950);
      stage.setShowcase(null);
      await wait(spatial() ? 260 : 120);
      return;
    }

    case 'turn': {
      const mine = stage.side(cue.owner) === 'me';
      const before = stage.shown()[stage.side(cue.owner)];
      stage.advance(cue);
      if (mine) audio().play('turn-start');
      // The crystals refill — and a new one grows — on either side; anything frozen thaws.
      audio().play(cue.maxMana > before.maxMana ? 'mana-new' : 'mana-fill', { volume: mine ? 1 : 0.5 });
      if (before.board.some((m) => m.frozen)) audio().play('thaw');
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
      audio().play('mana-fill');
      return;

    case 'stage':
      stage.advance(cue);
      return;

    case 'doom': {
      // A clock settles on it: its time is now counted.
      audio().play('fatigue', { volume: 0.7 });
      stage.advance(cue);
      const el = stage.unit(cue.instanceId);
      if (el) {
        const at = centreOf(el);
        stage.fx()?.ring(at.x, at.y, { color: 'rgba(154, 124, 255, .9)', size: 110 });
      }
      return;
    }

    case 'bounce': {
      // Lifted off the board and back towards its owner's hand.
      const el = stage.unit(cue.instanceId);
      audio().play('card-pickup');
      if (el && spatial()) {
        const mine = stage.side(cue.owner) === 'me';
        await gsap.to(el, { y: mine ? 140 : -140, scale: 0.45, opacity: 0, duration: d(380) / 1000, ease: 'power2.in' });
      }
      stage.advance(cue);
      return;
    }

    case 'transform': {
      // It turns over and comes up as something else, in a puff.
      const id = cue.instanceId;
      audio().play('card-flip');
      pulse(() => stage.mark('swapping', id, true), () => stage.mark('swapping', id, false), 520);
      await wait(260);
      stage.advance(cue);
      const el = stage.unit(id);
      if (el) {
        const at = centreOf(el);
        stage.fx()?.motes(at.x, at.y, { colors: ['#e6d4ff', '#ffffff'], count: 16, speed: 160, gravity: -60, life: 0.8, size: 6 });
      }
      return;
    }
  }
}

/** A card leaving a hand: a spell is cast, anything else is put down — and it may say something. */
function played(card: Card): void {
  audio().play(card.type === 'Spell' ? 'spell-cast' : 'card-play');
  audio().line(card.id, 'play');
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
  blow = { from };

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

  // A swap is seen as the numbers crossing over, before the new values land.
  if (cue.action === 'SwapStats') {
    const ids = cue.targets.flatMap((t) => (t.kind === 'minion' ? [t.instanceId] : []));
    for (const id of ids) stage.mark('swapping', id, true);
    await wait(450);
    for (const id of ids) stage.mark('swapping', id, false);
  }
}

/**
 * A hit pushes its target away from where the blow came from, by more for a
 * bigger hit, and it springs back. The attacker in a trade is pushed back by
 * the defender in turn.
 */
function knockBack(stage: Stage, target: CueRef, intensity: number): void {
  if (!spatial() || target.kind !== 'minion') return;
  const slot = stage.unit(target.instanceId);
  const unit = slot?.querySelector<HTMLElement>('.unit') ?? slot;
  if (!unit) return;
  const at = centreOf(unit);
  const isAttacker = blow?.attacker?.kind === 'minion' && blow.attacker.instanceId === target.instanceId;
  const origin = isAttacker ? blow?.to : blow?.from;
  if (!origin) return;
  const dx = at.x - origin.x;
  const dy = at.y - origin.y;
  const length = Math.hypot(dx, dy) || 1;
  const push = (6 + 18 * intensity) / drawnScale(unit);
  gsap
    .timeline()
    .to(unit, { x: (dx / length) * push, y: (dy / length) * push, duration: d(70) / 1000, ease: 'power2.out' })
    .to(unit, { x: 0, y: 0, duration: d(320) / 1000, ease: 'elastic.out(1, 0.45)', clearProps: 'transform' });
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
