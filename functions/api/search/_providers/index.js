// Search provider selector — the single swap point for the retrieval backend.
//
// Architecture B keeps the discussion layer provider-agnostic: it always calls
// resolveSearchProvider(env).search(query, env) and injects the uniform
// { provider, query, sources: [{title,url,snippet}] } result into all three
// AIs. To change vendors (e.g. if a provider is discontinued — see Bing Search
// API's 2025 shutdown), add an adapter file here and point SEARCH_PROVIDER at
// it. No discussion-layer code changes.

import { search as geminiGrounding } from "./gemini-grounding.js";
import { search as geminiMapsGrounding } from "./gemini-maps-grounding.js";
import { DEFAULT_SEARCH_PROVIDER } from "../../../../src/models.config.js";

const PROVIDERS = {
  "gemini-grounding": geminiGrounding,
  "gemini-maps-grounding": geminiMapsGrounding,
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

// Route a query to a provider by its type. "place" (restaurants/spots/lodging)
// goes to Maps grounding — purpose-built for places; everything else uses the
// configured general web-grounding provider. SEARCH_MAPS_PROVIDER can override
// the place provider (e.g. a future Google Places adapter).
export function resolveProviderForType(env, type) {
  if (type === "place") {
    const name = env.SEARCH_MAPS_PROVIDER || "gemini-maps-grounding";
    if (PROVIDERS[name]) return { name, search: PROVIDERS[name] };
  }
  return resolveSearchProvider(env);
}
