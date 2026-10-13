-- Bigglenet 1.0, part 5: the activity feed, invite links, clubs, the board (board.biggle),
-- events and collections.

-- What people have been doing, for biggle://feed: your friends' new sites, site updates,
-- guestbook notes, clubs, events, threads and collections. `data` is JSON (it depends on `kind`).
CREATE TABLE activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  -- For things that happened on a site (so people who follow it see them too).
  site TEXT,
  data TEXT NOT NULL DEFAULT '{}',
  -- Milliseconds.
  created_at INTEGER NOT NULL
);
CREATE INDEX activity_user ON activity(user_id, id);
CREATE INDEX activity_site ON activity(site, id);

-- Invite links: whoever signs up through one becomes friends with whoever made it.
CREATE TABLE invites (
  code TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  uses INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX invites_user ON invites(user_id);
ALTER TABLE users ADD COLUMN invited_by INTEGER REFERENCES users(id) ON DELETE SET NULL;

-- Clubs: a group with a member list, its own chat (chats.club_id) and, if it has one, a site
-- every member can edit.
CREATE TABLE clubs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  emoji TEXT,
  owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  site TEXT REFERENCES names(name) ON DELETE SET NULL,
  -- 1: anyone can join. 0: members invite people.
  open INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX clubs_site ON clubs(site);
CREATE TABLE club_members (
  club_id INTEGER NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (club_id, user_id)
);
CREATE INDEX club_members_user ON club_members(user_id);
CREATE TABLE club_invites (
  club_id INTEGER NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  from_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (club_id, user_id)
);
ALTER TABLE chats ADD COLUMN club_id INTEGER REFERENCES clubs(id) ON DELETE CASCADE;

-- The board (board.biggle): old-school forums. A thread's first post is what it says.
CREATE TABLE board_threads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  board TEXT NOT NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  last_at INTEGER NOT NULL DEFAULT (unixepoch()),
  replies INTEGER NOT NULL DEFAULT 0,
  pinned INTEGER NOT NULL DEFAULT 0,
  locked INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX board_threads_board ON board_threads(board, pinned, last_at);
CREATE TABLE board_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id INTEGER NOT NULL REFERENCES board_threads(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  edited_at INTEGER,
  deleted INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX board_posts_thread ON board_posts(thread_id, id);

-- Events: a game night and who's coming. Everyone going (or maybe going) gets a reminder.
CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  club_id INTEGER REFERENCES clubs(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  -- Where: a biggle:// address, "on a call", anything.
  place TEXT,
  -- Unix seconds.
  starts_at INTEGER NOT NULL,
  ends_at INTEGER,
  -- Who can see it and answer: 'friends' (the maker's), 'club', 'invited' or 'everyone'.
  who TEXT NOT NULL DEFAULT 'friends',
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX events_start ON events(starts_at);
CREATE INDEX events_club ON events(club_id);
CREATE TABLE event_people (
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- 'going', 'maybe' or 'no'; NULL if they've only been invited.
  answer TEXT,
  invited_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  -- Reminders go out a few at a time (cron, events.ts), so each person's is ticked off.
  reminded INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (event_id, user_id)
);
CREATE INDEX event_people_user ON event_people(user_id);
CREATE INDEX event_people_remind ON event_people(reminded, answer);

-- Collections: lists of favourite sites. The id is random, so an unlisted one is only seen by
-- people you give the link to.
CREATE TABLE collections (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  -- 1: on your profile. 0: only for people with the link.
  listed INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX collections_user ON collections(user_id, updated_at);
CREATE TABLE collection_sites (
  collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  site TEXT NOT NULL REFERENCES names(name) ON DELETE CASCADE,
  note TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  added_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (collection_id, site)
);
CREATE INDEX collection_sites_site ON collection_sites(site);
