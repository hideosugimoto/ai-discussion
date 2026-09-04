// llm_request_log grows by one row per AI call and nothing reads it to serve a
// request, so it is pruned on a retention window. These tests pin the pieces
// that would silently misbehave: the sampling gate, the bounded delete, and
// the guarantee that a failed prune never surfaces to the user.
import { describe, it, expect, vi } from "vitest";
import {
  shouldPrune,
  pruneRequestLog,
  maybePruneRequestLog,
  LOG_RETENTION_DAYS,
  PRUNE_PROBABILITY,
  PRUNE_BATCH,
} from "../../functions/api/_lib_retention.js";

function fakeDb() {
  const calls = [];
  return {
    calls,
    prepare(sql) {
      const stmt = {
        sql,
        bound: null,
        bind(...args) { stmt.bound = args; return stmt; },
        run: vi.fn(async () => { calls.push({ sql, bound: stmt.bound }); return { success: true }; }),
      };
      return stmt;
    },
  };
}

describe("shouldPrune", () => {
  it("fires below the probability and not at or above it", () => {
    expect(shouldPrune(0)).toBe(true);
    expect(shouldPrune(PRUNE_PROBABILITY - 0.0001)).toBe(true);
    expect(shouldPrune(PRUNE_PROBABILITY)).toBe(false);
    expect(shouldPrune(0.99)).toBe(false);
  });

  it("keeps the sampling rare but reachable", () => {
    // Rare enough not to add work to most requests, frequent enough that even
    // light traffic prunes regularly.
    expect(PRUNE_PROBABILITY).toBeGreaterThan(0);
    expect(PRUNE_PROBABILITY).toBeLessThanOrEqual(0.05);
  });
});

describe("pruneRequestLog", () => {
  it("deletes only rows past the retention window, in a bounded batch", async () => {
    const db = fakeDb();
    await pruneRequestLog(db);
    expect(db.calls).toHaveLength(1);
    const { sql, bound } = db.calls[0];
    expect(sql).toContain("DELETE FROM llm_request_log");
    expect(sql).toContain("created_at < datetime('now', ?)");
    expect(sql).toContain("LIMIT ?");
    expect(bound).toEqual([`-${LOG_RETENTION_DAYS} days`, PRUNE_BATCH]);
  });

  it("never deletes without an age filter", () => {
    // A prune that dropped the WHERE would wipe all analytics history.
    const db = fakeDb();
    pruneRequestLog(db);
    expect(db.calls[0].sql).toMatch(/WHERE\s+created_at\s*</);
  });

  it("touches only llm_request_log", () => {
    const db = fakeDb();
    pruneRequestLog(db);
    const sql = db.calls[0].sql;
    for (const table of ["discussions", "users", "usage_monthly", "usage_daily", "user_credits"]) {
      expect(sql).not.toContain(table);
    }
  });

  it("honours an explicit retention window and batch size", async () => {
    const db = fakeDb();
    await pruneRequestLog(db, 30, 10);
    expect(db.calls[0].bound).toEqual(["-30 days", 10]);
  });
});

describe("maybePruneRequestLog", () => {
  it("schedules the work on waitUntil rather than awaiting it", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const waitUntil = vi.fn();
    const db = fakeDb();
    maybePruneRequestLog({ waitUntil }, { DB: db });
    expect(waitUntil).toHaveBeenCalledTimes(1);
    vi.restoreAllMocks();
  });

  it("does nothing when the sample misses", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const waitUntil = vi.fn();
    const db = fakeDb();
    maybePruneRequestLog({ waitUntil }, { DB: db });
    expect(waitUntil).not.toHaveBeenCalled();
    expect(db.calls).toHaveLength(0);
    vi.restoreAllMocks();
  });

  it("swallows a failing prune so the request still succeeds", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const scheduled = [];
    const failing = {
      prepare: () => ({
        bind: () => ({ run: async () => { throw new Error("D1 down"); } }),
      }),
    };
    maybePruneRequestLog({ waitUntil: (p) => scheduled.push(p) }, { DB: failing });
    await expect(Promise.all(scheduled)).resolves.toBeDefined();
    expect(errSpy).toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it("does not throw when the runtime provides no waitUntil", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    expect(() => maybePruneRequestLog({}, { DB: fakeDb() })).not.toThrow();
    vi.restoreAllMocks();
  });
});
