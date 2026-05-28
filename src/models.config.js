// Single source of truth for model identifiers, pricing, and routing.
// Imported by both browser code (src/) and Cloudflare Pages Functions
// (functions/api/chat/stream.js) so a model/price change updates everywhere.

// Pricing is expressed in USD per 1M tokens.
// The same number doubles as microdollars per token
// (USD/1M_tokens × 1_000_000 microdollars/USD ÷ 1_000_000 tokens = identity),
// so calcCostUSD and calcCostMicro read the same table.
export const MODEL_PRICING = {
  "claude-opus-4-7":   { input: 5.00, output: 25.00 },
  "claude-sonnet-4-6": { input: 3.00, output: 15.00 },
  "gpt-5.4":           { input: 2.50, output: 15.00 },
  "gpt-5.4-mini":      { input: 0.75, output: 4.50  },
  "gemini-2.5-pro":    { input: 1.25, output: 10.00 },
  "gemini-2.5-flash":  { input: 0.30, output: 2.50  },
};

export const MODE_MODELS = {
  best: {
    claude:  { tag: "claude-opus-4-7",   label: "Opus 4.7" },
    chatgpt: { tag: "gpt-5.4",           label: "GPT-5.4" },
    gemini:  { tag: "gemini-2.5-pro",    label: "2.5 Pro" },
  },
  fast: {
    claude:  { tag: "claude-sonnet-4-6", label: "Sonnet 4.6" },
    chatgpt: { tag: "gpt-5.4-mini",      label: "GPT-5.4 mini" },
    gemini:  { tag: "gemini-2.5-flash",  label: "2.5 Flash" },
  },
};

// Cheapest model per provider, used for API key reachability checks.
export const VALIDATION_MODELS = {
  claude:  "claude-haiku-4-5-20251001",
  chatgpt: "gpt-5.4-mini",
  gemini:  "gemini-2.5-flash",
};

// Model used for background summarization (round summary, rolling summary,
// detailed analysis, action plan, future file summary). Cost-optimized.
export const SUMMARY_MODEL = "gpt-5.4-mini";

export function detectProvider(model) {
  if (typeof model !== "string") return null;
  if (model.startsWith("claude")) return "anthropic";
  if (model.startsWith("gpt"))    return "openai";
  if (model.startsWith("gemini")) return "google";
  return null;
}

export function calcCostUSD(model, inputTokens, outputTokens) {
  const pricing = MODEL_PRICING[model];
  if (!pricing) return 0;
  return (inputTokens  / 1_000_000) * pricing.input
       + (outputTokens / 1_000_000) * pricing.output;
}

// Cost in microdollars (integer). Used by the Premium proxy for D1 storage
// to avoid floating-point accumulation across many requests.
export function calcCostMicro(model, inputTokens, outputTokens) {
  const pricing = MODEL_PRICING[model];
  if (!pricing) return 0;
  return Math.round(inputTokens * pricing.input + outputTokens * pricing.output);
}

// Pre-debit upper-bound estimate (500 input + 1500 output tokens), used to
// reserve budget before the upstream call so concurrent requests can't race
// past the monthly cap.
export function estimateMaxCostMicro(model) {
  const pricing = MODEL_PRICING[model];
  if (!pricing) return 0;
  return Math.round(500 * pricing.input + 1500 * pricing.output);
}
