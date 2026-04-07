// Shared helpers for /api/discussions/* endpoints
//
// All endpoints under this directory are Premium-only and operate on the
// `discussions` table introduced in schema-v5.

export const MAX_DISCUSSIONS_PER_USER = 300;
export const MAX_DATA_BYTES = 200 * 1024; // 200KB UTF-8 per discussion
export const MAX_TOPIC_LEN = 2000;
export const MAX_TAG_LEN = 30;
export const MAX_TAGS_PER_DISCUSSION = 10;
export const MAX_BULK_ITEMS = 30; // per bulk request (D1 batch statement budget)
export const MAX_FTS_CONTENT_LEN = 50000;

export function computeSizeBytes(str) {
  return new TextEncoder().encode(str).length;
}

export function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function requirePremium(env, user) {
  if (!user) return { error: jsonResponse({ error: "Authentication required" }, 401) };
  const dbUser = await env.DB.prepare("SELECT plan FROM users WHERE id = ?")
    .bind(user.sub)
    .first();
  // Both 'premium' and 'plus' have access to paid features
  if (!dbUser || dbUser.plan === "free" || !dbUser.plan) {
    return { error: jsonResponse({ error: "Premium plan required" }, 403) };
  }
  return { ok: true };
}

// Validate one discussion payload (used by upsert and bulk).
// Returns null on success, or an error string.
export function validatePayload(body) {
  if (!body || typeof body !== "object") return "Invalid body";
  if (typeof body.topic !== "string" || !body.topic.trim()) return "topic required";
  if (body.topic.length > MAX_TOPIC_LEN) return "topic too long";
  if (typeof body.data_json !== "string") return "data_json required";
  if (computeSizeBytes(body.data_json) > MAX_DATA_BYTES) return "data_json too large";

  let parsed;
  try {
    parsed = JSON.parse(body.data_json);
  } catch {
    return "data_json invalid JSON";
  }
  if (typeof parsed !== "object" || parsed === null) return "data_json must be object";
  if (!Array.isArray(parsed.discussion)) return "data_json.discussion must be array";

  if (body.tags !== undefined && body.tags !== null) {
    if (!Array.isArray(body.tags)) return "tags must be array";
    if (body.tags.length > MAX_TAGS_PER_DISCUSSION) return "too many tags";
    for (const t of body.tags) {
      if (typeof t !== "string") return "tag must be string";
      if (t.length > MAX_TAG_LEN) return "tag too long";
    }
  }
  return null;
}

export function normalizeTags(tags) {
  if (!Array.isArray(tags)) return "";
  const seen = new Set();
  for (const t of tags) {
    if (typeof t !== "string") continue;
    // Strip commas (CSV separator), control chars, and surrounding whitespace.
    // Without this, a tag value containing "," would split into multiple
    // tags when later parsed by split(",").
    const norm = t
      .replace(/[,\u0000-\u001f\u007f]/g, "")
      .trim()
      .toLowerCase();
    if (norm.length === 0 || norm.length > MAX_TAG_LEN) continue;
    seen.add(norm);
  }
  return [...seen].join(",");
}

// Extract plain message text for FTS indexing.
// Intentionally excludes personas/profile/constitution to avoid leaking
// sensitive context into the search index.
export function extractPlainContent(dataJsonStr) {
  let parsed;
  try {
    parsed = JSON.parse(dataJsonStr);
  } catch {
    return "";
  }
  if (!parsed || !Array.isArray(parsed.discussion)) return "";
  const parts = [];
  for (const round of parsed.discussion) {
    if (!round || !Array.isArray(round.messages)) continue;
    for (const m of round.messages) {
      if (m && typeof m.text === "string" && m.text) parts.push(m.text);
    }
  }
  return parts.join("\n").slice(0, MAX_FTS_CONTENT_LEN);
}

export function countRounds(dataJsonStr) {
  try {
    const parsed = JSON.parse(dataJsonStr);
    return Array.isArray(parsed?.discussion) ? parsed.discussion.length : 0;
  } catch {
    return 0;
  }
}

// Validate and return a UUID-like id, or null if invalid.
// We don't enforce strict UUIDv4 (clients may use crypto.randomUUID()),
// just shape and length to prevent SQL/path abuse.
export function validateId(id) {
  if (typeof id !== "string") return null;
  if (id.length < 8 || id.length > 64) return null;
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) return null;
  return id;
}

// Insert/update FTS row alongside discussions row. Both operations should
// happen inside the same db.batch() to keep them in sync.
export function ftsUpsertStatements(db, id, userId, topic, dataJsonStr, tagsCsv) {
  const content = extractPlainContent(dataJsonStr);
  return [
    db.prepare("DELETE FROM discussions_fts WHERE discussion_id = ?").bind(id),
    db.prepare(
      "INSERT INTO discussions_fts (topic, content, tags, user_id, discussion_id) VALUES (?, ?, ?, ?, ?)"
    ).bind(topic, content, tagsCsv, userId, id),
  ];
}

export function ftsDeleteStatement(db, id) {
  return db.prepare("DELETE FROM discussions_fts WHERE discussion_id = ?").bind(id);
}
