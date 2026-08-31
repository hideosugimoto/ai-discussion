// Tests for time-limited (introductory) pricing in src/models.config.js.
// A promo that silently outlives its expiry under-charges the proxy, so the
// expiry boundary and the "every promo declares its list price" invariant are
// both pinned here.
import { describe, it, expect } from "vitest";
import {
  MODEL_PRICING,
  pricingFor,
  calcCostUSD,
  calcCostMicro,
  calcAnthropicCacheCostMicro,
  estimateMaxCostMicro,
} from "../models.config.js";

const PROMO_END = Date.parse("2026-12-31T23:59:59Z");
const DURING_PROMO = Date.parse("2026-08-31T00:00:00Z");
const AFTER_PROMO = Date.parse("2027-01-01T00:00:00Z");

// Models Google put on the shared 3.x Flash introductory price.
const PROMO_MODELS = ["gemini-3.7-flash", "gemini-3.6-flash"];

describe("pricingFor", () => {
  it.each(PROMO_MODELS)("%s bills the introductory rate during the promo", (model) => {
    expect(pricingFor(model, DURING_PROMO)).toEqual({ input: 0.75, output: 3.75 });
  });

  it.each(PROMO_MODELS)("%s falls back to the list rate once the promo ends", (model) => {
    expect(pricingFor(model, AFTER_PROMO)).toEqual({ input: 1.5, output: 7.5 });
  });

  it("still bills the promo rate at the exact expiry instant", () => {
    // `until` is inclusive: the switch happens strictly after it.
    expect(pricingFor("gemini-3.7-flash", PROMO_END)).toEqual({ input: 0.75, output: 3.75 });
  });

  it("switches to the list rate 1ms after expiry", () => {
    expect(pricingFor("gemini-3.7-flash", PROMO_END + 1)).toEqual({ input: 1.5, output: 7.5 });
  });

  it("returns a flat rate for models with no promo, whatever the time", () => {
    const flat = { input: 5, output: 25 };
    expect(pricingFor("claude-opus-4-8", DURING_PROMO)).toEqual(flat);
    expect(pricingFor("claude-opus-4-8", AFTER_PROMO)).toEqual(flat);
  });

  it("returns null for an unpriced model", () => {
    expect(pricingFor("gemini-9.9-imaginary", DURING_PROMO)).toBeNull();
  });

  it("never leaks the promo wrapper keys to callers", () => {
    // Callers destructure { input, output }; an entry's `until`/`after` must
    // stay internal or a consumer could bill off the wrong shape.
    expect(Object.keys(pricingFor("gemini-3.7-flash", DURING_PROMO)).sort()).toEqual([
      "input",
      "output",
    ]);
  });
});

describe("MODEL_PRICING promo entries", () => {
  it("declares both `until` and `after` together", () => {
    // Half a declaration is the dangerous case: `until` with no `after` would
    // pin the promo rate forever (under-charging after expiry).
    const broken = Object.entries(MODEL_PRICING).filter(
      ([, e]) => Boolean(e.until) !== Boolean(e.after),
    );
    expect(broken.map(([tag]) => tag)).toEqual([]);
  });

  it("gives every promo a parseable expiry and a full list price", () => {
    for (const [tag, entry] of Object.entries(MODEL_PRICING)) {
      if (!entry.until) continue;
      expect(Number.isNaN(Date.parse(entry.until)), `${tag} until`).toBe(false);
      expect(typeof entry.after.input, `${tag} after.input`).toBe("number");
      expect(typeof entry.after.output, `${tag} after.output`).toBe("number");
    }
  });

  it("prices every promo below its own list price", () => {
    for (const [tag, entry] of Object.entries(MODEL_PRICING)) {
      if (!entry.after) continue;
      expect(entry.input, `${tag} input`).toBeLessThan(entry.after.input);
      expect(entry.output, `${tag} output`).toBeLessThan(entry.after.output);
    }
  });
});

describe("cost functions honour the promo boundary", () => {
  const M = "gemini-3.7-flash";

  it("calcCostMicro doubles once the promo lapses", () => {
    // 1M in + 1M out: 0.75 + 3.75 = 4.5 µ$/token-pair basis → 4,500,000 µ$
    expect(calcCostMicro(M, 1_000_000, 1_000_000, DURING_PROMO)).toBe(4_500_000);
    expect(calcCostMicro(M, 1_000_000, 1_000_000, AFTER_PROMO)).toBe(9_000_000);
  });

  it("calcCostUSD honours the boundary", () => {
    expect(calcCostUSD(M, 1_000_000, 1_000_000, DURING_PROMO)).toBeCloseTo(4.5, 10);
    expect(calcCostUSD(M, 1_000_000, 1_000_000, AFTER_PROMO)).toBeCloseTo(9.0, 10);
  });

  it("estimateMaxCostMicro (pre-debit) honours the boundary", () => {
    // 500 input + 1500 output tokens
    expect(estimateMaxCostMicro(M, DURING_PROMO)).toBe(Math.round(500 * 0.75 + 1500 * 3.75));
    expect(estimateMaxCostMicro(M, AFTER_PROMO)).toBe(Math.round(500 * 1.5 + 1500 * 7.5));
  });

  it("keeps non-promo models stable across the boundary", () => {
    const before = calcCostMicro("claude-opus-4-8", 1000, 1000, DURING_PROMO);
    const after = calcCostMicro("claude-opus-4-8", 1000, 1000, AFTER_PROMO);
    expect(before).toBe(after);
    expect(before).toBe(30_000);
  });

  it("keeps the Anthropic cache path on flat pricing", () => {
    // Anthropic has no promo entry; the cache multipliers must be unaffected
    // by the Gemini promo boundary.
    const before = calcAnthropicCacheCostMicro("claude-opus-4-8", 1000, 1000, DURING_PROMO);
    const after = calcAnthropicCacheCostMicro("claude-opus-4-8", 1000, 1000, AFTER_PROMO);
    expect(before).toBe(after);
    expect(before).toBe(Math.round(1000 * 5 * 1.25 + 1000 * 5 * 0.1));
  });

  it("returns 0 for an unpriced model on every path", () => {
    expect(calcCostMicro("nope", 100, 100, DURING_PROMO)).toBe(0);
    expect(calcCostUSD("nope", 100, 100, DURING_PROMO)).toBe(0);
    expect(estimateMaxCostMicro("nope", DURING_PROMO)).toBe(0);
    expect(calcAnthropicCacheCostMicro("nope", 100, 100, DURING_PROMO)).toBe(0);
  });

  it("defaults to the current clock when `now` is omitted", () => {
    // Production callers pass no `now`; the default must resolve to the same
    // rate as an explicit Date.now().
    expect(calcCostMicro(M, 1000, 1000)).toBe(calcCostMicro(M, 1000, 1000, Date.now()));
  });
});
