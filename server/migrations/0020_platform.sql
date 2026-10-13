-- Bigglenet 1.0, part 7: the platform. Reports and announcements, two-factor sign-in, passkeys,
-- push notifications, settings sync and nightly restore points.

-- Reports: someone flagged a site, message, post, comment, note or person for admins.
CREATE TABLE reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  -- 'site', 'message', 'post', 'comment', 'note' (guestbook) or 'user'.
  kind TEXT NOT NULL,
  target TEXT NOT NULL,
  -- What it is and what it said, for the admin queue (the thing itself may be gone).
  summary TEXT NOT NULL,
  reason TEXT,
  -- 'open', 'dismissed' or 'removed'.
  status TEXT NOT NULL DEFAULT 'open',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  handled_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  handled_at INTEGER
);
CREATE INDEX reports_status ON reports(status, id);

-- Announcements: a banner everyone sees ("maintenance at 8pm").
CREATE TABLE announcements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  text TEXT NOT NULL,
  -- 'info' or 'warning'.
  level TEXT NOT NULL DEFAULT 'info',
  by_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  -- Unix seconds; NULL until an admin takes it down.
  ends_at INTEGER
);

-- Two-factor sign-in: a code from an authenticator app (TOTP), or a recovery code.
ALTER TABLE users ADD COLUMN totp_secret TEXT;
-- The last time step a code was used for: each code works once.
ALTER TABLE users ADD COLUMN totp_last INTEGER;
CREATE TABLE recovery_codes (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  used_at INTEGER,
  PRIMARY KEY (user_id, code_hash)
);
-- Sign-ins waiting for their second step (password or Google done, code still to come).
CREATE TABLE login_tickets (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Passkeys: Touch ID, Windows Hello or a phone instead of a password.
CREATE TABLE passkeys (
  -- The credential id, base64url.
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- The public key (SPKI, base64url) and its COSE algorithm (-7 ES256, -257 RS256).
  public_key TEXT NOT NULL,
  algorithm INTEGER NOT NULL,
  name TEXT,
  sign_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  last_used INTEGER
);
CREATE INDEX passkeys_user ON passkeys(user_id);
-- WebAuthn challenges. The desktop app does passkeys in the system browser and waits for the
-- request to finish, like signing in with Google.
CREATE TABLE passkey_requests (
  id TEXT PRIMARY KEY,
  -- 'register' or 'login'.
  kind TEXT NOT NULL,
  challenge TEXT NOT NULL,
  -- Registering: whose passkey it is. Signing in: who signed in, once done.
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  -- 'waiting', 'done' or 'failed'.
  status TEXT NOT NULL DEFAULT 'waiting',
  error TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Web push: notifications on phones (and browsers that allow it) while Bigglenet is closed.
CREATE TABLE push_subscriptions (
  endpoint TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  -- The device's language ('en' or 'tr'), for what the notification says.
  lang TEXT NOT NULL DEFAULT 'en',
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX push_user ON push_subscriptions(user_id);

-- Sync through your Biggle ID: bookmarks, settings and new tab shortcuts. Per key; newest wins.
CREATE TABLE user_sync (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  data TEXT NOT NULL,
  -- Milliseconds, from the device that changed it.
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, key)
);

-- Restore points: each night (cron) the moment is marked with its D1 Time Travel bookmark, so
-- an admin can put the database back to it (Time Travel keeps 7 days on Workers Free).
CREATE TABLE restore_points (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bookmark TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
