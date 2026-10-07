import { get } from 'svelte/store';
import { settings, type Volume } from './settings';

/**
 * Sound and music, ported from Tome of Secrets' `app/audio.ts`.
 *
 * Web Audio, unlocked by the first pointer or key press (browsers require it),
 * with master, music and sound gains from settings, and silence while the tab
 * is hidden. Every sound is optional: a name with no file is silence, and
 * nothing in the game waits on audio. `static/audio/README.md` lists the names.
 *
 * The manifest is the folder itself, read at build time the way `utils/art.ts`
 * reads art — there is nothing to register. `hit-light-2.wav` is a second take
 * of `hit-light`; one is picked at random each time, and every sound plays a
 * few percent off pitch, so repeats never sound stamped.
 */

export type SfxId =
  | 'card-draw' | 'card-hover' | 'card-pickup' | 'card-play'
  | 'minion-land' | 'minion-land-heavy' | 'spell-cast' | 'attack-swing'
  | 'hit-light' | 'hit-heavy' | 'hero-hurt' | 'death' | 'shield-pop' | 'taunt-up'
  | 'freeze' | 'thaw' | 'silence' | 'buff' | 'heal' | 'armor'
  | 'weapon-equip' | 'weapon-break' | 'hero-power'
  | 'mana-fill' | 'mana-new' | 'no-mana' | 'burn' | 'fatigue'
  | 'turn-start' | 'turn-end' | 'fuse' | 'emote' | 'victory' | 'defeat'
  | 'pack-open' | 'card-flip' | 'reveal-rare' | 'reveal-epic' | 'reveal-legendary'
  | 'gold' | 'quest-complete' | 'ui-click' | 'ui-hover';

/** What a card can say, when a file for it exists: `cards/<card-id>-play.wav`. */
export type CardLine = 'play' | 'attack' | 'death';

// ── The manifest ───────────────────────────────────────────────

// Vite reads these patterns at build time, so each must be written out in full.
const SFX_FILES = import.meta.glob('/static/audio/sfx/*.{wav,mp3,m4a,ogg}');
const MUSIC_FILES = import.meta.glob('/static/audio/music/*.{wav,mp3,m4a,ogg}');
const CARD_FILES = import.meta.glob('/static/audio/cards/*.{wav,mp3,m4a,ogg}');
// Listed, never imported: Vite cannot import from `static/`, so a track's loop
// points are fetched with the track itself.
const LOOP_FILES = import.meta.glob('/static/audio/music/*.json');

/** `/static/audio/sfx/hit-light-2.wav` → [`hit-light-2`, `/audio/sfx/hit-light-2.wav`]. */
function files(modules: Record<string, unknown>): [string, string][] {
  return Object.keys(modules).map((path) => {
    const file = path.slice(path.lastIndexOf('/') + 1);
    return [file.slice(0, file.lastIndexOf('.')), path.replace('/static', '')];
  });
}

/** Takes are grouped under one name: `hit-light`, `hit-light-2`, `hit-light-3`. */
const SFX = new Map<string, string[]>();
for (const [stem, url] of files(SFX_FILES)) {
  const name = stem.replace(/-\d+$/, '');
  SFX.set(name, [...(SFX.get(name) ?? []), url]);
}

/** Music keys are whole stems — `match-2` is a track of its own, not a take. */
const LOOPS = new Map(files(LOOP_FILES));
const MUSIC = new Map(files(MUSIC_FILES).map(([key, url]) => [key, { url, loops: LOOPS.get(key) }]));

const LINES = new Map(files(CARD_FILES));

/** The match tracks present, in order: `match-1`, `match-2`… */
export const MATCH_TRACKS = [...MUSIC.keys()].filter((k) => /^match-\d+$/.test(k)).sort();

// ── The service ────────────────────────────────────────────────

const CROSSFADE = 0.9;

export interface PlayOptions {
  /** 0–1, on top of the sound setting. */
  volume?: number;
  /** Playback rate. */
  rate?: number;
  /** Random pitch spread, e.g. 0.06 for ±6%. */
  spread?: number;
}

interface Track {
  key: string;
  source: AudioBufferSourceNode;
  gain: GainNode;
  /** When it started, so a layer can join it in step. */
  startedAt: number;
}

