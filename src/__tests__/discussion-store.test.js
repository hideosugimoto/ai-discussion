// Discussion bodies moved from D1 (10 GB hard cap) to R2. The risk in that
// move is a row whose body can't be found, so these tests pin the dual-read
// contract: rows written before the migration still resolve from data_json,
// migrated rows resolve from R2, and a missing body reports as missing rather
// than as an empty discussion.
import { describe, it, expect, vi } from "vitest";
import {
  bodyKey,
  readBody,
  writeBody,
  deleteBody,
  MIGRATED_PLACEHOLDER,
} from "../../functions/api/discussions/_lib_store.js";

function fakeBucket(objects = {}) {
  return {
    store: { ...objects },
    get: vi.fn(async function (key) {
      const v = this.store[key];
      return v === undefined ? null : { text: async () => v };
    }),
    put: vi.fn(async function (key, value) {
      this.store[key] = value;
    }),
    delete: vi.fn(async function (key) {
      delete this.store[key];
    }),
  };
}

describe("bodyKey", () => {
  it("scopes the object to the owning user", () => {
    expect(bodyKey("user-1", "disc-1")).toBe("discussions/user-1/disc-1.json");
  });

  it("gives different users different keys for the same discussion id", () => {
    expect(bodyKey("user-1", "d")).not.toBe(bodyKey("user-2", "d"));
  });

  it("is deterministic, so a retry overwrites instead of orphaning", () => {
    expect(bodyKey("u", "d")).toBe(bodyKey("u", "d"));
  });
});

describe("readBody", () => {
  const BODY = JSON.stringify({ discussion: [{ messages: [{ text: "hi" }] }] });

  it("reads pre-migration rows from data_json", async () => {
    const bucket = fakeBucket();
    const row = { r2_key: null, data_json: BODY };
    expect(await readBody(bucket, row)).toBe(BODY);
    // Must not pay for an R2 lookup on rows that never moved.
    expect(bucket.get).not.toHaveBeenCalled();
  });

  it("reads migrated rows from R2", async () => {
    const key = bodyKey("u1", "d1");
    const bucket = fakeBucket({ [key]: BODY });
    const row = { r2_key: key, data_json: MIGRATED_PLACEHOLDER };
    expect(await readBody(bucket, row)).toBe(BODY);
    expect(bucket.get).toHaveBeenCalledWith(key);
  });

  it("returns null when a migrated row's object is gone", async () => {
    // The caller turns this into a 404 rather than serving a contentless
    // discussion.
    const bucket = fakeBucket();
    const row = { r2_key: "discussions/u1/missing.json", data_json: MIGRATED_PLACEHOLDER };
    expect(await readBody(bucket, row)).toBeNull();
  });

  it("returns null for an empty pre-migration body", async () => {
    expect(await readBody(fakeBucket(), { r2_key: null, data_json: "" })).toBeNull();
  });

  it("returns null for a missing row", async () => {
    expect(await readBody(fakeBucket(), null)).toBeNull();
  });

  it("throws if the binding is missing on a migrated row", async () => {
    // Silently returning null would look like "discussion deleted" to the user;
    // a misconfigured deploy should surface as an error instead.
    await expect(readBody(null, { r2_key: "k", data_json: "" })).rejects.toThrow(/DISCUSSION_STORE/);
  });
});

describe("writeBody", () => {
  it("stores the body and returns the key to record in D1", async () => {
    const bucket = fakeBucket();
    const key = await writeBody(bucket, "u1", "d1", "{}");
    expect(key).toBe(bodyKey("u1", "d1"));
    expect(bucket.store[key]).toBe("{}");
  });

  it("round-trips through readBody", async () => {
    const bucket = fakeBucket();
    const body = JSON.stringify({ discussion: [], topic: "テーマ" });
    const key = await writeBody(bucket, "u1", "d1", body);
    expect(await readBody(bucket, { r2_key: key, data_json: MIGRATED_PLACEHOLDER })).toBe(body);
  });

  it("throws if the binding is missing, before any D1 write happens", async () => {
    await expect(writeBody(null, "u1", "d1", "{}")).rejects.toThrow(/DISCUSSION_STORE/);
  });
});

describe("deleteBody", () => {
  it("removes the object", async () => {
    const key = bodyKey("u1", "d1");
    const bucket = fakeBucket({ [key]: "{}" });
    await deleteBody(bucket, key);
    expect(bucket.store[key]).toBeUndefined();
  });

  it("is a no-op for pre-migration rows (no key)", async () => {
    const bucket = fakeBucket();
    await deleteBody(bucket, null);
    expect(bucket.delete).not.toHaveBeenCalled();
  });

  it("swallows failures so a delete request still succeeds", async () => {
    // D1 is the source of truth for existence; a stale object must not turn
    // the user's delete into an error.
    const bucket = fakeBucket();
    bucket.delete = vi.fn(async () => { throw new Error("R2 down"); });
    await expect(deleteBody(bucket, "k")).resolves.toBeUndefined();
  });
});

describe("MIGRATED_PLACEHOLDER", () => {
  it("is falsy so readBody treats it as 'not here' when r2_key is absent", () => {
    // data_json is NOT NULL, so migrated rows store this instead. If it were
    // ever truthy, a row that lost its r2_key would serve the placeholder as
    // if it were the discussion.
    expect(MIGRATED_PLACEHOLDER).toBe("");
    expect(Boolean(MIGRATED_PLACEHOLDER)).toBe(false);
  });
});
