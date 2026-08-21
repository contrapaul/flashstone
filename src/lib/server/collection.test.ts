import { describe, expect, it } from 'vitest';
import { validateDeck } from './collection';
import { starterCollection, starterDeck } from '$lib/data/starter';
import { ALL_CARDS } from '$lib/data/cards';
import type { Owned } from '$lib/collection/owned';
import { DECK_SIZE } from '$lib/decks/deck';

const COMMON = ALL_CARDS.find((c) => c.rarity === 'Common')!;
const LEGENDARY = ALL_CARDS.find((c) => c.rarity === 'Legendary')!;

describe('server-side deck validation', () => {
  it('accepts the starter deck', () => {
    expect(validateDeck(starterDeck(), starterCollection())).toEqual([]);
  });

  // The whole point: a client that posts a deck it cannot field is refused.
  it('rejects three copies of a Common even when the client sent them', () => {
    const owned: Owned = { [COMMON.id]: { copies: 2, gold: 0 } };
    const deck = { name: 'Cheat', cardIds: Array(DECK_SIZE).fill(COMMON.id) };
    const problems = validateDeck(deck, owned);
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.join(' ')).toMatch(/copies/i);
  });

  it('rejects two copies of a Legendary', () => {
    const owned: Owned = { [LEGENDARY.id]: { copies: 2, gold: 0 } };
    const deck = { name: 'x', cardIds: [LEGENDARY.id, LEGENDARY.id] };
    expect(validateDeck(deck, owned).join(' ')).toMatch(/Legendary/);
  });

  it('rejects cards the player does not own', () => {
    const deck = { name: 'x', cardIds: Array(DECK_SIZE).fill(COMMON.id) };
    expect(validateDeck(deck, {}).join(' ')).toMatch(/don't own/);
  });

  it('rejects cards that are not in the registry', () => {
    const deck = { name: 'x', cardIds: ['made-up-card'] };
    expect(validateDeck(deck, {}).join(' ')).toMatch(/no longer exist/);
  });

  it('rejects a missing or oversized name', () => {
    expect(validateDeck({ name: '', cardIds: [] }, {})[0]).toMatch(/name/);
    expect(validateDeck({ name: 'x'.repeat(61), cardIds: [] }, {})[0]).toMatch(/name/);
  });

  it('rejects a malformed card list without throwing', () => {
    const deck = { name: 'x', cardIds: 'not-an-array' } as never;
    expect(validateDeck(deck, {}).join(' ')).toMatch(/malformed/);
  });

  it('rejects a short deck', () => {
    expect(validateDeck({ name: 'x', cardIds: [] }, {}).join(' ')).toMatch(/0 of 30/);
  });
});
