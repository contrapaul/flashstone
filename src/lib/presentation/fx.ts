/**
 * Particles, on one canvas over the table.
 *
 * Sparks, shards, motes and rings are what make an impact feel physical, and
 * there are too many of them for DOM elements. Hand-rolled rather than a
 * library: four shapes, gravity and drag are all this needs, and the loop
 * **stops when nothing is alive**, so an idle board costs no frames at all.
 *
 * Coordinates are viewport pixels — the same space `getBoundingClientRect`
 * reports — so a choreography can aim at an element without converting.
 */

type Shape = 'spark' | 'shard' | 'mote' | 'ring';

interface Particle {
  shape: Shape;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Seconds lived, and seconds to live. */
  age: number;
  life: number;
  size: number;
  color: string;
  rotation: number;
  spin: number;
  gravity: number;
  drag: number;
}

export interface BurstOptions {
  count?: number;
  colors?: string[];
  /** Pixels per second at launch. */
  speed?: number;
  /** Launch direction in radians, and how far either side of it; omit for all round. */
  angle?: number;
  spread?: number;
  gravity?: number;
  life?: number;
  size?: number;
}

const TAU = Math.PI * 2;

/** Something travelling from one point to another, trailing light. */
interface Bolt {
  from: { x: number; y: number };
  to: { x: number; y: number };
  /** Seconds in flight, and seconds to arrive. */
  age: number;
  duration: number;
  color: string;
  size: number;
  arrive: () => void;
}

export class Fx {
  private ctx: CanvasRenderingContext2D | null;
  private parts: Particle[] = [];
  private bolts: Bolt[] = [];
  private frame = 0;
  private last = 0;
  private dpr = 1;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d');
  }

  /** Matches the backing store to the viewport at device resolution. */
  resize(width: number, height: number, dpr = 1): void {
    this.dpr = dpr;
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
  }

  get alive(): number {
    return this.parts.length + this.bolts.length;
  }

  /**
   * A projectile: a glowing head on a shallow arc from `from` to `to`, shedding
   * sparks as it goes and bursting where it lands. Resolves on arrival, so the
   * effect it carries can land then and not before.
   */
  bolt(
    from: { x: number; y: number },
    to: { x: number; y: number },
    o: { color?: string; duration?: number; size?: number } = {}
  ): Promise<void> {
    return new Promise((arrive) => {
      if (!this.ctx) return arrive();
      this.bolts.push({ from, to, age: 0, duration: o.duration ?? 0.32, color: o.color ?? '#ffb24a', size: o.size ?? 9, arrive });
      this.start();
    });
  }

  /** Bright streaks thrown out from a point: an impact. */
  sparks(x: number, y: number, o: BurstOptions = {}): void {
    this.emit('spark', x, y, { count: 14, colors: ['#fff6d8', '#ffd27a', '#ff9a4a'], speed: 520, gravity: 900, life: 0.45, size: 2.4, ...o });
  }

  /** Tumbling fragments with weight: something breaking. */
  shards(x: number, y: number, o: BurstOptions = {}): void {
    this.emit('shard', x, y, { count: 18, colors: ['#c9a46a', '#8a6a3e', '#e8d2a2', '#5a4128'], speed: 340, gravity: 1300, life: 0.9, size: 9, ...o });
  }

  /** Soft drifting lights: healing, a blessing, a summon settling. */
  motes(x: number, y: number, o: BurstOptions = {}): void {
    this.emit('mote', x, y, { count: 12, colors: ['#fff3c4', '#ffe08a'], speed: 90, gravity: -140, life: 1.1, size: 5, ...o });
  }

  /** A single expanding ring: a landing, a shockwave. */
  ring(x: number, y: number, o: { color?: string; size?: number; life?: number } = {}): void {
    this.parts.push({
      shape: 'ring', x, y, vx: 0, vy: 0, age: 0, life: o.life ?? 0.5,
      size: o.size ?? 90, color: o.color ?? 'rgba(255, 236, 190, .9)', rotation: 0, spin: 0, gravity: 0, drag: 0
    });
    this.start();
  }

  clear(): void {
    this.parts = [];
    for (const bolt of this.bolts) bolt.arrive();
    this.bolts = [];
  }

  private emit(shape: Shape, x: number, y: number, o: BurstOptions): void {
    const { count = 10, colors = ['#fff'], speed = 300, gravity = 0, life = 0.6, size = 3 } = o;
    for (let i = 0; i < count; i++) {
      const angle = o.angle === undefined ? Math.random() * TAU : o.angle + (Math.random() * 2 - 1) * (o.spread ?? 0.6);
      const v = speed * (0.45 + Math.random() * 0.75);
      this.parts.push({
        shape,
        x,
        y,
        vx: Math.cos(angle) * v,
        vy: Math.sin(angle) * v,
        age: 0,
        life: life * (0.7 + Math.random() * 0.6),
        size: size * (0.6 + Math.random() * 0.8),
        color: colors[i % colors.length],
        rotation: Math.random() * TAU,
        spin: (Math.random() * 2 - 1) * 12,
        gravity,
        drag: shape === 'mote' ? 1.6 : 0.9
      });
    }
    this.start();
  }

  private start(): void {
    if (this.frame || !this.ctx) return;
    this.last = performance.now();
    this.frame = requestAnimationFrame(this.tick);
  }

  private tick = (now: number): void => {
    const ctx = this.ctx;
    if (!ctx) return;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    this.flyBolts(ctx, dt);

    this.parts = this.parts.filter((p) => (p.age += dt) < p.life);
    for (const p of this.parts) {
      const damp = Math.exp(-p.drag * dt);
      p.vx *= damp;
      p.vy = p.vy * damp + p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rotation += p.spin * dt;
      draw(ctx, p);
    }

    // Nothing alive: stop. The next burst starts the loop again.
    this.frame = this.alive > 0 ? requestAnimationFrame(this.tick) : 0;
  };

  private flyBolts(ctx: CanvasRenderingContext2D, dt: number): void {
    const landed: Bolt[] = [];
    for (const b of this.bolts) {
      b.age += dt;
      const t = Math.min(1, b.age / b.duration);
      // Ease in: it gathers speed, so it hits rather than drifts.
      const e = t * t * (1.6 - 0.6 * t);
      const { x, y } = arc(b.from, b.to, e);
      // Trail: a few slow sparks left behind each frame.
      this.emit('spark', x, y, { count: 2, colors: [b.color, '#fff4dc'], speed: 70, gravity: 0, life: 0.28, size: b.size * 0.3 });
      ctx.globalCompositeOperation = 'lighter';
      const glow = ctx.createRadialGradient(x, y, 0, x, y, b.size * 2.4);
      glow.addColorStop(0, '#ffffff');
      glow.addColorStop(0.3, b.color);
      glow.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x, y, b.size * 2.4, 0, TAU);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      if (t >= 1) landed.push(b);
    }
    if (landed.length === 0) return;
    this.bolts = this.bolts.filter((b) => !landed.includes(b));
    for (const b of landed) {
      this.emit('spark', b.to.x, b.to.y, { count: 16, colors: [b.color, '#fff6d8'], speed: 360, gravity: 500, life: 0.4, size: 2.4 });
      b.arrive();
    }
  }
}

