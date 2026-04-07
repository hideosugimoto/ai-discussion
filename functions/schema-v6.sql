-- Migration v6: Shareable discussion links (unlisted, URL-only)
--
-- Security model:
-- - Anyone with the URL can view (no auth required)
-- - URL token is 22+ chars from crypto.randomUUID() base64url (≈128 bits entropy)
-- - shared_discussions.data_json is a SANITIZED copy: only topic + discussion
--   messages + summaries. personas / profile / constitution / API key traces
--   are stripped at the API layer before insertion.
-- - Owner can revoke (DELETE) at any time
-- - Optional expires_at supports future "auto-expire" feature

CREATE TABLE IF NOT EXISTS shared_discussions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  topic TEXT NOT NULL,
  data_json TEXT NOT NULL,
  view_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_shared_user
  ON shared_discussions(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_shared_expires
  ON shared_discussions(expires_at);
