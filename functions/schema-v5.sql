-- Migration v5: Cloud-synced discussion history + full-text search + tags
--
-- Purpose:
-- - Premium users can sync discussions across devices
-- - Tag-based organization
-- - Full-text search via FTS5
--
-- Storage policy (enforced in API layer):
-- - 1 user max 300 discussions
-- - 1 discussion max ~200KB (data_json)
-- - Oldest discussion is rejected on overflow (caller must delete first)

CREATE TABLE IF NOT EXISTS discussions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  topic TEXT NOT NULL,
  data_json TEXT NOT NULL,
  -- Comma-separated tags (lowercased, trimmed). Empty string when no tags.
  tags TEXT NOT NULL DEFAULT '',
  round_count INTEGER NOT NULL DEFAULT 0,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_discussions_user_updated
  ON discussions(user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_discussions_user_created
  ON discussions(user_id, created_at DESC);

-- FTS5 virtual table for full-text search
-- We index topic + plain-text content + tags. user_id is unindexed but stored
-- so we can filter by user in queries.
CREATE VIRTUAL TABLE IF NOT EXISTS discussions_fts USING fts5(
  topic,
  content,
  tags,
  user_id UNINDEXED,
  discussion_id UNINDEXED,
  tokenize = 'unicode61'
);
