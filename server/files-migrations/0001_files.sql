-- The second database, bigglenet-files: files people upload (profile pictures, and pictures,
-- files and voice messages sent in chats), in pieces of up to 1 MB. They live apart from the
-- main database so they can't fill it up (each D1 database holds 500 MB on Workers Free).
CREATE TABLE files (
  key TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  size INTEGER NOT NULL,
  -- The name it was sent with, and who sent it.
  name TEXT,
  owner_id INTEGER,
  pieces INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE file_pieces (
  key TEXT NOT NULL,
  n INTEGER NOT NULL,
  data BLOB NOT NULL,
  PRIMARY KEY (key, n)
) WITHOUT ROWID;
