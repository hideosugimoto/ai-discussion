-- Migration v7: One-time credit purchases + plus plan support
--
-- Credits model:
-- - User buys a one-time credit pack (e.g. ¥500 → +$2 limit)
-- - Credit is valid until the end of the purchase month (UTC)
-- - When checking monthly limit, sum unexpired credits and add to base limit
-- - stripe_payment_intent is unique to prevent duplicate insertion via webhook retries

CREATE TABLE IF NOT EXISTS user_credits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  amount_micro INTEGER NOT NULL,
  source TEXT NOT NULL DEFAULT 'purchase',
  stripe_payment_intent TEXT UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_credits_user_expires
  ON user_credits(user_id, expires_at);

-- Note: users.plan is a free-form TEXT column. Application code now accepts
-- any of 'free' | 'premium' | 'plus'. No CHECK constraint is added so we can
-- add more tiers later without migrations.
