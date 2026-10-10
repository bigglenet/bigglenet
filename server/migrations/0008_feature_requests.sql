-- Feature requests: anyone signed in can ask for something, and vote for what they want most.
-- Admins mark them planned, done or declined, and can reply.
CREATE TABLE requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  details TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'planned', 'done', 'declined')),
  reply TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- One vote per person per request.
CREATE TABLE request_votes (
  request_id INTEGER NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (request_id, user_id)
);
