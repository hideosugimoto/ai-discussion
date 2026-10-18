// Single source of truth for model identifiers, pricing, and routing.
// Imported by both browser code (src/) and Cloudflare Pages Functions
// (functions/api/chat/stream.js) so a model/price change updates everywhere.

// Pricing is expressed in USD per 1M tokens.
// The same number doubles as microdollars per token
// (USD/1M_tokens × 1_000_000 microdollars/USD ÷ 1_000_000 tokens = identity),
// so calcCostUSD and calcCostMicro read the same table.
//
// An entry may carry a time-limited introductory price:
//   { input, output, until: <ISO8601>, after: { input, output } }
// `input`/`output` apply through `until`; `after` applies from the instant it
// passes. Never read `.input`/`.output` off this table directly for billing —
// go through pricingFor(), or a promo that has expired keeps under-charging
// (i.e. the proxy eats the difference).
export const MODEL_PRICING = {
  // Anthropic — verified against platform.claude.com/docs/en/about-claude/pricing
  // on 2026-10-18. Cache reads are NOT a flat 0.1x any more: Opus 5.5 and
  // Sonnet 5.5 read at 0.05x, which anthropicCacheReadMultiplier() carries.
  "claude-opus-5-5":         { input: 4.00, output: 20.00 },
  "claude-sonnet-5-5":       { input: 2.00, output: 10.00 },
  // Haiku 5.5 is priced BY PROMPT LENGTH: these are the <=100k-token rates;
  // a prompt over 100k tokens is billed at $0.50/$2.50. This table has no
  // length dimension, so routing Haiku 5.5 anywhere that sends long prompts
  // would under-charge. It is validation-only (a 16-token reachability ping),
  // where the threshold cannot be reached.
  "claude-haiku-5-5":        { input: 0.10, output: 0.50  },
  "claude-opus-4-8":         { input: 5.00, output: 25.00 },
  "claude-opus-4-7":         { input: 5.00, output: 25.00 },
  "claude-sonnet-4-6":       { input: 3.00, output: 15.00 },
  // OpenAI — verified against developers.openai.com/api/docs/pricing on
  // 2026-10-18 (standard tier, short context <=272k input tokens). The long
  // context tier is 2x input / 1.5x output; this app's prompts stay far below
  // 272k, so only the short-context rates are modelled.
  "gpt-6.1-sol":             { input: 2.00, output: 10.00 },
  "gpt-6-sol":               { input: 2.00, output: 10.00 },
  "gpt-6-astra":             { input: 10.00, output: 50.00 },
  "gpt-6-luna":              { input: 0.10, output: 0.50  },
  // The three gpt-5.6-* rows below were over-stated until 2026-10-18
  // (sol $5/$30, terra $2.50/$15, luna $1/$6 — i.e. 1.25x-5x the real rates),
  // which inflated every metered figure that used them. Official rates now.
  // NOTE: OpenAI labels gpt-5.6-sol's rate promotional, "available at least
  // through November 21, 2026", and does not publish the post-promo price, so
  // no `until`/`after` can be written for it yet. gpt-5.6-* is no longer
  // routed, so the exposure is limited to historical records; re-check the
  // page before routing any gpt-5.6-* model again.
  "gpt-5.6-sol":             { input: 4.00, output: 20.00 },
  "gpt-5.6-terra":           { input: 2.00, output: 12.00 },
  "gpt-5.6-luna":            { input: 0.20, output: 1.20  },
  "gpt-5.5":                 { input: 5.00, output: 30.00 },
  "gpt-5.4":                 { input: 2.50, output: 15.00 },
  "gpt-5.4-mini":            { input: 0.75, output: 4.50  },
  // Google
  // 3.6 / 3.7 / 3.8 Flash share one introductory price that Google applies to
  // all of them: $0.75/$3.75 through 2026-12-31, then the $1.50/$7.50 list
  // price. `until` is pinned to UTC although Google states the date without a
  // zone — UTC expires ~8h before US Pacific, so the switch to list price can
  // only ever land early (over-charging the proxy's own budget, never under).
  "gemini-3.8-flash":        { input: 0.75, output: 3.75, until: "2026-12-31T23:59:59Z", after: { input: 1.50, output: 7.50 } },
  // 3.7 / 3.5 Flash are still served by the API but have been dropped from the
  // public pricing page, so these two rows can no longer be re-verified from a
  // primary source. Kept for historical cost records only — do not route them.
  "gemini-3.7-flash":        { input: 0.75, output: 3.75, until: "2026-12-31T23:59:59Z", after: { input: 1.50, output: 7.50 } },
  "gemini-3.6-flash":        { input: 0.75, output: 3.75, until: "2026-12-31T23:59:59Z", after: { input: 1.50, output: 7.50 } },
  "gemini-3.5-flash":        { input: 1.50, output: 9.00  },
  // Gemini 4 Argon: its introductory price ends a month earlier than the Flash
  // promos. Priced here so the detector stays quiet and the row is ready, but
  // not routed — it costs 2.67x Flash for this app's workload.
  "gemini-4-argon":          { input: 2.00, output: 10.00, until: "2026-11-30T23:59:59Z", after: { input: 4.00, output: 20.00 } },
  "gemini-2.5-pro":          { input: 1.25, output: 10.00 },
  "gemini-2.5-flash":        { input: 0.30, output: 2.50  },
  "gemini-3.1-flash-lite":   { input: 0.25, output: 1.50  },
};

