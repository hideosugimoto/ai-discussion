import { describe, it, expect } from "vitest";
import { buildPrompt } from "../prompt";

describe("constitution in buildPrompt", () => {
  it("includes constitution when provided", () => {
    const { sys } = buildPrompt("claude", "テスト", "", [], 1, "", "standard", null, "最小労働・最大成果");
    expect(sys).toContain("最小労働・最大成果");
    expect(sys).toContain("意思決定基準");
  });

  it("excludes constitution when empty", () => {
    const { sys } = buildPrompt("claude", "テスト", "", [], 1, "", "standard", null, "");
    expect(sys).not.toContain("意思決定基準");
  });

  it("excludes constitution when null", () => {
    const { sys } = buildPrompt("claude", "テスト", "", [], 1, "", "standard", null, null);
    expect(sys).not.toContain("意思決定基準");
  });

  it("truncates long constitution to 2000 chars", () => {
    const longConst = "x".repeat(3000);
    const { sys } = buildPrompt("claude", "テスト", "", [], 1, "", "standard", null, longConst);
    expect(sys).not.toContain("x".repeat(3000));
    expect(sys).toContain("x".repeat(2000));
  });
});
