import { writable } from 'svelte/store';

/** A claimed quest, waiting its turn to slide in (REVISIONS R10.4). */
export interface Reward {
  label: string;
  gold: number;
  packs: number;
  back: boolean;
}

/**
 * Claimed quests, shown one at a time by the layout's reward toast: claiming
 * three in a row queues three, rather than stacking them over each other.
 */
function createRewards() {
  const { subscribe, update } = writable<Reward[]>([]);
  return {
    subscribe,
    push: (reward: Reward) => update((queue) => [...queue, reward]),
    /** The one on screen is done. */
    shift: () => update((queue) => queue.slice(1))
  };
}

export const rewards = createRewards();
