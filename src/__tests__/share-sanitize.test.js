// Security-critical regression test for share data sanitization.
// If any of these tests start failing, STOP — it likely means private user
// data (personas/profile/constitution) could be leaked through public links.

import { describe, it, expect } from "vitest";
import {
  sanitizeForSharing,
  generateShareId,
  validateShareId,
} from "../../functions/api/share/_lib.js";

describe("sanitizeForSharing", () => {
  function makeRaw(overrides = {}) {
    return JSON.stringify({
      discussion: [
        {
          messages: [
            { modelId: "claude", text: "Hello", error: null },
            { modelId: "chatgpt", text: "Hi", error: null },
          ],
          isConclusion: false,
        },
      ],
      summaries: [
        { agreements: [{ point: "x" }], disagreements: [], unresolved: [], positionChanges: [] },
      ],
      mode: "best",
      discussionMode: "standard",
      ...overrides,
    });
  }

  it("strips top-level personas / profile / constitution", () => {
    const raw = makeRaw({
      personas: { claude: "CEO", chatgpt: "CFO", gemini: "CMO" },
      profile: "I am a senior engineer at Acme Corp",
      constitution: "Always prioritize long-term value",
    });
    const result = sanitizeForSharing(raw);
    expect(result.ok).toBe(true);
    const out = result.sanitized;
    expect(out).not.toHaveProperty("personas");
    expect(out).not.toHaveProperty("profile");
    expect(out).not.toHaveProperty("constitution");
    // Stringified output must not contain any of the secrets
    const json = JSON.stringify(out);
    expect(json).not.toContain("CEO");
    expect(json).not.toContain("Acme Corp");
    expect(json).not.toContain("long-term value");
  });

  it("strips round.userIntervention (司会者として書いた介入文)", () => {
    const raw = JSON.stringify({
      discussion: [
        {
          messages: [{ modelId: "claude", text: "ok", error: null }],
          userIntervention: "PRIVATE_NOTE_TO_SELF",
          isConclusion: false,
        },
      ],
      summaries: [],
    });
    const result = sanitizeForSharing(raw);
    expect(result.ok).toBe(true);
    const json = JSON.stringify(result.sanitized);
    expect(json).not.toContain("PRIVATE_NOTE_TO_SELF");
    expect(result.sanitized.discussion[0]).not.toHaveProperty("userIntervention");
  });

  it("only retains modelId / text / error on each message (drops extras)", () => {
    const raw = JSON.stringify({
      discussion: [
        {
          messages: [
            {
              modelId: "claude",
              text: "public text",
              error: null,
              persona: "SECRET_ROLE",
              loading: true,
              _internal: "hidden",
            },
          ],
        },
      ],
      summaries: [],
    });
    const result = sanitizeForSharing(raw);
    expect(result.ok).toBe(true);
    const msg = result.sanitized.discussion[0].messages[0];
    expect(Object.keys(msg).sort()).toEqual(["error", "modelId", "text"]);
    const json = JSON.stringify(result.sanitized);
    expect(json).not.toContain("SECRET_ROLE");
    expect(json).not.toContain("hidden");
    expect(json).not.toContain("loading");
  });

  it("preserves isConclusion flag on rounds", () => {
    const raw = JSON.stringify({
      discussion: [
        { messages: [{ modelId: "claude", text: "x" }], isConclusion: true },
        { messages: [{ modelId: "claude", text: "y" }], isConclusion: false },
      ],
      summaries: [],
    });
    const result = sanitizeForSharing(raw);
    expect(result.sanitized.discussion[0].isConclusion).toBe(true);
    expect(result.sanitized.discussion[1].isConclusion).toBe(false);
  });

  it("filters null / non-object messages", () => {
    const raw = JSON.stringify({
      discussion: [
        {
          messages: [
            null,
            "not an object",
            { modelId: "claude", text: "ok" },
            42,
          ],
        },
      ],
      summaries: [],
    });
    const result = sanitizeForSharing(raw);
    expect(result.sanitized.discussion[0].messages).toHaveLength(1);
    expect(result.sanitized.discussion[0].messages[0].modelId).toBe("claude");
  });

  it("returns ok=false for invalid JSON", () => {
    const result = sanitizeForSharing("not-json{");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("Invalid data_json");
  });

  it("returns ok=false when discussion is missing or not an array", () => {
    const result = sanitizeForSharing(JSON.stringify({ summaries: [] }));
    expect(result.ok).toBe(false);
  });

  it("preserves valid summary structure but normalizes shape", () => {
    const raw = JSON.stringify({
      discussion: [],
      summaries: [
        {
          agreements: [{ point: "a" }],
          disagreements: [{ point: "b" }],
          unresolved: [{ point: "c" }],
          positionChanges: [{ ai: "claude", description: "d" }],
          extraField: "should-be-dropped",
        },
        { error: true },
      ],
    });
    const result = sanitizeForSharing(raw);
    expect(result.sanitized.summaries[0]).toEqual({
      agreements: [{ point: "a" }],
      disagreements: [{ point: "b" }],
      unresolved: [{ point: "c" }],
      positionChanges: [{ ai: "claude", description: "d" }],
    });
    // error summaries are passed through unchanged
    expect(result.sanitized.summaries[1]).toEqual({ error: true });
  });

  it("only outputs the documented top-level keys (defense in depth)", () => {
    const raw = makeRaw({
      personas: { claude: "X" },
      profile: "Y",
      constitution: "Z",
      _private: "leak",
      apiKey: "sk-123",
    });
    const result = sanitizeForSharing(raw);
    expect(Object.keys(result.sanitized).sort()).toEqual([
      "discussion",
      "discussionMode",
      "mode",
      "summaries",
    ]);
  });
});

describe("generateShareId", () => {
  it("returns a 22-character url-safe token", () => {
    for (let i = 0; i < 50; i++) {
      const id = generateShareId();
      expect(id).toHaveLength(22);
      expect(id).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  it("returns unique tokens (no collisions in 1000 samples)", () => {
    const seen = new Set();
    for (let i = 0; i < 1000; i++) {
      seen.add(generateShareId());
    }
    expect(seen.size).toBe(1000);
  });
});

describe("validateShareId", () => {
  it("accepts a token from generateShareId", () => {
    const id = generateShareId();
    expect(validateShareId(id)).toBe(id);
  });

  it("rejects non-string input", () => {
    expect(validateShareId(null)).toBeNull();
    expect(validateShareId(undefined)).toBeNull();
    expect(validateShareId(123)).toBeNull();
    expect(validateShareId({})).toBeNull();
  });

  it("rejects path traversal characters", () => {
    expect(validateShareId("../auth/google")).toBeNull();
    expect(validateShareId("abc/def")).toBeNull();
    expect(validateShareId("abc def")).toBeNull();
    expect(validateShareId("abc.def")).toBeNull();
  });

  it("rejects too short or too long", () => {
    expect(validateShareId("short")).toBeNull();
    expect(validateShareId("a".repeat(100))).toBeNull();
  });
});
