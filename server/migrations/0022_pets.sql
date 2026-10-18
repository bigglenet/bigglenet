-- Bigglenet 1.2: pets. Everyone can have one pet on their new tab page. It eats one snack for every
-- different site its owner visits each day (counted in visitors.ts), grows as it eats, and shows on
-- their profile.
CREATE TABLE pets (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  colour TEXT NOT NULL,
  -- Every snack it's ever had.
  snacks INTEGER NOT NULL DEFAULT 0,
  -- The last day it ate (days since 1970, UTC), how many snacks it had that day, and the site
  -- the last one came from.
  fed_day INTEGER,
  fed_today INTEGER NOT NULL DEFAULT 0,
  last_site TEXT,
  born_at INTEGER NOT NULL DEFAULT (unixepoch())
);
