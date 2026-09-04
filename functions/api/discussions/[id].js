// /api/discussions/[id]
//   GET    - fetch a single discussion
//   PUT    - upsert (create-with-id or update existing)
//   DELETE - delete

import {
  jsonResponse,
  requirePremium,
  validatePayload,
  normalizeTags,
  countRounds,
  computeSizeBytes,
  validateId,
  ftsUpsertStatements,
  ftsDeleteStatement,
  MAX_DISCUSSIONS_PER_USER,
} from "./_lib.js";
import {
  readBody,
  writeBody,
  deleteBody,
  MIGRATED_PLACEHOLDER,
} from "./_lib_store.js";

// Full row, including whatever the body column still holds. Only GET needs
// this — see loadOwnedMeta for the paths that just need to know the row exists.
async function loadOwned(env, userId, id) {
  return await env.DB.prepare(
    "SELECT id, user_id, topic, data_json, r2_key, tags, round_count, size_bytes, created_at, updated_at FROM discussions WHERE id = ? AND user_id = ?"
  )
    .bind(id, userId)
    .first();
}

// Existence + storage location, without dragging the body along. PUT and
// DELETE only need to know whether the row exists and which R2 object it owns,
// and on un-migrated rows data_json is up to 200KB of payload to read for
// nothing.
async function loadOwnedMeta(env, userId, id) {
  return await env.DB.prepare(
    "SELECT id, r2_key FROM discussions WHERE id = ? AND user_id = ?"
  )
    .bind(id, userId)
    .first();
}

export async function onRequestGet(context) {
  const { env, data, params } = context;
  const guard = await requirePremium(env, data.user);
  if (guard.error) return guard.error;

  const id = validateId(params.id);
  if (!id) return jsonResponse({ error: "Invalid id" }, 400);

  const row = await loadOwned(env, data.user.sub, id);
  if (!row) return jsonResponse({ error: "Not found" }, 404);

  // Reads from R2 when the row has been migrated, from data_json when it
  // hasn't. A null here means the row exists but its body doesn't — treat it
  // as missing rather than returning a discussion with no content.
  const dataJson = await readBody(env.DISCUSSION_STORE, row);
  if (dataJson === null) return jsonResponse({ error: "Not found" }, 404);

  return jsonResponse({
    id: row.id,
    topic: row.topic,
    dataJson,
    tags: row.tags ? row.tags.split(",").filter(Boolean) : [],
    roundCount: row.round_count,
    sizeBytes: row.size_bytes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export async function onRequestPut(context) {
  const { env, data, params, request } = context;
  const guard = await requirePremium(env, data.user);
  if (guard.error) return guard.error;

  const id = validateId(params.id);
  if (!id) return jsonResponse({ error: "Invalid id" }, 400);

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }

  const validationError = validatePayload(body);
  if (validationError) return jsonResponse({ error: validationError }, 400);

  const userId = data.user.sub;
  const existing = await loadOwnedMeta(env, userId, id);

  // If creating new (id specified by client), enforce per-user limit
  if (!existing) {
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
  }

  const tagsCsv = normalizeTags(body.tags);
  const sizeBytes = computeSizeBytes(body.data_json);
  const roundCount = countRounds(body.data_json);

  // Body to R2 first: an object with no row costs a fraction of a cent and is
  // overwritten by the next write to this id, whereas a row pointing at an
  // object that was never written is a discussion the user cannot open.
  // A throw here aborts before any D1 change, leaving the row as it was.
  const r2Key = await writeBody(env.DISCUSSION_STORE, userId, id, body.data_json);

  // FTS still indexes the real text (from the request), so search is unchanged.
  const stmts = existing
    ? [
        env.DB.prepare(
          "UPDATE discussions SET topic = ?, data_json = ?, r2_key = ?, tags = ?, round_count = ?, size_bytes = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?"
        ).bind(body.topic, MIGRATED_PLACEHOLDER, r2Key, tagsCsv, roundCount, sizeBytes, id, userId),
        ...ftsUpsertStatements(env.DB, id, userId, body.topic, body.data_json, tagsCsv),
      ]
    : [
        env.DB.prepare(
          "INSERT INTO discussions (id, user_id, topic, data_json, r2_key, tags, round_count, size_bytes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
        ).bind(id, userId, body.topic, MIGRATED_PLACEHOLDER, r2Key, tagsCsv, roundCount, sizeBytes),
        ...ftsUpsertStatements(env.DB, id, userId, body.topic, body.data_json, tagsCsv),
      ];
  await env.DB.batch(stmts);

  return jsonResponse({ id, created: !existing });
}

export async function onRequestDelete(context) {
  const { env, data, params } = context;
  const guard = await requirePremium(env, data.user);
  if (guard.error) return guard.error;

  const id = validateId(params.id);
  if (!id) return jsonResponse({ error: "Invalid id" }, 400);

  const userId = data.user.sub;
  const existing = await loadOwnedMeta(env, userId, id);
  if (!existing) return jsonResponse({ error: "Not found" }, 404);

  await env.DB.batch([
    env.DB.prepare("DELETE FROM discussions WHERE id = ? AND user_id = ?").bind(id, userId),
    ftsDeleteStatement(env.DB, id),
  ]);

  // After D1, and best-effort: the row is what decides whether the discussion
  // exists, so a failed object delete must not fail the user's request.
  await deleteBody(env.DISCUSSION_STORE, existing.r2_key);

  return jsonResponse({ ok: true });
}
