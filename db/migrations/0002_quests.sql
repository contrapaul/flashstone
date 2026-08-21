-- Daily quests. Append-only: 0001_init.sql is applied and must not be edited.
--
-- One row per (user, day, quest). `day` is a UTC day number, the same unit the
-- daily gold bonus uses. Which three quests are active on a day is a pure
-- function of the day number (lib/quests/quests.ts), so it is never stored —
-- which also means a late progress report can always recompute yesterday's set.
CREATE TABLE quests (
  user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day      INTEGER NOT NULL,
  quest_id TEXT NOT NULL,
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0),
  claimed  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day, quest_id)
);
CREATE INDEX idx_quests_day ON quests(user_id, day);
