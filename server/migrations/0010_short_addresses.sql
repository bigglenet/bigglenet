-- .b addresses: a shorter ending for sites, for admins and the people they trust. A site is
-- name.biggle or name.b, never both, so the two share one list of names.
ALTER TABLE names ADD COLUMN tld TEXT NOT NULL DEFAULT 'biggle' CHECK (tld IN ('biggle', 'b'));
ALTER TABLE users ADD COLUMN trusted INTEGER NOT NULL DEFAULT 0;
