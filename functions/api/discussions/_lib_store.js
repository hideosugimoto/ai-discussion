// Where a discussion body physically lives.
//
// D1 caps a database at 10 GB and that limit cannot be raised, so the body
// (up to 200KB per discussion) is kept in R2 and D1 holds only metadata plus
// the FTS index. Listing and search never call in here — they read D1 columns
// only — so R2 is touched just when a single discussion is opened or written.
//
// Backwards compatibility is the point of this module: rows written before the
// migration have r2_key = NULL and their body still in data_json. Every read
// goes through readBody(), so both layouts work at once and the migration can
// run gradually.

// One object per discussion. Scoped by user so a stray key can never be read
// across accounts, and so a user's objects can be listed/removed as a unit.
export function bodyKey(userId, discussionId) {
  return `discussions/${userId}/${discussionId}.json`;
}

// The body for a discussions row, wherever it lives.
// `row` needs r2_key and data_json. Returns the JSON string, or null when the
// body is missing entirely (an R2 object that lost its row, say) so callers can
// surface a 404 rather than a broken payload.
export async function readBody(bucket, row) {
  if (!row) return null;
  if (!row.r2_key) {
    // Pre-migration row: body is still in D1.
    return typeof row.data_json === "string" && row.data_json ? row.data_json : null;
  }
  if (!bucket) throw new Error("DISCUSSION_STORE binding missing");
  const obj = await bucket.get(row.r2_key);
  if (!obj) return null;
  return await obj.text();
}

// Store a body and return the key to record in D1.
//
// Deliberately written BEFORE the D1 statement that references it: an orphaned
// R2 object costs a fraction of a cent and is cleaned up by a later overwrite,
// whereas a D1 row pointing at an object that was never written is a broken
// discussion the user cannot open.
export async function writeBody(bucket, userId, discussionId, dataJson) {
  if (!bucket) throw new Error("DISCUSSION_STORE binding missing");
  const key = bodyKey(userId, discussionId);
  await bucket.put(key, dataJson, {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
  });
  return key;
}

// Remove a body. Best-effort: the D1 row is the source of truth for whether a
// discussion exists, so a failed delete here must not fail the user's request.
// It leaves at most one stale object, which the next write to the same id
// overwrites (the key is deterministic).
export async function deleteBody(bucket, key) {
  if (!bucket || !key) return;
  try {
    await bucket.delete(key);
  } catch {
    // Ignore: orphaned object, not a user-visible failure.
  }
}

// What to store in the NOT NULL data_json column once the body is in R2.
// Kept as a named constant so the "is this row migrated?" convention is stated
// in exactly one place.
export const MIGRATED_PLACEHOLDER = "";
