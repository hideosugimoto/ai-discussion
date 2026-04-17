-- Migration v8: Add cache token tracking to llm_request_log
-- Purpose: Measure Anthropic prompt cache hit rate to decide on 5m/1h TTL
--          and to track Gemini explicit cache effectiveness after its introduction.
-- Note: Anthropic returns cache_creation_input_tokens / cache_read_input_tokens
--       in message_start.usage. Gemini explicit cache exposes cachedContentTokenCount
--       in usageMetadata; we can map it to cache_read_input_tokens.

ALTER TABLE llm_request_log ADD COLUMN cache_creation_input_tokens INTEGER DEFAULT 0;
ALTER TABLE llm_request_log ADD COLUMN cache_read_input_tokens INTEGER DEFAULT 0;