class AudioService {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private readonly buffers = new Map<string, Promise<AudioBuffer | null>>();
  private current: Track | null = null;
  private layer: Track | null = null;
  private wanted: string | null = null;
  /** The track being fetched, so asking for it twice does not start it twice. */
  private loading: string | null = null;
  private wantTension = false;
  private volumes: Volume;
  private hidden = false;
  /** In dev, the last sounds asked for — `__fs.audio.heard` in the console. */
  readonly heard: string[] = [];

  constructor() {
    this.volumes = get(settings).volume;
    settings.subscribe((s) => {
      this.volumes = s.volume;
      this.applyVolumes();
    });
    const unlock = () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      this.start();
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    document.addEventListener('visibilitychange', () => {
      this.hidden = document.hidden;
      this.applyVolumes();
    });
  }

  private start(): void {
    if (this.ctx) return;
    try {
      this.ctx = new AudioContext();
    } catch {
      return;
    }
    this.master = this.ctx.createGain();
    this.musicGain = this.ctx.createGain();
    this.sfxGain = this.ctx.createGain();
    this.musicGain.connect(this.master);
    this.sfxGain.connect(this.master);
    this.master.connect(this.ctx.destination);
    this.applyVolumes();
    void this.ctx.resume();
    // Warm the cache: sounds are short, and a hit should not wait on a fetch.
    for (const urls of SFX.values()) for (const url of urls) void this.load(url);
    if (this.wanted) this.music(this.wanted);
  }

  private applyVolumes(): void {
    if (!this.ctx || !this.master || !this.musicGain || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.hidden ? 0 : this.volumes.master, t, 0.05);
    this.musicGain.gain.setTargetAtTime(this.volumes.music, t, 0.05);
    this.sfxGain.gain.setTargetAtTime(this.volumes.sfx, t, 0.05);
  }

  private load(url: string): Promise<AudioBuffer | null> {
    let p = this.buffers.get(url);
    if (!p) {
      p = (async () => {
        try {
          const res = await fetch(url);
          if (!res.ok) throw new Error(String(res.status));
          return await this.ctx!.decodeAudioData(await res.arrayBuffer());
        } catch (err) {
          console.warn(`audio: could not load ${url}`, err);
          return null;
        }
      })();
      this.buffers.set(url, p);
    }
    return p;
  }

  private note(what: string): void {
    if (!import.meta.env.DEV) return;
    this.heard.push(what);
    if (this.heard.length > 60) this.heard.shift();
  }

  private sound(url: string, opts: PlayOptions, loop = false): Promise<AudioBufferSourceNode | null> {
    return this.load(url).then((buffer) => {
      if (!buffer || !this.ctx || !this.sfxGain) return null;
      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = loop;
      const spread = opts.spread ?? 0.04;
      source.playbackRate.value = (opts.rate ?? 1) * (1 + (Math.random() * 2 - 1) * spread);
      const gain = this.ctx.createGain();
      gain.gain.value = opts.volume ?? 1;
      source.connect(gain);
      gain.connect(this.sfxGain);
      source.start();
      return source;
    });
  }

  /** Plays a sound now, if there is a file for it and audio is unlocked. */
  play(id: SfxId, opts: PlayOptions = {}): void {
    this.note(id);
    const urls = SFX.get(id);
    if (!urls || !this.ctx || this.volumes.sfx === 0) return;
    void this.sound(urls[Math.floor(Math.random() * urls.length)]!, opts);
  }

  /** A sound that repeats until the returned function is called — the fuse. */
  loop(id: SfxId, opts: PlayOptions = {}): () => void {
    this.note(`${id} (loop)`);
    const urls = SFX.get(id);
    if (!urls || !this.ctx) return () => {};
    let stopped = false;
    let source: AudioBufferSourceNode | null = null;
    void this.sound(urls[0]!, { spread: 0, ...opts }, true).then((s) => {
      source = s;
      if (stopped) source?.stop();
    });
    return () => {
      stopped = true;
      source?.stop();
    };
  }

  /** A card's own line — its voice as it is played, attacks or dies — when one was recorded. */
  line(cardId: string, kind: CardLine): void {
    const url = LINES.get(`${cardId}-${kind}`);
    if (!url || !this.ctx) return;
    this.note(`${cardId}-${kind}`);
    void this.sound(url, { spread: 0.02 });
  }

  /** The music key playing now, if any. */
  get playing(): string | null {
    return this.current?.key ?? null;
  }

