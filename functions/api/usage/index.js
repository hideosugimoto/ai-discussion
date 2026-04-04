// Usage query API - returns current month's usage and remaining credit
export async function onRequestGet(context) {
  const { env, data } = context;
  const user = data.user;

  if (!user) {
    return new Response(
      JSON.stringify({ error: "Not authenticated" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  // Get current plan from DB (not from JWT)
  const dbUser = await env.DB.prepare("SELECT plan FROM users WHERE id = ?")
    .bind(user.sub)
    .first();
  const currentPlan = dbUser?.plan || "free";

  const yearMonth = new Date().toISOString().slice(0, 7);
  const limitUSD = parseFloat(env.MONTHLY_COST_LIMIT_USD || "1.96");

  // Monthly total
  const monthly = await env.DB.prepare(
    "SELECT COALESCE(SUM(cost_usd), 0) as total_cost, COALESCE(SUM(input_tokens), 0) as total_input, COALESCE(SUM(output_tokens), 0) as total_output, COUNT(*) as request_count FROM usage_monthly WHERE user_id = ? AND year_month = ?"
  )
    .bind(user.sub, yearMonth)
    .first();

  // Per-model breakdown
  const byModel = await env.DB.prepare(
    "SELECT model, SUM(input_tokens) as input_tokens, SUM(output_tokens) as output_tokens, SUM(cost_usd) as cost_usd, COUNT(*) as requests FROM usage_monthly WHERE user_id = ? AND year_month = ? GROUP BY model"
  )
    .bind(user.sub, yearMonth)
    .all();

  // Daily history (last 30 days)
  const daily = await env.DB.prepare(
    "SELECT date, total_cost_usd, request_count FROM usage_daily WHERE user_id = ? AND date >= date('now', '-30 days') ORDER BY date DESC"
  )
    .bind(user.sub)
    .all();

  const totalCost = monthly?.total_cost || 0;
  const remainingUSD = Math.max(0, limitUSD - totalCost);
  const usagePercent = Math.min(100, (totalCost / limitUSD) * 100);

  return new Response(
    JSON.stringify({
      plan: currentPlan,
      yearMonth,
      limit_usd: limitUSD,
      used_usd: Math.round(totalCost * 10000) / 10000,
      remaining_usd: Math.round(remainingUSD * 10000) / 10000,
      usage_percent: Math.round(usagePercent * 10) / 10,
      total_input_tokens: monthly?.total_input || 0,
      total_output_tokens: monthly?.total_output || 0,
      request_count: monthly?.request_count || 0,
      by_model: byModel?.results || [],
      daily: daily?.results || [],
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }
  );
}
