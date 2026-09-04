-- v10: move discussion bodies out of D1 and into R2.
--
-- Why: a D1 database is capped at 10 GB and Cloudflare states that limit
-- cannot be increased. discussions.data_json is by far the largest column
-- (up to MAX_DATA_BYTES = 200KB per row), so at scale it is what would hit
-- the ceiling. R2 has no practical ceiling and costs $0.015/GB-month.
--
-- What stays in D1: all metadata (topic, tags, round_count, size_bytes,
-- timestamps) and the FTS index — so listing and full-text search are
-- unchanged and never touch R2.
--
-- Migration is non-destructive and backwards compatible:
--   r2_key IS NULL  -> body still lives in data_json (pre-migration rows)
--   r2_key IS NOT NULL -> body lives in R2 under that key; data_json is ''
-- Readers check r2_key first and fall back to data_json, so this schema can
-- be applied before the code ships, and old rows keep working afterwards.
--
-- data_json keeps its NOT NULL constraint (rewriting it would mean rebuilding
-- the table); migrated rows store an empty string instead.

ALTER TABLE discussions ADD COLUMN r2_key TEXT;

-- Lets the migration job find un-migrated rows without a full scan.
CREATE INDEX IF NOT EXISTS idx_discussions_r2_key_null
  ON discussions(user_id) WHERE r2_key IS NULL;
