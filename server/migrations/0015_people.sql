-- Profiles: a short bio, a picture (in the files database, see files.ts; avatar_v changes with each new
-- one), a status ("📚 Revising", until a time), and what you're up to on the Bigglenet
-- ("Playing GTA V"), which friends only see if you turn sharing on.
ALTER TABLE users ADD COLUMN bio TEXT;
ALTER TABLE users ADD COLUMN avatar_v INTEGER;
ALTER TABLE users ADD COLUMN status_text TEXT;
ALTER TABLE users ADD COLUMN status_emoji TEXT;
ALTER TABLE users ADD COLUMN status_until INTEGER;
ALTER TABLE users ADD COLUMN share_activity INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN activity TEXT;
ALTER TABLE users ADD COLUMN activity_at INTEGER;

-- People you've blocked: they can't add you, message you or sign your sites' guestbooks, and
-- you don't see what they write.
CREATE TABLE blocks (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (user_id, blocked_id)
);
CREATE INDEX blocks_blocked ON blocks(blocked_id);

-- The notification centre (the bell): someone signed your guestbook, your site was approved…
-- data is JSON, shaped by kind. Milliseconds.
CREATE TABLE notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  data TEXT NOT NULL DEFAULT '{}',
  read INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX notifications_user ON notifications(user_id, id);

-- Achievements sites give their visitors (biggle.achieve()), shown on profiles.
CREATE TABLE achievements (
  site TEXT NOT NULL REFERENCES names(name) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (site, user_id, key)
);
CREATE INDEX achievements_user ON achievements(user_id, created_at);
