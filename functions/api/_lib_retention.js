// Retention for llm_request_log.
//
// The log is analytics-only — nothing reads it to serve a user request — but
// it grows by one row per AI call, so it is the fastest-growing table in the
// database. At 77 discussions it already held 1,047 rows (~13x the discussion
// count), and a D1 database is capped at 10 GB with no way to raise the limit.
//
// Rather than add a cron Worker (Pages Functions have no scheduled handler)
// this prunes opportunistically: a small fraction of /api/usage requests kick
// off a bounded delete via waitUntil, so it never blocks a response and needs
// no extra infrastructure or credentials.

// How long analytics history is kept.
export const LOG_RETENTION_DAYS = 90;

// Chance that any given eligible request triggers a prune. Low enough that the
// work is rare, high enough that even light traffic reaches it regularly:
// ~1 prune per 50 requests.
export const PRUNE_PROBABILITY = 0.02;

// Rows removed per prune. Bounded so a single statement can't run long against
// D1's 30s query ceiling, and so the deletion is spread over many requests.
export const PRUNE_BATCH = 500;

// Exported for tests — keeps the randomness injectable.
export function shouldPrune(random = Math.random()) {
  return random < PRUNE_PROBABILITY;
}

// Delete the oldest rows past the retention window.
//
// The subquery + LIMIT keeps each run bounded; idx_log_created (schema-v4)
// makes the age filter an index range rather than a table scan.
export function pruneRequestLog(db, retentionDays = LOG_RETENTION_DAYS, batch = PRUNE_BATCH) {
  return db
    .prepare(
      `DELETE FROM llm_request_log WHERE id IN (
         SELECT id FROM llm_request_log
         WHERE created_at < datetime('now', ?)
         ORDER BY created_at
         LIMIT ?
       )`
    )
    .bind(`-${retentionDays} days`, batch)
    .run();
}

// Fire-and-forget prune. Never throws into the caller and never delays the
// response: retention is housekeeping, and failing it must not fail a user's
// request.
export function maybePruneRequestLog(context, env) {
  if (!shouldPrune()) return;
  const work = pruneRequestLog(env.DB).catch((e) => {
    console.error("[retention] prune failed:", e?.message || e);
  });
  if (typeof context.waitUntil === "function") context.waitUntil(work);
}
