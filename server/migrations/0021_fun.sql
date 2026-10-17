-- Bigglenet 1.1: remixing sites, buttons and stamps, the weekly challenge and badges.

-- Remixing: a site made as a copy of another, and whether a site may be copied.
ALTER TABLE names ADD COLUMN remix_of TEXT;
ALTER TABLE names ADD COLUMN remixable INTEGER NOT NULL DEFAULT 1;

-- Stamps: sites people collected (shown on their profile as the sites' 88×31 buttons).
CREATE TABLE stamps (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  site TEXT NOT NULL REFERENCES names(name) ON DELETE CASCADE,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (user_id, site)
);

-- The weekly challenge: admins set a theme, people enter one of their sites, everyone votes once,
-- and when it ends the site with the most votes wins (and is the site of the day).
CREATE TABLE challenges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  about TEXT,
  starts_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  winner TEXT,
  -- 1 once it's over and the winner has been named.
  finished INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX challenges_ends ON challenges(finished, ends_at);

CREATE TABLE challenge_entries (
  challenge_id INTEGER NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  site TEXT NOT NULL REFERENCES names(name) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (challenge_id, site),
  UNIQUE (challenge_id, user_id)
);

CREATE TABLE challenge_votes (
  challenge_id INTEGER NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  site TEXT NOT NULL,
  PRIMARY KEY (challenge_id, user_id)
);

-- Badges people have earned, and the days they used the Bigglenet (for streaks).
CREATE TABLE user_badges (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge TEXT NOT NULL,
  earned_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (user_id, badge)
);

CREATE TABLE user_days (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day INTEGER NOT NULL,
  PRIMARY KEY (user_id, day)
) WITHOUT ROWID;
