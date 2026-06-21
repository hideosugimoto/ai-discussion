// Search provider selector — the single swap point for the retrieval backend.
//
// Architecture B keeps the discussion layer provider-agnostic: it always calls
// resolveSearchProvider(env).search(query, env) and injects the uniform
// { provider, query, sources: [{title,url,snippet}] } result into all three
// AIs. To change vendors (e.g. if a provider is discontinued — see Bing Search
// API's 2025 shutdown), add an adapter file here and point SEARCH_PROVIDER at
// it. No discussion-layer code changes.

import { search as geminiGrounding } from "./gemini-grounding.js";
import { DEFAULT_SEARCH_PROVIDER } from "../../../../src/models.config.js";

const PROVIDERS = {
  "gemini-grounding": geminiGrounding,
  // "serper": serperSearch,   // drop-in: add adapter + register here
  // "brave":  braveSearch,
};

// Returns { name, search }. Falls back to the default provider when the env
// value is unset or names an unregistered provider.
export function resolveSearchProvider(env) {
  const requested = env.SEARCH_PROVIDER || DEFAULT_SEARCH_PROVIDER;
  const fn = PROVIDERS[requested] || PROVIDERS[DEFAULT_SEARCH_PROVIDER];
  const name = PROVIDERS[requested] ? requested : DEFAULT_SEARCH_PROVIDER;
  return { name, search: fn };
}
