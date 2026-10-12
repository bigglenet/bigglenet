-- Visits: who came by each site, one row per person per site per day. Site owners see the
-- counts in My sites, and pages can show them with <biggle-visits>.
CREATE TABLE site_visits (
  site TEXT NOT NULL REFERENCES names(name) ON DELETE CASCADE,
  day INTEGER NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (site, day, user_id)
) WITHOUT ROWID;

-- Guestbooks: notes visitors leave on a site, shown by <biggle-guestbook>.
CREATE TABLE guestbook (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site TEXT NOT NULL REFERENCES names(name) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX guestbook_site ON guestbook(site, id);
