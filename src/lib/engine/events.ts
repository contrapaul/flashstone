import type { PlayerId } from './state';

/**
 * Animation cues. The engine appends these as it mutates state; the UI drains
 * the queue and plays them back on a timeline, so a death can shatter before
 * it is removed from the board.
 *
 * They are cues, NOT a source of truth — replaying them does not reconstruct
 * the match. MatchState remains authoritative.
 */
export type GameEvent =
  | { type: 'draw'; owner: PlayerId }
  | { type: 'summon'; owner: PlayerId; instanceId: string }
  /** `target` is where the attacker lunges to; the UI measures the arc from it. */
  | {
      type: 'attack';
      owner: PlayerId;
      instanceId: string;
      target: { kind: 'minion'; instanceId: string } | { kind: 'hero'; owner: PlayerId };
    }
  | { type: 'damage'; target: { kind: 'minion'; instanceId: string } | { kind: 'hero'; owner: PlayerId }; amount: number }
  | { type: 'shield'; instanceId: string }
  | { type: 'death'; owner: PlayerId; instanceId: string }
  | { type: 'freeze'; instanceId: string }
  | { type: 'silence'; instanceId: string }
  | { type: 'buff'; instanceId: string }
  | { type: 'turn'; owner: PlayerId }
  /** A weapon was equipped, swung, or destroyed. */
  | { type: 'equip'; owner: PlayerId }
  | { type: 'heroAttack'; owner: PlayerId }
  | { type: 'weaponBreak'; owner: PlayerId }
  | { type: 'armor'; owner: PlayerId }
  | { type: 'heroPower'; owner: PlayerId };

/**
 * Milliseconds the UI holds on each cue before applying the next.
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
 * There is no separate cue for casting a spell, a battlecry or a deathrattle:
 * each is seen through the events it emits, which is exactly why those events
 * have to breathe. A battlecry that deals 3 and kills a minion is a `damage`
 * beat then a `death` beat, and both have to land before the next thing starts.
 */
export const EVENT_BEAT: Record<GameEvent['type'], number> = {
  // Frequent and low-stakes: several land in a row at the start of a turn.
  draw: 420,
  // A minion arriving is a board change worth watching land.
  summon: 620,
  // The lunge itself. Was 138ms after the multiplier — barely a twitch.
  attack: 520,
  damage: 500,
  shield: 480,
  // The longest of the board changes: the shatter plays out, then a moment of
  // the emptier board before whatever comes next.
  death: 720,
  freeze: 520,
  silence: 520,
  buff: 480,
  // Unchanged — the turn banner already had room.
  turn: 1300,
  equip: 540,
  heroAttack: 520,
  weaponBreak: 620,
  armor: 460,
  // A hero power is a deliberate, once-a-turn act; it should read as one.
  heroPower: 680
};