// Human-readable display label for each model tag. SINGLE SOURCE for every
// on-screen model name: UI badges/tooltips, the LP, and the README all derive
// their displayed names from here (via labelFor / modeModelSummary and the
// scripts/sync-model-displays.mjs generator). Change a routing tag below and
// every surface follows — no hunting for hardcoded strings.
export const MODEL_LABELS = {
  // Anthropic
  "claude-opus-5-5":           "Opus 5.5",
  "claude-sonnet-5-5":         "Sonnet 5.5",
  "claude-haiku-5-5":          "Haiku 5.5",
  "claude-opus-4-8":           "Opus 4.8",
  "claude-opus-4-7":           "Opus 4.7",
  "claude-sonnet-4-6":         "Sonnet 4.6",
  "claude-haiku-4-5-20251001": "Haiku 4.5",
  // OpenAI
  "gpt-6.1-sol":               "GPT-6.1 Sol",
  "gpt-6-sol":                 "GPT-6 Sol",
  "gpt-6-astra":               "GPT-6 Astra",
  "gpt-6-luna":                "GPT-6 Luna",
  "gpt-5.6-sol":               "GPT-5.6 Sol",
  "gpt-5.6-terra":             "GPT-5.6 Terra",
  "gpt-5.6-luna":              "GPT-5.6 Luna",
  "gpt-5.5":                   "GPT-5.5",
  "gpt-5.4":                   "GPT-5.4",
  "gpt-5.4-mini":              "GPT-5.4 mini",
  // Google
  "gemini-3.8-flash":          "3.8 Flash",
  "gemini-4-argon":            "4 Argon",
  "gemini-3.7-flash":          "3.7 Flash",
  "gemini-3.6-flash":          "3.6 Flash",
  "gemini-3.5-flash":          "3.5 Flash",
  "gemini-2.5-pro":            "2.5 Pro",
  "gemini-2.5-flash":          "2.5 Flash",
  "gemini-3.1-flash-lite":     "3.1 Flash-Lite",
};

// Display label for any model tag. Falls back to the raw tag if unmapped —
// this only guards transient/unrouted lookups. Every *routed* tag must have a
// MODEL_LABELS entry; the "every routed model tag has a MODEL_LABELS entry"
// test (src/__tests__/model-displays.test.js) enforces that, so a routed model
// never renders its raw tag.
export function labelFor(tag) {
  return MODEL_LABELS[tag] || tag;
}

const mm = (tag) => ({ tag, label: labelFor(tag) });

export const MODE_MODELS = {
  best: {
    claude:  mm("claude-opus-5-5"),
    chatgpt: mm("gpt-6.1-sol"),
    gemini:  mm("gemini-3.8-flash"),
  },
  fast: {
    // Sonnet 5.5 is 33% cheaper per token than Sonnet 4.6. The docs' warning
    // that the 4.7+ tokenizer produces ~30% more tokens does not apply to this
    // app's Japanese prompts: count_tokens on one panel turn (2026-10-18) gave
    // 88 tokens on Sonnet 5.5 and Opus 5.5, 88 on Sonnet 4.6 and 86 on Opus
    // 4.8 — re-measure with count_tokens (free) before assuming otherwise.
    // 3.8 Flash has no Flash-Lite sibling yet (only a TTS variant), so the
    // cheapest Gemini stays 3.1 Flash-Lite.
    claude:  mm("claude-sonnet-5-5"),
    chatgpt: mm("gpt-6-luna"),
    gemini:  mm("gemini-3.1-flash-lite"),
  },
};