  /** Crossfades to a music track, or to silence with null. The same key: nothing happens. */
  music(key: string | null): void {
    if (key !== this.wanted && key) this.note(`music: ${key}`);
    this.wanted = key;
    if (!this.ctx || !this.musicGain) return;
    if (this.current?.key === key || (key && this.loading === key)) return;
    this.fadeOut(this.current);
    this.current = null;
    this.fadeOut(this.layer);
    this.layer = null;
    const entry = key ? MUSIC.get(key) : undefined;
    if (!key || !entry) return;
    this.loading = key;
    void this.track(key, entry).then((track) => {
      if (this.loading === key) this.loading = null;
      // The page may have moved on while the file loaded.
      if (!track) return;
      if (this.wanted !== key) return this.fadeOut(track);
      this.current = track;
      if (this.wantTension) this.tension(true);
    });
  }

  /**
   * The `tense` layer, over whatever match track is playing: it fades in when a
   * hero is low and out when the danger passes. It starts in step with the track
   * under it, so a layer written to the same length stays in time.
   */
  tension(on: boolean): void {
    this.wantTension = on;
    if (!this.ctx) return;
    if (!on) {
      this.fadeOut(this.layer);
      this.layer = null;
      return;
    }
    const entry = MUSIC.get('tense');
    if (this.layer || !entry || !this.current) return;
    const under = this.current;
    void this.track('tense', entry, under).then((track) => {
      if (!track) return;
      if (!this.wantTension || this.current !== under) return this.fadeOut(track);
      this.layer = track;
    });
  }

  /** A one-off on the music bus — victory, defeat — with the music faded out under it. */
  sting(key: 'victory' | 'defeat'): void {
    this.note(`sting: ${key}`);
    const entry = MUSIC.get(key);
    if (!entry) return this.play(key);
    this.music(null);
    if (!this.ctx || !this.musicGain) return;
    const ctx = this.ctx;
    const gain = this.musicGain;
    void this.load(entry.url).then((buffer) => {
      if (!buffer) return;
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(gain);
      source.start();
    });
  }

  private track(key: string, entry: { url: string; loops?: string }, syncTo?: Track): Promise<Track | null> {
    const ctx = this.ctx!;
    return Promise.all([this.load(entry.url), loopPoints(entry.loops)]).then(([buffer, loop]) => {
      if (!buffer || !this.musicGain) return null;
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      if (loop.loopStart !== undefined) source.loopStart = loop.loopStart;
      if (loop.loopEnd !== undefined) source.loopEnd = loop.loopEnd;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      gain.gain.setTargetAtTime(1, ctx.currentTime, CROSSFADE / 3);
      source.connect(gain);
      gain.connect(this.musicGain);
      const offset = syncTo ? (ctx.currentTime - syncTo.startedAt) % buffer.duration : 0;
      source.start(0, offset);
      return { key, source, gain, startedAt: ctx.currentTime - offset };
    });
  }

  private fadeOut(track: Track | null): void {
    if (!track || !this.ctx) return;
    track.gain.gain.setTargetAtTime(0, this.ctx.currentTime, CROSSFADE / 3);
    track.source.stop(this.ctx.currentTime + CROSSFADE * 2);
  }
}

/** A track's sidecar — `{ "loopStart": 4.0, "loopEnd": 92.5 }` — or none. A bad one is ignored. */
async function loopPoints(url: string | undefined): Promise<{ loopStart?: number; loopEnd?: number }> {
  if (!url) return {};
  try {
    const res = await fetch(url);
    const data = res.ok ? await res.json() : {};
    const seconds = (v: unknown) => (typeof v === 'number' && v >= 0 ? v : undefined);
    return { loopStart: seconds(data.loopStart), loopEnd: seconds(data.loopEnd) };
  } catch {
    return {};
  }
}

let service: AudioService | null = null;

/** Called once, in the browser, from the layout. */
export function initAudio(): void {
  if (service || typeof window === 'undefined') return;
  service = new AudioService();
  if (import.meta.env.DEV) (window as unknown as { __fs?: object }).__fs = { audio: service };
}

const silent = {
  play(): void {},
  loop: () => () => {},
  line(): void {},
  music(): void {},
  tension(): void {},
  sting(): void {},
  playing: null
};

type Audio = Pick<AudioService, 'play' | 'loop' | 'line' | 'music' | 'tension' | 'sting' | 'playing'>;

/** The audio service, or a silent stand-in before it starts (and on the server, and in tests). */
export function audio(): Audio {
  return service ?? silent;
}
