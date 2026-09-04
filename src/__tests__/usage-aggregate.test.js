// /api/usage used to ask D1 for the month's totals with a second SELECT over
// the same usage_monthly rows the per-model GROUP BY already scanned. The
// totals are now derived in JS, so these tests pin that the derived numbers
// equal what the removed SQL (SUM/COUNT over the same WHERE) would have
// returned — the values drive the cost figures shown to paying users.
import { describe, it, expect } from "vitest";
import { sumByModel } from "../../functions/api/_lib_usage.js";

// What the removed query computed, expressed over the raw rows.
function sqlEquivalent(rawRows) {
  return {
    total_cost: rawRows.reduce((n, r) => n + r.cost_micro, 0),
    total_input: rawRows.reduce((n, r) => n + r.input_tokens, 0),
    total_output: rawRows.reduce((n, r) => n + r.output_tokens, 0),
    request_count: rawRows.length,
  };
}

// What the GROUP BY returns for those same rows.
function groupByModel(rawRows) {
  const acc = new Map();
  for (const r of rawRows) {
    const cur = acc.get(r.model) || {
      model: r.model, input_tokens: 0, output_tokens: 0, cost_micro: 0, requests: 0,
    };
    cur.input_tokens += r.input_tokens;
    cur.output_tokens += r.output_tokens;
    cur.cost_micro += r.cost_micro;
    cur.requests += 1;
    acc.set(r.model, cur);
  }
  return [...acc.values()];
}

describe("sumByModel", () => {
  it("matches the removed SQL aggregate over the same rows", () => {
    const raw = [
      { model: "gemini-3.7-flash", input_tokens: 500, output_tokens: 1500, cost_micro: 6000 },
      { model: "gemini-3.7-flash", input_tokens: 300, output_tokens: 900, cost_micro: 3600 },
      { model: "claude-opus-4-8", input_tokens: 400, output_tokens: 1200, cost_micro: 32000 },
      { model: "gpt-5.6-sol", input_tokens: 200, output_tokens: 600, cost_micro: 19000 },
    ];
    expect(sumByModel(groupByModel(raw))).toEqual(sqlEquivalent(raw));
  });

  it("counts requests across models, not distinct models", () => {
    // request_count came from COUNT(*) over the raw rows, so it must sum the
    // per-model `requests`, not the number of groups.
    const raw = Array.from({ length: 9 }, (_, i) => ({
      model: ["a", "b", "c"][i % 3], input_tokens: 1, output_tokens: 1, cost_micro: 1,
    }));
    const totals = sumByModel(groupByModel(raw));
    expect(totals.request_count).toBe(9);
  });

  it("returns zeroes for an empty month (matching COALESCE(...,0))", () => {
    const empty = { total_cost: 0, total_input: 0, total_output: 0, request_count: 0 };
    expect(sumByModel([])).toEqual(empty);
    expect(sumByModel(undefined)).toEqual(empty);
    expect(sumByModel(null)).toEqual(empty);
  });

  it("treats null/missing columns as 0", () => {
    // D1 returns NULL for SUM over no matching rows; COALESCE handled it in SQL.
    expect(sumByModel([{ model: "x", cost_micro: null, input_tokens: undefined, requests: 2 }]))
      .toEqual({ total_cost: 0, total_input: 0, total_output: 0, request_count: 2 });
  });

  it("keeps microdollar totals exact (integer arithmetic, no float drift)", () => {
    const rows = Array.from({ length: 1000 }, () => ({
      model: "m", cost_micro: 12345, input_tokens: 7, output_tokens: 9, requests: 1,
    }));
    const totals = sumByModel(rows);
    expect(totals.total_cost).toBe(12_345_000);
    expect(Number.isInteger(totals.total_cost)).toBe(true);
  });
});