// "Claude / ChatGPT / Gemini" model names for a mode, e.g. "Opus 5.5 / GPT-6.1
// Sol / 3.8 Flash". Used by tooltips/marketing copy so the listed names always
// match the routing table above.
export function modeModelSummary(modeId) {
  const m = MODE_MODELS[modeId];
  if (!m) return "";
  return [m.claude.label, m.chatgpt.label, m.gemini.label].join(" / ");
}

// Reasoning effort sent on every Anthropic panel turn. The Claude 5.x family
// cannot turn thinking off (`thinking: {type:"disabled"}` and budget_tokens
// both 400), so `effort` is the only cost lever — the counterpart of the
// `reasoning_effort: "low"` / `thinkingLevel: "low"` already sent to OpenAI and
// Gemini. Measured on a 200-character panel turn (2026-10-18):
//   Opus 4.8   (thinking off)        177 output tokens
//   Opus 5.5   (default: medium)     733 output tokens (495 thinking)
//   Opus 5.5   + effort "low"        311 output tokens ( 34 thinking)
//   Sonnet 4.6 (thinking off)        210 output tokens
//   Sonnet 5.5 (default: high)       302 output tokens (107 thinking)
//   Sonnet 5.5 + effort "low"        231 output tokens (  0 thinking)
// Without this, best-mode Claude costs ~3x what Opus 4.8 did per turn despite
// the lower per-token rate, and a 400-token trial turn is spent on thinking
// before any answer is written.
export const ANTHROPIC_EFFORT = "low";

// Cheapest model per provider, used for API key reachability checks.
export const VALIDATION_MODELS = {
  claude:  "claude-haiku-5-5",
  chatgpt: "gpt-6-luna",
  gemini:  "gemini-3.1-flash-lite",
};

// Model used for background summarization (round summary, rolling summary,
// detailed analysis, action plan, future file summary). Cost-optimized:
// GPT-6 Luna is OpenAI's high-volume tier at $0.10/$0.50, ~87% below the
// GPT-5.4 mini rates these eight background jobs used before.
export const SUMMARY_MODEL = "gpt-6-luna";

// --- Web search (grounding) configuration ---------------------------------
// Phase 1 unified-search architecture: one retrieval per round is injected
// identically into all three AIs (see functions/api/search/query.js). The
// provider is pluggable behind an adapter; the active one is chosen by the
// SEARCH_PROVIDER env var, defaulting to "gemini-grounding".
//
// Pricing is per 1,000 searches, in USD. As with MODEL_PRICING, the same
// number doubles as microdollars per single search
// (USD/1k_searches × 1_000_000 µ$/USD ÷ 1_000 searches = number × 1000 µ$).
export const SEARCH_PRICING = {
  // Gemini "Grounding with Google Search" (3.x): $14 / 1,000 grounded prompts.
  "gemini-grounding": { per1k: 14.00, freeTierPerMonth: 5000 },
  // Gemini "Grounding with Google Maps" (3.x): $14 / 1,000. Free tier is not
  // publicly confirmed, so freeTierPerMonth is 0 (cap-safe: bill from the first
  // call rather than risk undercounting against the monthly limit).
  "gemini-maps-grounding": { per1k: 14.00, freeTierPerMonth: 0 },
  // Drop-in alternatives (adapter swap only). Kept here so cost accounting is
  // correct the moment the provider changes — no code edit needed elsewhere.
  "serper":           { per1k: 1.00,  freeTierPerMonth: 2500 },
  "brave":            { per1k: 5.00,  freeTierPerMonth: 0    },
  // Native (per-AI) web search fees, used when searchMode === "native".
  "anthropic-websearch": { per1k: 10.00, freeTierPerMonth: 0 },
  "openai-websearch":    { per1k: 10.00, freeTierPerMonth: 0 },
};

export const DEFAULT_SEARCH_PROVIDER = "gemini-grounding";

// Map an AI provider (anthropic/openai/google) to its native-search pricing key.
export function nativeSearchPricingKey(provider) {
  if (provider === "anthropic") return "anthropic-websearch";
  if (provider === "openai")    return "openai-websearch";
  if (provider === "google")    return "gemini-grounding";
  return null;
}

// Cost of a single search in microdollars, given how many searches the user
// has already made this month. Returns 0 while inside the provider's monthly
// free tier; the per-search price beyond it. priorCount is the number of
// billable-or-free searches already recorded this month (0-indexed: the call
// being priced is the (priorCount+1)-th).
export function calcSearchCostMicro(provider, priorCount) {
  const p = SEARCH_PRICING[provider];
  if (!p) return 0;
  if (priorCount < (p.freeTierPerMonth || 0)) return 0;
  // per1k USD → microdollars per single search: per1k × 1000
  return Math.round(p.per1k * 1000);
}

