// Tests for pure helpers in the web-search subsystem.
import { describe, it, expect } from "vitest";
import { parseQueries, mergeSources } from "../../functions/api/search/query.js";
import {
  calcSearchCostMicro,
  SEARCH_PRICING,
  nativeSearchPricingKey,
  calcAnthropicCacheCostMicro,
  MODEL_PRICING,
} from "../models.config.js";
import { buildSearchBlock } from "../prompt.js";

describe("parseQueries", () => {
  it("wraps a single query string as one general item", () => {
    expect(parseQueries({ query: "京都 観光" })).toEqual([{ q: "京都 観光", type: "general" }]);
  });
  it("accepts a queries array of strings (default general)", () => {
    expect(parseQueries({ queries: ["a", "b"] })).toEqual([{ q: "a", type: "general" }, { q: "b", type: "general" }]);
  });
  it("honors {q,type} objects; only 'place' is valid", () => {
    expect(parseQueries({ queries: [{ q: "寿司屋", type: "place" }, { q: "相場", type: "weird" }] })).toEqual([{ q: "寿司屋", type: "place" }, { q: "相場", type: "general" }]);
  });
  it("trims, drops empties, de-duplicates", () => {
    expect(parseQueries({ queries: ["  x  ", "x", "", "   "] })).toEqual([{ q: "x", type: "general" }]);
  });
  it("caps at 3 queries", () => {
    expect(parseQueries({ queries: ["a", "b", "c", "d", "e"] })).toHaveLength(3);
  });
  it("rejects over-long queries", () => {
    expect(parseQueries({ queries: ["x".repeat(2001)] })).toEqual([]);
  });
  it("returns [] for missing/invalid input", () => {
    expect(parseQueries({})).toEqual([]);
    expect(parseQueries(null)).toEqual([]);
    expect(parseQueries({ query: 123 })).toEqual([]);
  });
});

describe("mergeSources", () => {
  it("dedupes by snippet across facets", () => {
    const a = { sources: [{ title: "X", url: "u1", snippet: "同じ事実" }] };
    const b = { sources: [{ title: "Y", url: "u2", snippet: "同じ事実" }] };
    expect(mergeSources([a, b])).toHaveLength(1);
  });
  it("keeps distinct snippets, falls back to title when empty", () => {
    const r = { sources: [{ title: "A", url: "u1", snippet: "事実1" }, { title: "B", url: "u2", snippet: "事実2" }, { title: "C", url: "u3", snippet: "" }] };
    expect(mergeSources([r])).toHaveLength(3);
  });
  it("drops entries with neither snippet nor title", () => {
    expect(mergeSources([{ sources: [{ url: "u1", snippet: "", title: "" }] }])).toEqual([]);
  });
  it("caps at max", () => {
    const sources = Array.from({ length: 20 }, (_, i) => ({ title: `t${i}`, url: `u${i}`, snippet: `s${i}` }));
    expect(mergeSources([{ sources }], 10)).toHaveLength(10);
  });
  it("tolerates null/empty inputs", () => {
    expect(mergeSources(null)).toEqual([]);
    expect(mergeSources([null, {}, { sources: null }])).toEqual([]);
  });
});

describe("calcSearchCostMicro", () => {
  it("is 0 inside the free tier", () => {
    expect(calcSearchCostMicro("gemini-grounding", 0)).toBe(0);
    expect(calcSearchCostMicro("gemini-grounding", SEARCH_PRICING["gemini-grounding"].freeTierPerMonth - 1)).toBe(0);
  });
  it("charges per1k*1000 microdollars beyond the free tier", () => {
    expect(calcSearchCostMicro("gemini-grounding", SEARCH_PRICING["gemini-grounding"].freeTierPerMonth)).toBe(14_000);
  });
  it("maps bills from the first call (free tier 0)", () => {
    expect(calcSearchCostMicro("gemini-maps-grounding", 0)).toBe(14_000);
  });
  it("returns 0 for an unknown provider", () => {
    expect(calcSearchCostMicro("nope", 0)).toBe(0);
  });
  it("bills anthropic/openai native search from the first call (no free tier)", () => {
    expect(calcSearchCostMicro("anthropic-websearch", 0)).toBe(10_000);
    expect(calcSearchCostMicro("openai-websearch", 0)).toBe(10_000);
  });
  it("keeps gemini native (grounding) free at priorCount 0", () => {
    // The native billing path always passes priorCount=0, so Gemini grounding
    // stays inside its free tier — confirms the pre-launch simplification.
    expect(calcSearchCostMicro(nativeSearchPricingKey("google"), 0)).toBe(0);
  });
});

