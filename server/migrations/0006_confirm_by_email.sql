-- Codes can now be confirmed by the person emailing them to us. Until that email arrives,
-- a code is unconfirmed and can't be used. Emailed-out codes are confirmed from the start.
ALTER TABLE email_codes ADD COLUMN confirmed INTEGER NOT NULL DEFAULT 1;
