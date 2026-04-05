-- Migration v4: Add LLM request log table for analytics
-- Purpose: Collect data to evaluate conversation summary compression
--          and semantic cache feasibility
-- Note: query_text intentionally omitted for privacy reasons.
--        Will be added when semantic cache is seriously evaluated.

CREATE TABLE IF NOT EXISTS llm_request_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  session_id TEXT,
  turn_number INTEGER,
  model TEXT NOT NULL,
  provider TEXT NOT NULL,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  latency_ms INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_log_user ON llm_request_log(user_id);
CREATE INDEX IF NOT EXISTS idx_log_created ON llm_request_log(created_at);
CREATE INDEX IF NOT EXISTS idx_log_model ON llm_request_log(model);
