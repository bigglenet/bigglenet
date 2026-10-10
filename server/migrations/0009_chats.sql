-- Chats: one-to-one and group conversations, with voice and video calls in them. Replaces the
-- old messages table, which stays for now but isn't written to any more.

CREATE TABLE chats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK (kind IN ('direct', 'group')),
  -- Groups only.
  name TEXT,
  -- One-to-one chats only: "<lower user id>:<higher user id>", so each pair has one chat.
  pair TEXT UNIQUE,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  -- Milliseconds. The last message, for ordering the chat list.
  last_at INTEGER,
  -- Milliseconds. When the call going on in this chat started, if there is one.
  call_started INTEGER
);

CREATE TABLE chat_members (
  chat_id INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- The last message they've read.
  read_up_to INTEGER NOT NULL DEFAULT 0,
  joined_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (chat_id, user_id)
);
CREATE INDEX chat_members_user ON chat_members(user_id);

-- kind 'event' is a note like "ethem made the group"; its body is the text after the name.
CREATE TABLE chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  sender_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  kind TEXT NOT NULL DEFAULT 'text' CHECK (kind IN ('text', 'event')),
  body TEXT NOT NULL,
  -- Milliseconds.
  created_at INTEGER NOT NULL
);
CREATE INDEX chat_messages_chat ON chat_messages(chat_id, id);

-- Who's in each chat's call right now. seen_at is refreshed while they're in it, so people
-- whose app closed without saying goodbye drop out.
CREATE TABLE call_members (
  chat_id INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  video INTEGER NOT NULL DEFAULT 0,
  joined_at INTEGER NOT NULL,
  seen_at INTEGER NOT NULL,
  PRIMARY KEY (chat_id, user_id)
);

-- A name you give a friend, that only you see.
ALTER TABLE friendships ADD COLUMN nickname TEXT;

-- Move the one-to-one messages across, keeping their ids so read markers carry over.
INSERT INTO chats (kind, pair, last_at)
  SELECT 'direct', MIN(sender_id, recipient_id) || ':' || MAX(sender_id, recipient_id), MAX(created_at)
  FROM messages
  GROUP BY MIN(sender_id, recipient_id), MAX(sender_id, recipient_id);

INSERT INTO chat_members (chat_id, user_id)
  SELECT id, CAST(substr(pair, 1, instr(pair, ':') - 1) AS INTEGER) FROM chats WHERE kind = 'direct'
  UNION ALL
  SELECT id, CAST(substr(pair, instr(pair, ':') + 1) AS INTEGER) FROM chats WHERE kind = 'direct';

INSERT INTO chat_messages (id, chat_id, sender_id, kind, body, created_at)
  SELECT m.id, c.id, m.sender_id, 'text', m.body, m.created_at
  FROM messages m
  JOIN chats c ON c.pair = MIN(m.sender_id, m.recipient_id) || ':' || MAX(m.sender_id, m.recipient_id);

-- Read up to the last message they sent or had read.
UPDATE chat_members SET read_up_to = COALESCE((
  SELECT MAX(m.id) FROM messages m
  JOIN chats c ON c.pair = MIN(m.sender_id, m.recipient_id) || ':' || MAX(m.sender_id, m.recipient_id)
  WHERE c.id = chat_members.chat_id
    AND (m.sender_id = chat_members.user_id OR m.read_at IS NOT NULL)
), 0);
