-- One record type: a send (one person, one branch, one grade, one date).
-- Everything else exists only to give that record a shared, comparable scale.

CREATE TABLE members (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  emoji      TEXT NOT NULL DEFAULT '🧗'
);

-- A grading system is one gym operator's ladder. It belongs to the CHAIN, not
-- the branch: every Boulder Movement uses BM's grades, so a personal best is
-- per chain and the branch is just where it happened.
--
-- `confidence` is load-bearing. 'sourced' means the chain publishes a V-grade
-- mapping, or a public conversion table does. 'estimated' means someone (me,
-- or you) interpolated it — those comparisons are shown dashed in the UI so a
-- guess never quietly reads as a fact.
CREATE TABLE systems (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  confidence TEXT NOT NULL CHECK (confidence IN ('sourced', 'estimated')),
  source     TEXT
);

-- `rank` is the shared scale: (V-grade + 3) x 10, so V1 = 40 and V8 = 110.
-- The +3 offset keeps the sub-V0 end of gym-specific ladders positive.
-- `ordinal` is display order within the ladder, since ranks can tie.
CREATE TABLE grades (
  id         INTEGER PRIMARY KEY,
  system_id  TEXT NOT NULL REFERENCES systems(id),
  label      TEXT NOT NULL,
  rank       INTEGER NOT NULL,
  ordinal    INTEGER NOT NULL,
  colour     TEXT,
  UNIQUE (system_id, label)
);

CREATE TABLE chains (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  system_id  TEXT NOT NULL REFERENCES systems(id)
);

CREATE TABLE gyms (
  id         INTEGER PRIMARY KEY,
  chain_id   INTEGER NOT NULL REFERENCES chains(id),
  -- '' means the chain has a single location. NOT NULL because SQLite does
  -- not treat NULLs as equal, so a nullable branch would defeat UNIQUE.
  branch     TEXT NOT NULL DEFAULT '',
  UNIQUE (chain_id, branch)
);

CREATE TABLE sends (
  id         INTEGER PRIMARY KEY,
  member_id  INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  gym_id     INTEGER NOT NULL REFERENCES gyms(id),
  grade_id   INTEGER NOT NULL REFERENCES grades(id),
  sent_on    TEXT NOT NULL,
  note       TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX sends_member ON sends (member_id);
CREATE INDEX sends_gym ON sends (gym_id);
CREATE INDEX sends_sent_on ON sends (sent_on DESC);
