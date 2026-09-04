#!/usr/bin/env node
// Moves existing discussion bodies from D1 (discussions.data_json) into R2.
//
// Why: a D1 database is capped at 10 GB and Cloudflare states that limit
// cannot be increased. The body column is what would hit it at scale.
//
// Safety properties:
//   - Idempotent. Only rows with r2_key IS NULL are touched, so an interrupted
//     run is resumed by re-running it.
//   - Verify-before-commit. Each body is written to R2 and read back, and the
//     D1 row is only updated once the round-trip matches byte for byte.
//     A crash between the two leaves an orphaned object, never a row pointing
//     at a body that isn't there.
//   - Non-destructive to readers. Code reads r2_key first and falls back to
//     data_json, so migrated and un-migrated rows both work throughout.
//
// Usage:
//   node scripts/migrate-bodies-to-r2.mjs --dry-run   # report only, no writes
//   node scripts/migrate-bodies-to-r2.mjs             # perform the migration
//   node scripts/migrate-bodies-to-r2.mjs --limit 10  # migrate at most N rows

import { execFileSync } from "node:child_process";
import { writeFileSync, readFileSync, rmSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DB = "ai-discussion-db";
const BUCKET = "ai-discussion-data";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const limitIdx = args.indexOf("--limit");
const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : null;

function wrangler(cmdArgs) {
  return execFileSync("npx", ["wrangler", ...cmdArgs], {
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
}

// wrangler prints a banner before the JSON payload; take the last JSON array.
function d1Query(sql) {
  const out = wrangler(["d1", "execute", DB, "--remote", "--json", "--command", sql]);
  const start = out.indexOf("[");
  if (start < 0) throw new Error(`Unexpected d1 output:\n${out.slice(0, 500)}`);
  const parsed = JSON.parse(out.slice(start));
  return parsed[0]?.results ?? [];
}

function sqlString(s) {
  return `'${String(s).replace(/'/g, "''")}'`;
}

function bodyKey(userId, id) {
  return `discussions/${userId}/${id}.json`;
}

async function main() {
  const pending = d1Query(
    "SELECT COUNT(*) AS n, COALESCE(SUM(LENGTH(data_json)), 0) AS bytes FROM discussions WHERE r2_key IS NULL"
  )[0];
  console.log(
    `un-migrated rows: ${pending.n}, total body bytes: ${Number(pending.bytes).toLocaleString()}`
  );

  if (dryRun) {
    console.log("[dry-run] no writes performed.");
    return 0;
  }
  if (Number(pending.n) === 0) {
    console.log("nothing to do.");
    return 0;
  }

  const cap = limit ? Math.min(limit, Number(pending.n)) : Number(pending.n);
  const rows = d1Query(
    `SELECT id, user_id, data_json FROM discussions WHERE r2_key IS NULL LIMIT ${cap}`
  );

  const work = mkdtempSync(join(tmpdir(), "d1-r2-"));
  let migrated = 0;

  try {
    for (const row of rows) {
      const key = bodyKey(row.user_id, row.id);
      const file = join(work, "body.json");
      writeFileSync(file, row.data_json, "utf8");

      wrangler([
        "r2", "object", "put", `${BUCKET}/${key}`,
        "--file", file,
        "--content-type", "application/json; charset=utf-8",
        "--remote",
      ]);

      // Read back before touching D1. Only a byte-identical round-trip is
      // allowed to flip the row over to R2.
      const back = join(work, "verify.json");
      wrangler(["r2", "object", "get", `${BUCKET}/${key}`, "--file", back, "--remote"]);
      if (readFileSync(back, "utf8") !== row.data_json) {
        throw new Error(`verify failed for ${row.id} — D1 left unchanged`);
      }

      d1Query(
        `UPDATE discussions SET data_json = '', r2_key = ${sqlString(key)} WHERE id = ${sqlString(row.id)} AND r2_key IS NULL`
      );

      migrated++;
      console.log(`  [${migrated}/${rows.length}] ${row.id} -> ${key}`);
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }

  const after = d1Query(
    "SELECT COUNT(*) AS n FROM discussions WHERE r2_key IS NULL"
  )[0];
  console.log(`migrated ${migrated} row(s). remaining un-migrated: ${after.n}`);
  return 0;
}

main().then((c) => process.exit(c)).catch((e) => {
  console.error("[migrate] failed:", e.message);
  console.error("Re-running is safe: only rows with r2_key IS NULL are processed.");
  process.exit(1);
});
