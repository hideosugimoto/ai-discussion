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
import { resolveProviderForType } from "./_providers/index.js";

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

// Accept a single `query` string (back-compat), or a `queries` array whose
// items are either strings or { q, type } objects. `type` ("place" | "general")
// routes the query to Maps vs web grounding. Returns a validated, de-duplicated,
// capped list of { q, type } objects.
export function parseQueries(body) {
  const raw = Array.isArray(body?.queries)
    ? body.queries
    : (typeof body?.query === "string" ? [body.query] : []);
  const out = [];
  const seen = new Set();
  for (const item of raw) {
    const q = (typeof item === "string" ? item : item?.q || "").trim();
    if (!q || q.length > MAX_QUERY_LEN || seen.has(q)) continue;
    const type = (typeof item === "object" && item?.type === "place") ? "place" : "general";
    seen.add(q);
    out.push({ q, type });
    if (out.length >= MAX_QUERIES) break;
  }
  return out;
}

// Merge + de-duplicate sources across facet results. Grounding often attributes
// the SAME fact segment to several domains, so dedupe primarily on snippet text
// (fall back to title when empty), then cap. Pure (no I/O) — unit-tested.
export function mergeSources(results, max = MAX_RESULTS) {
  const seen = new Set();
  const merged = [];
  for (const r of (results || [])) {
    for (const s of (r?.sources || [])) {
      const snippet = (s?.snippet || "").trim();
      const key = snippet ? snippet.slice(0, 120) : `title:${(s?.title || "").trim()}`;
      if (key === "title:" || seen.has(key)) continue;
      seen.add(key);
      merged.push(s);
    }
  }
  return merged.slice(0, max);
}

// Run all facet queries concurrently, routing by type. A per-query provider
// error is tolerated (that facet yields null). Returns { ok, latencyMs }.
async function runSearches(queries, env) {
  const start = Date.now();
  const settled = await Promise.all(
    queries.map(({ q, type }) => resolveProviderForType(env, type).search(q, env).catch(() => null))
  );
  return { ok: settled.filter(Boolean), latencyMs: Date.now() - start };
}

// Bill one usage row per successful grounding call, priced by that call's
// provider; free tier applied against the combined monthly count.
async function billSearches(db, userId, sessionId, ok, latencyMs) {
  const priorCount = await countMonthlySearches(db, userId);
  for (let i = 0; i < ok.length; i++) {
    const providerName = ok[i].provider;
    const costMicro = calcSearchCostMicro(providerName, priorCount + i);
    try {
      await recordSearch(db, userId, providerName, costMicro);
    } catch {
      // Degraded: return results even if a billing write fails (cap already gated).
    }
    await logSearch(db, userId, sessionId, providerName, latencyMs, 1);
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

  // Run searches (routed by type), then 502 only if every facet failed.
  const { ok, latencyMs } = await runSearches(queries, env);
  if (ok.length === 0) {
    return json({ error: "Search provider error" }, 502);
  }

  const results = mergeSources(ok);
  await billSearches(env.DB, user.sub, sessionId, ok, latencyMs);

  const providers = [...new Set(ok.map((r) => r.provider))];
  return json({ providers, queries, results }, 200);
}
