// /api/share
//   GET  - list current user's shared discussions (Premium)
//   POST - create a new share from existing discussion data (Premium)

import {
  jsonResponse,
  requirePremium,
  generateShareId,
  sanitizeForSharing,
  MAX_SHARED_PER_USER,
  MAX_SHARED_DATA_BYTES,
  MAX_TOPIC_LEN,
} from "./_lib.js";

export async function onRequestGet(context) {
  const { env, data } = context;
  const guard = await requirePremium(env, data.user);
  if (guard.error) return guard.error;

  const userId = data.user.sub;

  const rows = await env.DB.prepare(
    "SELECT id, topic, view_count, created_at, expires_at FROM shared_discussions WHERE user_id = ? ORDER BY created_at DESC LIMIT 100"
  )
    .bind(userId)
    .all();

  return jsonResponse({
    shares: (rows?.results || []).map((r) => ({
      id: r.id,
      topic: r.topic,
      viewCount: r.view_count,
      createdAt: r.created_at,
      expiresAt: r.expires_at,
    })),
    limit: MAX_SHARED_PER_USER,
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

  if (!body || typeof body !== "object") {
    return jsonResponse({ error: "Invalid body" }, 400);
  }
  if (typeof body.topic !== "string" || !body.topic.trim()) {
    return jsonResponse({ error: "topic required" }, 400);
  }
  if (body.topic.length > MAX_TOPIC_LEN) {
    return jsonResponse({ error: "topic too long" }, 400);
  }
  if (typeof body.data_json !== "string") {
    return jsonResponse({ error: "data_json required" }, 400);
  }

  // CRITICAL: Sanitize before storing publicly
  const sanitizeResult = sanitizeForSharing(body.data_json);
  if (!sanitizeResult.ok) {
    return jsonResponse({ error: sanitizeResult.error }, 400);
  }

  const sanitizedJson = JSON.stringify(sanitizeResult.sanitized);
  const sizeBytes = new TextEncoder().encode(sanitizedJson).length;
  if (sizeBytes > MAX_SHARED_DATA_BYTES) {
    return jsonResponse({ error: "data too large after sanitization" }, 400);
  }

  const userId = data.user.sub;

  // Enforce per-user share limit
  const countRow = await env.DB.prepare(
    "SELECT COUNT(*) as cnt FROM shared_discussions WHERE user_id = ?"
  )
    .bind(userId)
    .first();
  if ((countRow?.cnt || 0) >= MAX_SHARED_PER_USER) {
    return jsonResponse(
      {
        error: "Share limit reached",
        limit: MAX_SHARED_PER_USER,
        message: "古い共有を取り消してから再度お試しください。",
      },
      409
    );
  }

  const shareId = generateShareId();
  await env.DB.prepare(
    "INSERT INTO shared_discussions (id, user_id, topic, data_json) VALUES (?, ?, ?, ?)"
  )
    .bind(shareId, userId, body.topic, sanitizedJson)
    .run();

  return jsonResponse({ id: shareId }, 201);
}
