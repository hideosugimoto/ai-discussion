// Web search endpoint (Architecture B): runs ONE retrieval and returns the
// uniform { results } payload that the discussion layer injects identically
// into all three AIs. Premium-only. Mirrors chat/stream.js for auth + billing.
//
// Cost accounting: each successful search records one usage_monthly row with
// model="web_search", so the existing monthly SUM(cost_micro) cap in
// chat/stream.js naturally includes search spend. Searches inside the
// provider's monthly free tier cost 0 (see calcSearchCostMicro). Failed
// searches are not billed.

import { getEffectiveLimitMicro } from "../_lib_billing.js";
import { calcSearchCostMicro } from "../../../src/models.config.js";
import { resolveSearchProvider } from "./_providers/index.js";

const MAX_QUERY_LEN = 2000;

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function checkUsageLimit(db, userId, limitMicro) {
  const yearMonth = new Date().toISOString().slice(0, 7);
  const result = await db
    .prepare(
      "SELECT COALESCE(SUM(cost_micro), 0) as total FROM usage_monthly WHERE user_id = ? AND year_month = ?"
    )
    .bind(userId, yearMonth)
    .first();
  const total = result?.total || 0;
  return { totalMicro: total, exceeded: total >= limitMicro };
}

// Count this month's recorded searches for the user, used to apply the
// provider's monthly free tier before charging.
async function countMonthlySearches(db, userId) {
  const yearMonth = new Date().toISOString().slice(0, 7);
  const row = await db
    .prepare(
      "SELECT COUNT(*) as n FROM usage_monthly WHERE user_id = ? AND year_month = ? AND model = 'web_search'"
    )
    .bind(userId, yearMonth)
    .first();
  return row?.n || 0;
}

// Record a billable (or free-tier, cost 0) search across the usage tables.
async function recordSearch(db, userId, provider, costMicro) {
  const yearMonth = new Date().toISOString().slice(0, 7);
  const today = new Date().toISOString().slice(0, 10);
  await db.batch([
    db.prepare(
      "INSERT INTO usage_monthly (user_id, year_month, model, input_tokens, output_tokens, cost_micro) VALUES (?, ?, 'web_search', 0, 0, ?)"
    ).bind(userId, yearMonth, costMicro),
    db.prepare(
      `INSERT INTO usage_daily (user_id, date, total_cost_micro, request_count)
       VALUES (?, ?, ?, 1)
       ON CONFLICT(user_id, date) DO UPDATE SET
         total_cost_micro = total_cost_micro + ?,
         request_count = request_count + 1`
    ).bind(userId, today, costMicro, costMicro),
  ]);
}

// Analytics log (best-effort): one row per search, search_requests = 1.
async function logSearch(db, userId, sessionId, provider, latencyMs) {
  try {
    await db.prepare(
      `INSERT INTO llm_request_log (user_id, session_id, model, provider, input_tokens, output_tokens, latency_ms, search_requests)
       VALUES (?, ?, 'web_search', ?, 0, 0, ?, 1)`
    ).bind(userId, sessionId || null, provider, latencyMs, 1).run();
  } catch {
    // best-effort
  }
}

export async function onRequestPost(context) {
  const { request, env, data } = context;
  const user = data.user;
  if (!user) return json({ error: "Authentication required" }, 401);

  // Premium gate (plan read from DB, not JWT claim) — mirrors chat/stream.js.
  const dbUser = await env.DB.prepare("SELECT plan FROM users WHERE id = ?")
    .bind(user.sub)
    .first();
  if (!dbUser || dbUser.plan === "free" || !dbUser.plan) {
    return json({ error: "Premium plan required" }, 403);
  }
  const userPlan = dbUser.plan;

  // Parse + validate input.
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (typeof body.query !== "string" || !body.query.trim() || body.query.length > MAX_QUERY_LEN) {
    return json({ error: "Invalid query (1-2000 chars)" }, 400);
  }
  const query = body.query.trim();
  const sessionId = typeof body.sessionId === "string" ? body.sessionId.slice(0, 100) : null;

  // Monthly cap check (base + active credits). Same SUM the chat path uses, so
  // search spend and token spend share one budget.
  const { effective: limitMicro } = await getEffectiveLimitMicro(env.DB, env, user.sub, userPlan);
  const usage = await checkUsageLimit(env.DB, user.sub, limitMicro);
  if (usage.exceeded) {
    return json({
      error: "Monthly usage limit exceeded",
      total_usd: usage.totalMicro / 1_000_000,
      limit_usd: limitMicro / 1_000_000,
    }, 429);
  }

  // Run the search. Provider errors are not billed.
  const provider = resolveSearchProvider(env);
  const start = Date.now();
  let result;
  try {
    result = await provider.search(query, env);
  } catch (e) {
    return json({ error: "Search provider error" }, 502);
  }
  const latencyMs = Date.now() - start;

  // Bill on success (free tier → cost 0). Then log (best-effort).
  const priorCount = await countMonthlySearches(env.DB, user.sub);
  const costMicro = calcSearchCostMicro(provider.name, priorCount);
  try {
    await recordSearch(env.DB, user.sub, provider.name, costMicro);
  } catch {
    // If billing write fails, still return results (degraded) — the cap check
    // above already gated entry, and one unbilled search is acceptable.
  }
  await logSearch(env.DB, user.sub, sessionId, provider.name, latencyMs);

  return json({ provider: provider.name, query, results: result.sources || [] }, 200);
}
