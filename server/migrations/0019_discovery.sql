-- Bigglenet 1.0, part 6: finding sites. Tags, following, webrings, the site of the day and
-- searching what pages say (discover.ts).

-- Up to three tags per site, from a fixed list (discover.ts TAGS).
CREATE TABLE site_tags (
  site TEXT NOT NULL REFERENCES names(name) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  PRIMARY KEY (site, tag)
);
CREATE INDEX site_tags_tag ON site_tags(tag);

-- Sites people follow. One that changed since you last looked (`seen_at`) gets a dot.
CREATE TABLE follows (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  site TEXT NOT NULL REFERENCES names(name) ON DELETE CASCADE,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  seen_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (user_id, site)
);
CREATE INDEX follows_site ON follows(site);

-- Webrings: sites linked in a circle, each pointing to the next (<biggle-webring>).
CREATE TABLE webrings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE TABLE webring_sites (
  ring_id INTEGER NOT NULL REFERENCES webrings(id) ON DELETE CASCADE,
  site TEXT NOT NULL REFERENCES names(name) ON DELETE CASCADE,
  added_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  added_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (ring_id, site)
);
CREATE INDEX webring_sites_site ON webring_sites(site);

-- The site of the day: picked once a day (or by an admin), and not again for a while.
CREATE TABLE site_of_day (
  day INTEGER PRIMARY KEY,
  site TEXT NOT NULL REFERENCES names(name) ON DELETE CASCADE
);

-- What each page says, for searching in Nox. The cron fills it in after a site changes
-- (discover.ts indexSome). A plain table rather than FTS5: D1 can't export virtual tables, and
-- the backups need to.
CREATE TABLE site_pages (
  site TEXT NOT NULL REFERENCES names(name) ON DELETE CASCADE,
  path TEXT NOT NULL,
  title TEXT,
  description TEXT,
  text TEXT NOT NULL,
  -- The title, description and text in lower case without accents, to search in.
  folded TEXT NOT NULL,
  PRIMARY KEY (site, path)
);
ALTER TABLE names ADD COLUMN indexed_at INTEGER;