export function detectProvider(model) {
  if (typeof model !== "string") return null;
  if (model.startsWith("claude")) return "anthropic";
  if (model.startsWith("gpt"))    return "openai";
  if (model.startsWith("gemini")) return "google";
  return null;
}

// The rates in force for a model at a given instant. Returns { input, output }
// (never the raw table entry's promo/list wrapper), or null for an unpriced
// model. `now` is injectable so pricing is a pure function of time in tests;
// callers in production omit it.
export function pricingFor(model, now = Date.now()) {
  const entry = MODEL_PRICING[model];
  if (!entry) return null;
  if (entry.until && entry.after && now > Date.parse(entry.until)) {
    return { input: entry.after.input, output: entry.after.output };
  }
  return { input: entry.input, output: entry.output };
}

export function calcCostUSD(model, inputTokens, outputTokens, now = Date.now()) {
  const pricing = pricingFor(model, now);
  if (!pricing) return 0;
  return (inputTokens  / 1_000_000) * pricing.input
       + (outputTokens / 1_000_000) * pricing.output;
}

// Cost in microdollars (integer). Used by the Premium proxy for D1 storage
// to avoid floating-point accumulation across many requests.
export function calcCostMicro(model, inputTokens, outputTokens, now = Date.now()) {
  const pricing = pricingFor(model, now);
  if (!pricing) return 0;
  return Math.round(inputTokens * pricing.input + outputTokens * pricing.output);
}

// Anthropic prompt-caching multipliers (relative to base input price). The
// proxy uses the 5-minute (ephemeral) cache_control, so writes cost 1.25x of
// the base input rate on every model. Source: Anthropic prompt-caching docs.
export const ANTHROPIC_CACHE_WRITE_MULTIPLIER = 1.25;

// The cache READ multiplier is per-model, not a constant: Anthropic moved Opus
// 5.5 and Sonnet 5.5 to 0.05x (a $4/MTok model reads at $0.20, a $2/MTok model
// at $0.10) while every other model stays at the standard 0.1x. Billing reads
// at 0.1x on a 0.05x model doubles the metered figure — safe for the proxy's
// own budget but it halves what a paying user can actually do, which is the
// same failure the Gemini 3.6 Flash promo caused in #7. Fable 5.1 (0.025x) is
// listed for completeness although nothing routes it.
export const ANTHROPIC_CACHE_READ_MULTIPLIER = 0.1;
const ANTHROPIC_CACHE_READ_MULTIPLIERS = {
  "claude-opus-5-5":   0.05,
  "claude-sonnet-5-5": 0.05,
  "claude-fable-5-1":  0.025,
};

// Cache-read multiplier in force for a model; the 0.1x default for anything
// unlisted (older models, and any model added without a rate of its own).
export function anthropicCacheReadMultiplier(model) {
  const m = ANTHROPIC_CACHE_READ_MULTIPLIERS[model];
  return m === undefined ? ANTHROPIC_CACHE_READ_MULTIPLIER : m;
}

// Anthropic-only cache cost in microdollars. Unlike OpenAI/Gemini (whose token
// counts already include cached tokens, billed via calcCostMicro), Anthropic
// reports cache_creation_input_tokens / cache_read_input_tokens SEPARATELY from
// input_tokens. Those must be billed explicitly or the proxy under-charges
// (the cache write at 1.25x is a real cost, especially with native web search).
export function calcAnthropicCacheCostMicro(model, cacheCreationTokens, cacheReadTokens, now = Date.now()) {
  const pricing = pricingFor(model, now);
  if (!pricing) return 0;
  return Math.round(
    (cacheCreationTokens || 0) * pricing.input * ANTHROPIC_CACHE_WRITE_MULTIPLIER +
    (cacheReadTokens || 0) * pricing.input * anthropicCacheReadMultiplier(model)
  );
}

// Pre-debit upper-bound estimate (500 input + the call's output ceiling), used
// to reserve budget before the upstream call so concurrent requests can't race
// past the monthly cap. `maxOutputTokens` defaults to the panel-turn ceiling;
// calls that raise max_tokens (research rounds, the research report) must pass
// the same number they send upstream, or they under-reserve.
export function estimateMaxCostMicro(model, now = Date.now(), maxOutputTokens = 1500) {
  const pricing = pricingFor(model, now);
  if (!pricing) return 0;
  const out = Number.isFinite(maxOutputTokens) && maxOutputTokens > 0 ? maxOutputTokens : 1500;
  return Math.round(500 * pricing.input + out * pricing.output);
}
