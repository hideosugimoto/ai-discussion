// /api/share/[id]
//   GET    - PUBLIC. Fetch shared discussion (no auth required)
//   DELETE - Premium owner only. Revoke share.

import { jsonResponse, requirePremium, validateShareId } from "./_lib.js";

export async function onRequestGet(context) {
  const { env, params } = context;
  const id = validateShareId(params.id);
  if (!id) return jsonResponse({ error: "Invalid id" }, 400);

  const row = await env.DB.prepare(
    "SELECT id, topic, data_json, view_count, created_at, expires_at FROM shared_discussions WHERE id = ?"
  )
    .bind(id)
    .first();

  if (!row) return jsonResponse({ error: "Not found" }, 404);

  // Check expiration
  if (row.expires_at) {
    const expiresAt = new Date(row.expires_at).getTime();
    if (!isNaN(expiresAt) && expiresAt < Date.now()) {
      return jsonResponse({ error: "Share has expired" }, 410);
    }
  }

  // Best-effort view count increment (non-blocking)
  context.waitUntil(
    env.DB.prepare("UPDATE shared_discussions SET view_count = view_count + 1 WHERE id = ?")
      .bind(id)
      .run()
      .catch(() => {})
  );

  return jsonResponse({
    id: row.id,
    topic: row.topic,
    dataJson: row.data_json,
    viewCount: row.view_count + 1,
    createdAt: row.created_at,
  });
}

export async function onRequestDelete(context) {
  const { env, data, params } = context;
  const guard = await requirePremium(env, data.user);
  if (guard.error) return guard.error;

  const id = validateShareId(params.id);
  if (!id) return jsonResponse({ error: "Invalid id" }, 400);

  const userId = data.user.sub;

  // Verify ownership BEFORE delete
  const row = await env.DB.prepare(
    "SELECT user_id FROM shared_discussions WHERE id = ?"
  )
    .bind(id)
    .first();
  if (!row) return jsonResponse({ error: "Not found" }, 404);
  if (row.user_id !== userId) return jsonResponse({ error: "Forbidden" }, 403);

  await env.DB.prepare("DELETE FROM shared_discussions WHERE id = ? AND user_id = ?")
    .bind(id, userId)
    .run();

  return jsonResponse({ ok: true });
}
