-- A linked name can be a live app: its pages are made into BHTML as they pass through the
-- gateway, so a normal website (a game, an app) works on the Bigglenet without being copied.
ALTER TABLE names ADD COLUMN live INTEGER NOT NULL DEFAULT 0;
