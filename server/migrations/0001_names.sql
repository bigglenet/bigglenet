-- .biggle names and the folder URL each one points at (always ends in "/").
CREATE TABLE names (
  name TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  title TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
