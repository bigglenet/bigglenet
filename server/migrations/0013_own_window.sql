-- Direct sites that need cross-origin isolation (games with threads) open in a window of their
-- own, where they're a real top-level page. So do sites that won't be shown inside other apps.
-- 1: in a window of its own; 2: through the desktop app's relay too (COEP credentialless).
ALTER TABLE names ADD COLUMN own_window INTEGER NOT NULL DEFAULT 0;
