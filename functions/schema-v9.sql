-- Migration v9: Add web search request tracking to llm_request_log
-- Purpose: Track Architecture B unified-search usage (one row per search,
--          model='web_search', provider=<adapter name>). Search cost itself is
--          recorded in usage_monthly as a model='web_search' row so it counts
--          toward the existing monthly cap; this column is for analytics
--          (search volume per provider / session).

ALTER TABLE llm_request_log ADD COLUMN search_requests INTEGER DEFAULT 0;
