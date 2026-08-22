-- Deck classes. Append-only: 0001 and 0002 are applied and must not be edited.
--
-- Nullable, because decks saved before classes existed have none. `deckProblems`
-- treats a missing class as "choose a class" rather than defaulting to one, so a
-- legacy deck surfaces as a one-click fix instead of silently playing without a
-- hero power.
ALTER TABLE decks ADD COLUMN class TEXT;
