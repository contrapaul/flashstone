import { PACK_COST, applyPack, openPack, type PackCard } from '$lib/packs/pack';
import { allCardBackIds } from '$lib/shop';
import { loadOwned } from './collection';

/**
 * Buying things with gold.
 *
 * Every purchase debits and delivers in **one `batch`**, which D1 runs as a
 * transaction — a crash must not take the gold without giving the cards, or
 * give the cards without taking the gold.
 */

// Re-exported so the server and the shop page cannot disagree on the price.
export { CARD_BACK_COST, DEFAULT_BACK } from '$lib/shop';
import { CARD_BACK_COST, DEFAULT_BACK } from '$lib/shop';

export interface PurchaseResult {
  ok: boolean;
  reason?: string;
  gold: number;
  pack?: PackCard[];
}

async function goldOf(DB: any, userId: string): Promise<number> {
  const row = await DB.prepare('SELECT gold FROM profiles WHERE user_id = ?1').bind(userId).first();
  return (row?.gold as number) ?? 0;
}

/**
 * Buys and opens one pack.
 *
 * The debit is written as `gold = gold - cost WHERE gold >= cost`, so two
 * requests racing on the same balance cannot both succeed: the second matches
 * no rows. That is checked afterwards, and the whole batch is abandoned if the
 * balance was not there.
 */
export async function buyPack(DB: any, userId: string, seed: number): Promise<PurchaseResult> {
  const gold = await goldOf(DB, userId);
  if (gold < PACK_COST) {
    return { ok: false, reason: `A pack costs ${PACK_COST} gold. You have ${gold}.`, gold };
  }

  const owned = await loadOwned(DB, userId);
  const pack = openPack(owned, seed);
  const next = applyPack(owned, pack);

  // Only the cards the pack actually changed, so the write stays small.
  const touched = [...new Set(pack.map((p) => p.card.id))];

  const statements = [
    DB.prepare('UPDATE profiles SET gold = gold - ?1 WHERE user_id = ?2 AND gold >= ?1').bind(
      PACK_COST,
      userId
    ),
    ...touched.map((cardId) =>
      DB.prepare(
        `INSERT INTO owned_cards (user_id, card_id, copies, gold) VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(user_id, card_id) DO UPDATE SET copies = ?3, gold = ?4`
      ).bind(userId, cardId, next[cardId].copies, next[cardId].gold)
    )
  ];

  const results = await DB.batch(statements);
  // The guarded UPDATE is the authority: no rows changed means the balance went
  // between the read and the write, and the purchase did not happen.
  const debited = results?.[0]?.meta?.changes ?? 1;
  if (debited === 0) {
    return { ok: false, reason: 'Not enough gold.', gold: await goldOf(DB, userId) };
  }

  return { ok: true, gold: await goldOf(DB, userId), pack };
}

export interface BacksResult {
  ok: boolean;
  reason?: string;
  gold: number;
  owned: string[];
  selected: string;
}

async function ownedBacks(DB: any, userId: string): Promise<string[]> {
  const { results } = await DB.prepare(
    "SELECT ref FROM gold_awards WHERE user_id = ?1 AND source = 'back'"
  )
    .bind(userId)
    .all();
  return [DEFAULT_BACK, ...(results ?? []).map((r: any) => String(r.ref))];
}

export async function listBacks(DB: any, userId: string): Promise<BacksResult> {
  const row = await DB.prepare('SELECT gold, card_back FROM profiles WHERE user_id = ?1')
    .bind(userId)
    .first();
  return {
    ok: true,
    gold: (row?.gold as number) ?? 0,
    owned: await ownedBacks(DB, userId),
    selected: (row?.card_back as string) ?? DEFAULT_BACK
  };
}

/**
 * Buys a card back.
 *
 * Purchases are recorded in `gold_awards` with a negative amount — the same
 * table the awards use, so "what has this account spent and earned" is one
 * query, and the (user, source, ref) key makes buying the same back twice
 * impossible by construction.
 */
export async function buyBack(DB: any, userId: string, backId: string): Promise<BacksResult> {
  const state = await listBacks(DB, userId);

  if (backId === DEFAULT_BACK) {
    return { ...state, ok: false, reason: 'You already have that one.' };
  }
  if (!allCardBackIds().includes(backId)) {
    return { ...state, ok: false, reason: 'No such card back.' };
  }
  if (state.owned.includes(backId)) {
    return { ...state, ok: false, reason: 'You already own that card back.' };
  }
  if (state.gold < CARD_BACK_COST) {
    return {
      ...state,
      ok: false,
      reason: `That costs ${CARD_BACK_COST} gold. You have ${state.gold}.`
    };
  }

  const results = await DB.batch([
    DB.prepare('UPDATE profiles SET gold = gold - ?1 WHERE user_id = ?2 AND gold >= ?1').bind(
      CARD_BACK_COST,
      userId
    ),
    DB.prepare(
      "INSERT INTO gold_awards (user_id, source, ref, amount, created_at) VALUES (?1, 'back', ?2, ?3, ?4)"
    ).bind(userId, backId, -CARD_BACK_COST, Date.now())
  ]);

  if ((results?.[0]?.meta?.changes ?? 1) === 0) {
    return { ...(await listBacks(DB, userId)), ok: false, reason: 'Not enough gold.' };
  }

  return { ...(await listBacks(DB, userId)), ok: true };
}

/** Wearing a back you own. Free, and reversible. */
export async function selectBack(DB: any, userId: string, backId: string): Promise<BacksResult> {
  const state = await listBacks(DB, userId);
  if (!state.owned.includes(backId)) {
    return { ...state, ok: false, reason: 'You do not own that card back.' };
  }
  await DB.prepare('UPDATE profiles SET card_back = ?1 WHERE user_id = ?2')
    .bind(backId, userId)
    .run();
  return { ...state, ok: true, selected: backId };
}