function draw(ctx: CanvasRenderingContext2D, p: Particle): void {
  const t = p.age / p.life;
  const fade = 1 - t * t;
  ctx.globalAlpha = Math.max(0, fade);

  switch (p.shape) {
    case 'spark': {
      // A streak along the direction of travel, brightest at its head.
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = p.color;
      ctx.lineWidth = p.size;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.vx * 0.035, p.y - p.vy * 0.035);
      ctx.stroke();
      break;
    }
    case 'shard': {
      ctx.globalCompositeOperation = 'source-over';
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.moveTo(-p.size * 0.6, -p.size * 0.4);
      ctx.lineTo(p.size * 0.7, -p.size * 0.2);
      ctx.lineTo(p.size * 0.2, p.size * 0.6);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      break;
    }
    case 'mote': {
      ctx.globalCompositeOperation = 'lighter';
      const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 2.2);
      glow.addColorStop(0, p.color);
      glow.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * 2.2, 0, TAU);
      ctx.fill();
      break;
    }
    case 'ring': {
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 4 * (1 - t) + 1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.25 + 0.75 * Math.sqrt(t)), 0, TAU);
      ctx.stroke();
      break;
    }
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

/** A point on a shallow upward arc between two points, `t` from 0 to 1. */
function arc(from: { x: number; y: number }, to: { x: number; y: number }, t: number) {
  const lift = Math.min(120, Math.hypot(to.x - from.x, to.y - from.y) * 0.25);
  const cx = (from.x + to.x) / 2;
  const cy = Math.min(from.y, to.y) - lift;
  const u = 1 - t;
  return { x: u * u * from.x + 2 * u * t * cx + t * t * to.x, y: u * u * from.y + 2 * u * t * cy + t * t * to.y };
}