describe("calcAnthropicCacheCostMicro", () => {
  const inRate = MODEL_PRICING["claude-opus-4-8"].input; // µ$/token

  it("bills cache writes at 1.25x and reads at 0.1x of base input", () => {
    // 20513 write + 2672 read on opus-4-8 (the measured native-search case)
    const expected = Math.round(20513 * inRate * 1.25 + 2672 * inRate * 0.1);
    expect(calcAnthropicCacheCostMicro("claude-opus-4-8", 20513, 2672)).toBe(expected);
    expect(expected).toBe(129_542); // 128206 (write) + 1336 (read)
  });

  it("is 0 when there are no cache tokens", () => {
    expect(calcAnthropicCacheCostMicro("claude-opus-4-8", 0, 0)).toBe(0);
  });

  it("tolerates missing/undefined token counts", () => {
    expect(calcAnthropicCacheCostMicro("claude-opus-4-8")).toBe(0);
    expect(calcAnthropicCacheCostMicro("claude-opus-4-8", undefined, 100)).toBe(Math.round(100 * inRate * 0.1));
  });

  it("returns 0 for an unknown model", () => {
    expect(calcAnthropicCacheCostMicro("nope", 1000, 1000)).toBe(0);
  });
});

describe("nativeSearchPricingKey", () => {
  it("maps each AI provider to its native-search pricing key", () => {
    expect(nativeSearchPricingKey("anthropic")).toBe("anthropic-websearch");
    expect(nativeSearchPricingKey("openai")).toBe("openai-websearch");
    expect(nativeSearchPricingKey("google")).toBe("gemini-grounding");
  });
  it("returns null for an unknown provider", () => {
    expect(nativeSearchPricingKey("mistral")).toBeNull();
    expect(nativeSearchPricingKey(undefined)).toBeNull();
  });
  it("returns keys that exist in SEARCH_PRICING", () => {
    for (const p of ["anthropic", "openai", "google"]) {
      expect(SEARCH_PRICING[nativeSearchPricingKey(p)]).toBeDefined();
    }
  });
});

describe("buildSearchBlock", () => {
  it("returns empty when no usable results", () => {
    expect(buildSearchBlock(null)).toBe("");
    expect(buildSearchBlock({ results: [] })).toBe("");
    expect(buildSearchBlock({ results: [{ title: "x" }] })).toBe("");
  });
  it("includes title, snippet, url and numbers them", () => {
    const block = buildSearchBlock({ results: [{ title: "T", url: "https://e.com", snippet: "S" }] });
    expect(block).toContain("[1] T");
    expect(block).toContain("https://e.com");
    expect(block).toContain("全1件");
  });
  it("caps at 8 sources", () => {
    const results = Array.from({ length: 12 }, (_, i) => ({ title: `t${i}`, url: `https://e.com/${i}`, snippet: `s${i}` }));
    const block = buildSearchBlock({ results });
    expect(block).toContain("[8]");
    expect(block).not.toContain("[9]");
    expect(block).toContain("全8件");
  });
  it("truncates long snippets", () => {
    const block = buildSearchBlock({ results: [{ title: "T", url: "https://e.com", snippet: "あ".repeat(400) }] });
    expect(block).toContain("…");
    expect(block).not.toContain("あ".repeat(250));
  });
});
