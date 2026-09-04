// /api/discussions/bulk
//   POST - upsert multiple discussions in one request (for IndexedDB migration)
//
// Request body: { items: [{ topic, data_json, tags?, clientId? }, ...] }
// Response: { created: [{ clientId, id }], skipped: [{ clientId, reason }] }
//
// Each item is validated independently. The whole request is rejected only
// if the user already exceeds limits or the body is malformed.

import {
  jsonResponse,
  requirePremium,
  validatePayload,
  normalizeTags,
  countRounds,
  computeSizeBytes,
  ftsUpsertStatements,
  MAX_DISCUSSIONS_PER_USER,
  MAX_BULK_ITEMS,
} from "./_lib.js";
import { writeBody, MIGRATED_PLACEHOLDER } from "./_lib_store.js";

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

  if (!body || !Array.isArray(body.items)) {
    return jsonResponse({ error: "items must be array" }, 400);
  }
  if (body.items.length === 0) {
    return jsonResponse({ created: [], skipped: [] });
  }
  if (body.items.length > MAX_BULK_ITEMS) {
    return jsonResponse(
      { error: `Too many items (max ${MAX_BULK_ITEMS} per request)` },
      400
    );
  }

  const userId = data.user.sub;

  // Determine remaining capacity
  const countRow = await env.DB.prepare(
    "SELECT COUNT(*) as cnt FROM discussions WHERE user_id = ?"
  )
    .bind(userId)
    .first();
  const currentCount = countRow?.cnt || 0;
  let remaining = MAX_DISCUSSIONS_PER_USER - currentCount;

  const created = [];
  const skipped = [];
  const accepted = [];

  for (const item of body.items) {
    const clientId = item?.clientId;
    if (remaining <= 0) {
      skipped.push({ clientId, reason: "limit_reached" });
      continue;
    }
    const validationError = validatePayload(item);
    if (validationError) {
      skipped.push({ clientId, reason: validationError });
      continue;
    }
    accepted.push({
      clientId,
      item,
      id: crypto.randomUUID(),
      tagsCsv: normalizeTags(item.tags),
      sizeBytes: computeSizeBytes(item.data_json),
      roundCount: countRounds(item.data_json),
    });
    remaining--;
  }

  // All bodies to R2 first, in parallel (capped at MAX_BULK_ITEMS = 30 per
  // request). If any write fails the whole request fails before D1 is touched,
  // so no row can end up pointing at a body that isn't there. Objects already
  // written are orphaned but harmless — their keys are deterministic, so a
  // retry overwrites them.
  const r2Keys = await Promise.all(
    accepted.map((a) => writeBody(env.DISCUSSION_STORE, userId, a.id, a.item.data_json)),
  );

  const stmts = [];
  accepted.forEach((a, i) => {
    stmts.push(
      env.DB.prepare(
        "INSERT INTO discussions (id, user_id, topic, data_json, r2_key, tags, round_count, size_bytes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
      ).bind(a.id, userId, a.item.topic, MIGRATED_PLACEHOLDER, r2Keys[i], a.tagsCsv, a.roundCount, a.sizeBytes)
    );
    stmts.push(...ftsUpsertStatements(env.DB, a.id, userId, a.item.topic, a.item.data_json, a.tagsCsv));
    created.push({ clientId: a.clientId, id: a.id });
  });

  if (stmts.length > 0) {
    await env.DB.batch(stmts);
  }

  return jsonResponse({ created, skipped });
}
