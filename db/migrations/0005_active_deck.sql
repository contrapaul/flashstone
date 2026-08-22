-- Which deck a player actually plays. Append-only: earlier migrations are
-- applied and must not be edited.
--
-- Until now "your deck" meant the most recently updated one, which is a fine
-- rule for one deck and a surprising one for ten — editing a deck would silently
-- change what you take into a match. It becomes an explicit choice.
--
-- Nullable, and every reader falls back to most-recently-updated, so existing
-- accounts keep exactly the deck they had until they choose otherwise.
ALTER TABLE profiles ADD COLUMN active_deck TEXT;
