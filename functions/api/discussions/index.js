// /api/discussions
//   GET  - list discussions for current user (paginated)
//   POST - create a new discussion (server-generated id)

import {
  jsonResponse,
  requirePremium,
  validatePayload,
  normalizeTags,
  countRounds,
  computeSizeBytes,
  ftsUpsertStatements,
  MAX_DISCUSSIONS_PER_USER,
} from "./_lib.js";

export async function onRequestGet(context) {
  const { env, data, request } = context;
  const guard = await requirePremium(env, data.user);
  if (guard.error) return guard.error;

  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "50", 10) || 50, 100);
  const offset = Math.max(parseInt(url.searchParams.get("offset") || "0", 10) || 0, 0);

  const userId = data.user.sub;

  const rows = await env.DB.prepare(
    "SELECT id, topic, tags, round_count, size_bytes, created_at, updated_at FROM discussions WHERE user_id = ? ORDER BY updated_at DESC LIMIT ? OFFSET ?"
  )
    .bind(userId, limit, offset)
    .all();

  const totalRow = await env.DB.prepare(
    "SELECT COUNT(*) as cnt, COALESCE(SUM(size_bytes), 0) as bytes FROM discussions WHERE user_id = ?"
  )
    .bind(userId)
    .first();

  return jsonResponse({
    discussions: (rows?.results || []).map((r) => ({
      id: r.id,
      topic: r.topic,
      tags: r.tags ? r.tags.split(",").filter(Boolean) : [],
      roundCount: r.round_count,
      sizeBytes: r.size_bytes,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })),
    total: totalRow?.cnt || 0,
    totalBytes: totalRow?.bytes || 0,
    limit: MAX_DISCUSSIONS_PER_USER,
  });
}

export async function onRequestPost(context) {
  const { env, data, request } = context;
  const guard = await requirePremium(env, data.user);
  if (guard.error) return guard.error;

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }

  const validationError = validatePayload(body);
  if (validationError) return jsonResponse({ error: validationError }, 400);

  const userId = data.user.sub;

  // Enforce per-user discussion count limit
  const countRow = await env.DB.prepare(
    "SELECT COUNT(*) as cnt FROM discussions WHERE user_id = ?"
  )
    .bind(userId)
    .first();
  if ((countRow?.cnt || 0) >= MAX_DISCUSSIONS_PER_USER) {
    return jsonResponse(
      {
        error: "Discussion limit reached",
        limit: MAX_DISCUSSIONS_PER_USER,
        message: "古い議論を削除してから再度お試しください。",
      },
      409
    );
  }

  const id = crypto.randomUUID();
  const tagsCsv = normalizeTags(body.tags);
  const sizeBytes = computeSizeBytes(body.data_json);
  const roundCount = countRounds(body.data_json);

  const stmts = [
    env.DB.prepare(
      "INSERT INTO discussions (id, user_id, topic, data_json, tags, round_count, size_bytes) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).bind(id, userId, body.topic, body.data_json, tagsCsv, roundCount, sizeBytes),
    ...ftsUpsertStatements(env.DB, id, userId, body.topic, body.data_json, tagsCsv),
  ];
  await env.DB.batch(stmts);

  return jsonResponse({ id }, 201);
}
