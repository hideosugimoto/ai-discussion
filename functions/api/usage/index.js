// Usage query API - returns current month's usage and remaining credit
import { getEffectiveLimitMicro } from "../_lib_billing.js";
import { sumByModel } from "../_lib_usage.js";
import { maybePruneRequestLog } from "../_lib_retention.js";

export async function onRequestGet(context) {
  try {
  const { env, data } = context;
  const user = data.user;

  if (!user) {
    return new Response(
      JSON.stringify({ error: "Not authenticated" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  // Opportunistic analytics-log retention, only for authenticated callers.
  // Runs after the response via waitUntil, so it costs the user nothing.
  maybePruneRequestLog(context, env);

  // Get current plan from DB (not from JWT)
  const dbUser = await env.DB.prepare("SELECT plan FROM users WHERE id = ?")
    .bind(user.sub)
    .first();
  const currentPlan = dbUser?.plan || "free";

  const yearMonth = new Date().toISOString().slice(0, 7);
  const { base: baseLimitMicro, credits: creditsMicro, effective: limitMicro } =
    await getEffectiveLimitMicro(env.DB, env, user.sub, currentPlan);
  const limitUSD = limitMicro / 1_000_000;

  // Per-model breakdown. The month's grand total is derived from these rows
  // rather than queried separately: both statements scanned the exact same
  // usage_monthly rows under the same WHERE, so asking twice doubled the rows
  // read for a number we can just add up.
  const byModel = await env.DB.prepare(
    "SELECT model, SUM(input_tokens) as input_tokens, SUM(output_tokens) as output_tokens, SUM(cost_micro) as cost_micro, COUNT(*) as requests FROM usage_monthly WHERE user_id = ? AND year_month = ? GROUP BY model"
  )
    .bind(user.sub, yearMonth)
    .all();

  const monthly = sumByModel(byModel?.results);

  // Daily history (last 30 days)
  const daily = await env.DB.prepare(
    "SELECT date, total_cost_micro, request_count FROM usage_daily WHERE user_id = ? AND date >= date('now', '-30 days') ORDER BY date DESC"
  )
    .bind(user.sub)
    .all();

  const totalMicro = monthly?.total_cost || 0;
  const totalUSD = totalMicro / 1_000_000;
  const remainingUSD = Math.max(0, limitUSD - totalUSD);
  const usagePercent = Math.min(100, (totalMicro / limitMicro) * 100);

  return new Response(
    JSON.stringify({
      plan: currentPlan,
      yearMonth,
      limit_usd: limitUSD,
      base_limit_usd: baseLimitMicro / 1_000_000,
      credits_usd: creditsMicro / 1_000_000,
      used_usd: Math.round(totalUSD * 10000) / 10000,
      remaining_usd: Math.round(remainingUSD * 10000) / 10000,
      usage_percent: Math.round(usagePercent * 10) / 10,
      total_input_tokens: monthly?.total_input || 0,
      total_output_tokens: monthly?.total_output || 0,
      request_count: monthly?.request_count || 0,
      by_model: (byModel?.results || []).map((m) => ({
        ...m,
        cost_usd: (m.cost_micro || 0) / 1_000_000,
      })),
      daily: (daily?.results || []).map((d) => ({
        ...d,
        total_cost_usd: (d.total_cost_micro || 0) / 1_000_000,
      })),
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }
  );
  } catch (e) {
    console.error("[api/usage] Error:", e?.message || e, e?.stack || "");
    return new Response(
      JSON.stringify({ error: "Usage query failed", detail: e?.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
