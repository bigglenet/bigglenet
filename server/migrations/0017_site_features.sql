-- More for sites: people who can edit a site with its owner, drafts (changes that wait for
-- "Publish"), comments on pages, polls, likes, game leaderboards, the shared drawing wall, and
-- stats (page views, and which sites send visitors).

CREATE TABLE site_editors (
  site TEXT NOT NULL REFERENCES names(name) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  added_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (site, user_id)
);
CREATE INDEX site_editors_user ON site_editors(user_id);

-- A live site's unpublished changes. deleted = 1: the file goes when it's published.
CREATE TABLE site_drafts (
  site TEXT NOT NULL REFERENCES names(name) ON DELETE CASCADE,
  path TEXT NOT NULL,
  type TEXT NOT NULL,
  content BLOB NOT NULL,
  size INTEGER NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (site, path)
);

CREATE TABLE page_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site TEXT NOT NULL REFERENCES names(name) ON DELETE CASCADE,
  path TEXT NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX page_comments_page ON page_comments(site, path, id);

-- A vote in a <biggle-poll>: which option (by its place in the list).
CREATE TABLE poll_votes (
  site TEXT NOT NULL REFERENCES names(name) ON DELETE CASCADE,
  poll TEXT NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  choice INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (site, poll, user_id)
);

CREATE TABLE site_likes (
  site TEXT NOT NULL REFERENCES names(name) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (site, user_id)
);
CREATE INDEX site_likes_site ON site_likes(site);

-- Each person's best score on each of a site's leaderboards.
CREATE TABLE scores (
  site TEXT NOT NULL REFERENCES names(name) ON DELETE CASCADE,
  board TEXT NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score REAL NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (site, board, user_id)
);
CREATE INDEX scores_board ON scores(site, board, score);

-- Strokes on a <biggle-wall>: points as JSON [[x, y], …] in 0–1000 across and down.
CREATE TABLE wall_strokes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site TEXT NOT NULL REFERENCES names(name) ON DELETE CASCADE,
  wall TEXT NOT NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  color TEXT NOT NULL,
  width REAL NOT NULL,
  points TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX wall_strokes_wall ON wall_strokes(site, wall, id);

-- Stats: views of each page per day, and visits that came from another site's link.
CREATE TABLE page_views (
  site TEXT NOT NULL REFERENCES names(name) ON DELETE CASCADE,
  path TEXT NOT NULL,
  day INTEGER NOT NULL,
  views INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (site, path, day)
);
CREATE TABLE site_referrals (
  site TEXT NOT NULL REFERENCES names(name) ON DELETE CASCADE,
  from_site TEXT NOT NULL,
  day INTEGER NOT NULL,
  visits INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (site, from_site, day)
);

-- Who's on the Bigglenet right now, for <biggle-online>.
ALTER TABLE users ADD COLUMN online INTEGER NOT NULL DEFAULT 0;
