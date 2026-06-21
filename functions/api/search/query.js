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
const MAX_QUERIES = 3;   // facet sub-queries per round (bounds search cost)
const MAX_RESULTS = 10;  // merged sources returned for injection

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
async function logSearch(db, userId, sessionId, provider, latencyMs, searchCount) {
  try {
    await db.prepare(
      `INSERT INTO llm_request_log (user_id, session_id, model, provider, input_tokens, output_tokens, latency_ms, search_requests)
       VALUES (?, ?, 'web_search', ?, 0, 0, ?, ?)`
    ).bind(userId, sessionId || null, provider, latencyMs, searchCount).run();
  } catch {
    // best-effort
  }
}

// Accept either a single `query` (back-compat) or a `queries` array (multi-facet
// search). Returns a validated, trimmed, de-duplicated, length-capped list of at
// most MAX_QUERIES strings.
function parseQueries(body) {
  const raw = Array.isArray(body.queries)
    ? body.queries
    : (typeof body.query === "string" ? [body.query] : []);
  const cleaned = raw
    .filter((q) => typeof q === "string" && q.trim() && q.length <= MAX_QUERY_LEN)
    .map((q) => q.trim());
  return [...new Set(cleaned)].slice(0, MAX_QUERIES);
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
  const queries = parseQueries(body);
  if (queries.length === 0) {
    return json({ error: "Invalid query (1-2000 chars, max 3)" }, 400);
  }
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

  // Run each facet query concurrently. Provider errors per query are tolerated
  // (that facet just contributes nothing); only an all-fail returns 502.
  const provider = resolveSearchProvider(env);
  const start = Date.now();
  const settled = await Promise.all(
    queries.map((q) => provider.search(q, env).catch(() => null))
  );
  const ok = settled.filter(Boolean);
  const latencyMs = Date.now() - start;
  if (ok.length === 0) {
    return json({ error: "Search provider error" }, 502);
  }

  // Merge + de-duplicate sources across facets. Grounding often attributes the
  // SAME fact segment to several domains, so dedupe primarily on snippet text
  // (fall back to title when empty). This collapses near-identical facts and
  // keeps the 10 injected slots diverse instead of repeating one restaurant.
  const seen = new Set();
  const merged = [];
  for (const r of ok) {
    for (const s of (r.sources || [])) {
      const snippet = (s.snippet || "").trim();
      const key = snippet ? snippet.slice(0, 120) : `title:${(s.title || "").trim()}`;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      merged.push(s);
    }
  }
  const results = merged.slice(0, MAX_RESULTS);

  // Bill one web_search row per SUCCESSFUL grounding call (each is a real fee),
  // applying the monthly free tier incrementally across this request's calls.
  const priorCount = await countMonthlySearches(env.DB, user.sub);
  for (let i = 0; i < ok.length; i++) {
    const costMicro = calcSearchCostMicro(provider.name, priorCount + i);
    try {
      await recordSearch(env.DB, user.sub, provider.name, costMicro);
    } catch {
      // Degraded: return results even if a billing write fails (cap already gated).
    }
  }
  await logSearch(env.DB, user.sub, sessionId, provider.name, latencyMs, ok.length);

  return json({ provider: provider.name, queries, results }, 200);
}
