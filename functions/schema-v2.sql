-- Migration: REAL cost_usd → INTEGER cost_microdollars (1 microdollar = $0.000001)

-- Drop and recreate usage tables (no data to preserve)
DROP TABLE IF EXISTS usage_daily;
DROP TABLE IF EXISTS usage_monthly;

-- Monthly usage table (token cost tracking in microdollars)
CREATE TABLE IF NOT EXISTS usage_monthly (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  year_month TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cost_micro INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_usage_user_month
  ON usage_monthly(user_id, year_month);

-- Usage daily summary (for user dashboard)
CREATE TABLE IF NOT EXISTS usage_daily (
  user_id TEXT NOT NULL,
  date TEXT NOT NULL,
  total_cost_micro INTEGER NOT NULL DEFAULT 0,
  request_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, date),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
