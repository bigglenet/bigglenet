-- Every account needs a confirmed email address, or Google sign-in.
ALTER TABLE users ADD COLUMN email TEXT;
ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN google_sub TEXT;
CREATE UNIQUE INDEX users_email ON users(email) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX users_google ON users(google_sub) WHERE google_sub IS NOT NULL;

-- One-time codes sent by email: signing up, adding an email to an account, resetting a password.
CREATE TABLE email_codes (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('signup', 'verify', 'reset')),
  code_hash TEXT NOT NULL,
  data TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX email_codes_email ON email_codes(email);

-- Google sign-in requests. The app polls one until the browser comes back from Google.
CREATE TABLE oauth_requests (
  id TEXT PRIMARY KEY,
  state TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'done', 'needs_username', 'failed')),
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  google_sub TEXT,
  email TEXT,
  error TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
