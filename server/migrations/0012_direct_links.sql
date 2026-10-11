-- A linked site can load straight from its own host: the browser shows the real website, and
-- only the name lookup goes through the Bigglenet. Best for games and WebAssembly ports.
ALTER TABLE names ADD COLUMN direct INTEGER NOT NULL DEFAULT 0;
