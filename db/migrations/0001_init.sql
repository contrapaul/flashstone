-- Accounts, sessions, and Flashstone's own state.
--
-- The four account tables are lifted from the `time` repo unchanged (which took
-- them from make/bloodbowl) so the ported auth code works without edits.

CREATE TABLE users (
  id             TEXT PRIMARY KEY,
  email          TEXT NOT NULL UNIQUE COLLATE NOCASE,
  username       TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash  TEXT NOT NULL,
  email_verified INTEGER NOT NULL DEFAULT 0,
  created_at     INTEGER NOT NULL
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

CREATE TABLE auth_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL CHECK (kind IN ('reset','verify')),
  expires_at INTEGER NOT NULL,
  used_at    INTEGER
);
CREATE INDEX idx_auth_tokens_user ON auth_tokens(user_id, kind);

CREATE TABLE rate_limits (
  key        TEXT PRIMARY KEY,
  count      INTEGER NOT NULL,
  window_end INTEGER NOT NULL
);

-- ── Flashstone ───────────────────────────────────────────────────────────────

-- One row per user. Gold is written only by the server.
CREATE TABLE profiles (
  user_id    TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  gold       INTEGER NOT NULL DEFAULT 0 CHECK (gold >= 0),
  card_back  TEXT NOT NULL DEFAULT 'default',
  -- UTC day number of the last claimed daily bonus. Compared as a day number,
  -- never as elapsed hours, or the bonus drifts an hour later each day.
  last_login INTEGER,
  created_at INTEGER NOT NULL
);

-- Ownership, per DECISIONS.md §2 and §10.
--
-- `card_id` is a free-text slug on purpose: cards are added by editing the
-- registry (DECISIONS.md §9), so no migration should ever enumerate the card
-- set. "Collection complete" is derived at read time and never stored.
CREATE TABLE owned_cards (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  card_id TEXT NOT NULL,
  copies  INTEGER NOT NULL CHECK (copies BETWEEN 1 AND 2),
  -- Gold copies override standard ones rather than adding to the total.
  gold    INTEGER NOT NULL DEFAULT 0 CHECK (gold >= 0 AND gold <= copies),
  PRIMARY KEY (user_id, card_id)
);

CREATE TABLE decks (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  card_ids   TEXT NOT NULL,   -- JSON array of 30 card ids
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_decks_owner ON decks(user_id, updated_at DESC);

-- Every gold award is recorded, so awarding twice for the same thing is
-- impossible rather than merely unlikely. `source` is 'daily' | 'win' | 'quest',
-- `ref` is the UTC day number, the match id, or the quest id + day.
CREATE TABLE gold_awards (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source     TEXT NOT NULL,
  ref        TEXT NOT NULL,
  amount     INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, source, ref)
);
