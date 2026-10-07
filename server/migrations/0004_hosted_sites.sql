-- Sites can now be hosted on the Bigglenet itself (files in site_files, url NULL),
-- belong to a user, and wait for an admin's approval before anyone else can visit them.
CREATE TABLE names_new (
  name TEXT PRIMARY KEY,
  url TEXT,
  title TEXT,
  owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'live' CHECK (status IN ('pending', 'live', 'rejected')),
  review_note TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
INSERT INTO names_new (name, url, title, created_at, updated_at)
  SELECT name, url, title, created_at, updated_at FROM names;
DROP TABLE names;
ALTER TABLE names_new RENAME TO names;
CREATE INDEX names_owner ON names(owner_id);
CREATE INDEX names_status ON names(status);

CREATE TABLE site_files (
  site TEXT NOT NULL REFERENCES names(name) ON DELETE CASCADE,
  path TEXT NOT NULL,
  type TEXT NOT NULL,
  content BLOB NOT NULL,
  size INTEGER NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (site, path)
);
