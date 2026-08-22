-- The new-player package. Append-only: earlier migrations are applied and must
-- not be edited.
--
-- Two things arrive together, because they only exist for each other: a pack
-- inventory (packs are now awarded, not only bought — DECISIONS.md §13) and the
-- one-time intro quest track that awards them.

ALTER TABLE profiles ADD COLUMN packs INTEGER NOT NULL DEFAULT 0;

-- One row per (user, intro quest). Deliberately not the `quests` table: those
-- are keyed by UTC day and expire at midnight, and an intro quest is neither.
-- `claimed` is the payment guard — it is set by a guarded UPDATE that must
-- change a row before anything is granted, so a race pays once whatever the
-- reward is. Gold awards alone could not do that job: some intro rewards are
-- packs or a card back and carry no gold at all.
CREATE TABLE intro_quests (
  user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  quest_id TEXT NOT NULL,
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0),
  claimed  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, quest_id)
);
