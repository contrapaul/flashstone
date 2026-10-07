import type { Action, Card, Trigger } from '../../types/cards';
import type { MinionSnapshot, PlayerId, WeaponSnapshot } from './state';

/** Something on the board a cue can point at. */
export type CueRef = { kind: 'minion'; instanceId: string } | { kind: 'hero'; owner: PlayerId };

/**
 * Animation cues. The engine appends these as it mutates state; the UI drains
 * the queue and plays them back on a timeline, so a death can shatter before
 * it is removed from the board.
 *
 * **Each cue carries what it produced** — health after a hit, the minion that
 * was summoned, mana after a card — so the table can show the board exactly as
 * it stood between any two cues, by folding them in order over the view it
 * started from (`presentation/apply.ts`). `apply.test.ts` replays whole matches
 * to prove the fold lands where the engine did; a mutation that forgets to emit
 * fails that test and names itself.
 *
 * They are still cues, NOT a source of truth: MatchState remains authoritative,
 * and the table snaps to the view when playback ends. Nothing here may reveal
 * a hidden card — `draw` names no card, because both players receive every cue.
 */
export type GameEvent = Cue & {
  /**
   * Set on the cue that begins a history entry (`state.history[n]`), so the
   * table can uncover that entry once its action has begun to play.
   */
  entry?: number;
};

type Cue =
  | { type: 'draw'; owner: PlayerId; deckCount: number }
  /**
   * A card left a hand. Emitted before anything it does, so the table can show
   * it being played — the only way an opponent's spell is seen as a spell
   * rather than as its side-effects. The card is public from this moment.
   */
  | { type: 'play'; owner: PlayerId; card: Card; handIndex: number; target?: CueRef; mana: number }
  /** `after` is the minion to its left once it lands, or null at the left end. */
  | { type: 'summon'; owner: PlayerId; instanceId: string; minion: MinionSnapshot; after: string | null }
  /** `target` is where the attacker lunges to; the UI measures the arc from it. */
  | { type: 'attack'; owner: PlayerId; instanceId: string; target: CueRef }
  | { type: 'damage'; target: CueRef; amount: number; health: number; armor?: number }
  | { type: 'heal'; target: CueRef; amount: number; health: number }
  | { type: 'shield'; instanceId: string }
  | { type: 'death'; owner: PlayerId; instanceId: string }
  | { type: 'freeze'; instanceId: string }
  | { type: 'silence'; instanceId: string }
  | { type: 'buff'; instanceId: string; attack: number; health: number; maxHealth: number }
  | { type: 'keyword'; instanceId: string; keywords: string[]; divineShield: boolean }
  | { type: 'turn'; owner: PlayerId; turnNumber: number; mana: number; maxMana: number }
  /** Mana gained mid-turn (The Coin). */
  | { type: 'mana'; owner: PlayerId; mana: number }
  | { type: 'equip'; owner: PlayerId; weapon: WeaponSnapshot }
  /** `durability` is what the weapon has left after this swing. */
  | { type: 'heroAttack'; owner: PlayerId; target: CueRef; durability: number }
  | { type: 'weaponBreak'; owner: PlayerId }
  | { type: 'armor'; owner: PlayerId; armor: number }
  | { type: 'heroPower'; owner: PlayerId; mana: number }
  /** A minion's text fires — lights it before whatever it does. */
  | { type: 'trigger'; instanceId: string; trigger: Trigger }
  /**
   * An effect is about to resolve against these targets. Emitted before it
   * lands, so a projectile or a target line can travel first. `source` is null
   * for a spell or a hero power — it flies from the caster's hero.
   *
   * `aim` says how the target was found: picked by a player (`chosen`), drawn
   * by chance (`random`, with the `candidates` it was drawn from, when there
   * was more than one), or fixed by the card's text (`auto` — "all enemies").
   */
  | {
      type: 'effect';
      owner: PlayerId;
      source: CueRef | null;
      action: Action;
      targets: CueRef[];
      aim: 'chosen' | 'random' | 'auto';
      candidates?: CueRef[];
    }
  /**
   * A minion goes back to its owner's hand — or, the hand being full, is lost.
   * Public: it was on the board. `handCount` is the hand after it.
   */
  | { type: 'bounce'; owner: PlayerId; instanceId: string; handCount: number; lost: boolean }
  /** A Discover offers its caster `count` options. Which ones is the caster's business only. */
  | { type: 'discover'; owner: PlayerId; count: number }
  /** A card joins a hand without being drawn — a Discover's pick. Never names it. */
  | { type: 'gain'; owner: PlayerId; handCount: number; lost: boolean }
  /** Staged text moved on: `stage` fires next. */
  | { type: 'stage'; instanceId: string; stage: number }
  /** A minion is marked to be destroyed at the end of a coming turn. */
  | { type: 'doom'; instanceId: string }
  /** A minion becomes something else where it stands. */
  | { type: 'transform'; instanceId: string; minion: MinionSnapshot }
  /** Drawn into a full hand and destroyed. Public, as in Hearthstone. */
  | { type: 'burn'; owner: PlayerId; card: Card; deckCount: number }
  /** An empty deck deals damage; the `damage` cue that follows carries it. */
  | { type: 'fatigue'; owner: PlayerId; amount: number };

/**
 * Milliseconds the UI holds **after** each cue before playing the next.
 *
 * The cue's own animation is not in here when the director awaits it — the
 * lunge, the shatter, the reveal — only the pause that follows it. All of
 * these pass through `d()`, so the motion setting and the opponent's pace
 * scale them.
 *
 * **These are the real numbers.** They used to be multiplied by 0.6 where they
 * were consumed, which made the table here a lie and the game far too fast to
 * follow: a spell resolved, its damage landed and a minion died inside about
 * 400ms total, so a player saw the aftermath rather than the sequence.
 *
 * The pacing rule is that **a cue is held long enough for its own animation to
 * finish, plus a moment to read the result.** Something that changes the board
 * permanently — a death, a summon, a hero power — gets a longer beat than
 * something that only flashes a number.
 *
 * A card being played has its own cue (`play`), but there is no separate cue
 * for what a spell, a battlecry or a deathrattle then *does*: each is seen
 * through the events it emits, which is exactly why those events have to
 * breathe. A battlecry that deals 3 and kills a minion is a `damage`
 * beat then a `death` beat, and both have to land before the next thing starts.
 */
export const EVENT_BEAT: Record<GameEvent['type'], number> = {
  // Frequent and low-stakes: several land in a row at the start of a turn.
  draw: 420,
  // The table holds the reveal itself; this is only the breath after it.
  play: 120,
  // A minion arriving is a board change worth watching land.
  summon: 620,
  // The director holds the lunge until contact; the hit lands straight after.
  attack: 40,
  damage: 500,
  shield: 480,
  // The director holds the 600ms shatter; this is the moment of the emptier
  // board before whatever comes next.
  death: 260,
  freeze: 520,
  silence: 520,
  buff: 480,
  // Unchanged — the turn banner already had room.
  turn: 1300,
  equip: 540,
  heroAttack: 40,
  weaponBreak: 620,
  armor: 460,
  // A hero power is a deliberate, once-a-turn act; it should read as one.
  heroPower: 680,
  heal: 480,
  keyword: 420,
  mana: 300,
  // A flare on the minion before its effect; the effect carries the weight.
  trigger: 260,
  // The director holds the target line and the projectile itself.
  effect: 0,
  bounce: 420,
  transform: 560,
  doom: 640,
  stage: 200,
  discover: 300,
  gain: 420,
  burn: 900,
  fatigue: 700
};
