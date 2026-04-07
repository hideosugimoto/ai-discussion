// /api/discussions/search?q=...&tag=...
//
// Full-text search via FTS5. Always scoped to current user.
// Optional `tag` filter (single tag, exact match against normalized tags).

import { jsonResponse, requirePremium } from "./_lib.js";

const MAX_RESULTS = 50;
const MAX_QUERY_LEN = 200;

// FTS5 query strings can contain operators that change semantics or break
// parsing. We escape user input by wrapping each whitespace-separated token
// in double quotes. This treats the query as a series of phrase searches
// (AND'd together by default).
function escapeFtsQuery(raw) {
  const tokens = raw
    .trim()
    .slice(0, MAX_QUERY_LEN)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 10);
  if (tokens.length === 0) return null;
  return tokens
    .map((t) => `"${t.replace(/"/g, '""')}"`)
    .join(" ");
}

export async function onRequestGet(context) {
  const { env, data, request } = context;
  const guard = await requirePremium(env, data.user);
  if (guard.error) return guard.error;

  const url = new URL(request.url);
  const rawQuery = url.searchParams.get("q") || "";
  const tagFilter = (url.searchParams.get("tag") || "").trim().toLowerCase().slice(0, 30);

  const userId = data.user.sub;

  // No query AND no tag → 400
  if (!rawQuery.trim() && !tagFilter) {
    return jsonResponse({ error: "q or tag required" }, 400);
  }

  let rows;

  if (rawQuery.trim()) {
    const ftsQuery = escapeFtsQuery(rawQuery);
    if (!ftsQuery) return jsonResponse({ results: [] });

    // Filter by user_id on the canonical (indexed) discussions table rather
    // than the UNINDEXED FTS column for better query planning.
    rows = await env.DB.prepare(
      `SELECT d.id, d.topic, d.tags, d.round_count, d.size_bytes, d.created_at, d.updated_at
       FROM discussions_fts f
       JOIN discussions d ON d.id = f.discussion_id
       WHERE d.user_id = ? AND discussions_fts MATCH ?
       ORDER BY rank
       LIMIT ?`
    )
      .bind(userId, ftsQuery, MAX_RESULTS)
      .all();
  } else {
    // Tag-only filter. ESCAPE clause is required because tagFilter could
    // contain LIKE wildcards (% _) that would otherwise broaden the match.
    const escapedTag = tagFilter.replace(/[\\%_]/g, "\\$&");
    rows = await env.DB.prepare(
      `SELECT id, topic, tags, round_count, size_bytes, created_at, updated_at
       FROM discussions
       WHERE user_id = ? AND (',' || tags || ',') LIKE ? ESCAPE '\\'
       ORDER BY updated_at DESC
       LIMIT ?`
    )
      .bind(userId, `%,${escapedTag},%`, MAX_RESULTS)
      .all();
  }

  let results = (rows?.results || []).map((r) => ({
    id: r.id,
    topic: r.topic,
    tags: r.tags ? r.tags.split(",").filter(Boolean) : [],
    roundCount: r.round_count,
    sizeBytes: r.size_bytes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));

  // If both q and tag were provided, filter the FTS results client-side
  if (rawQuery.trim() && tagFilter) {
    results = results.filter((r) => r.tags.includes(tagFilter));
  }

  return jsonResponse({ results });
}
