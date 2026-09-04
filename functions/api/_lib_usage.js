// Shared usage-aggregation helpers.
//
// File name starts with "_" so Cloudflare Pages Functions skips it from
// routing. It's importable as a regular module.

// Roll a per-model breakdown up into the month's grand total.
//
// The totals used to come from their own SELECT over usage_monthly with the
// same WHERE clause as the GROUP BY — i.e. the same rows were scanned twice
// per /api/usage call, for numbers that are just the sum of the breakdown.
// Shape matches the old query's columns so callers are unchanged.
export function sumByModel(rows) {
  const totals = {
    total_cost: 0,
    total_input: 0,
    total_output: 0,
    request_count: 0,
  };
  for (const r of rows || []) {
    totals.total_cost += r.cost_micro || 0;
    totals.total_input += r.input_tokens || 0;
    totals.total_output += r.output_tokens || 0;
    totals.request_count += r.requests || 0;
  }
  return totals;
}
