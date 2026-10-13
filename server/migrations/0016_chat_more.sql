-- More in chats: replies, edits, deleting, pictures, files and voice messages, time capsules,
-- and reactions.
ALTER TABLE chat_messages ADD COLUMN reply_to INTEGER;
-- Milliseconds.
ALTER TABLE chat_messages ADD COLUMN edited_at INTEGER;
ALTER TABLE chat_messages ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0;
-- A file sent with the message (JSON: its key in the files database, name, type, size, and width/height for pictures,
-- duration for voice messages).
ALTER TABLE chat_messages ADD COLUMN attachment TEXT;
-- A time capsule: nobody but the sender sees it until then. Milliseconds.
ALTER TABLE chat_messages ADD COLUMN unlock_at INTEGER;

CREATE TABLE chat_reactions (
  message_id INTEGER NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  PRIMARY KEY (message_id, user_id, emoji)
);
