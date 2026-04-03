import { describe, it, expect } from "vitest";
import { buildPrompt } from "../prompt";

describe("buildPrompt", () => {
  it("round 1 includes topic and 300 char instruction", () => {
    const { sys, user } = buildPrompt("claude", "AIの未来", "", [], 1, "");
    expect(sys).toContain("Claude");
    expect(sys).toContain("300字以内");
    expect(user).toContain("AIの未来");
  });

  it("round 2+ includes 200 char instruction", () => {
    const history = [{ messages: [
      { modelId: "claude", text: "Claudeの意見" },
      { modelId: "chatgpt", text: "ChatGPTの意見" },
      { modelId: "gemini", text: "Geminiの意見" },
    ]}];
    const { sys, user } = buildPrompt("chatgpt", "AIの未来", "", history, 2, "");
    expect(sys).toContain("200字以内");
    expect(user).toContain("これまでの議論");
  });

  it("includes profile when provided", () => {
    const { sys } = buildPrompt("gemini", "テスト", "エンジニア、30代", [], 1, "");
    expect(sys).toContain("エンジニア、30代");
    expect(sys).toContain("質問者のプロフィール");
  });

  it("excludes profile when empty", () => {
    const { sys } = buildPrompt("gemini", "テスト", "", [], 1, "");
    expect(sys).not.toContain("質問者のプロフィール");
  });

  it("includes user intervention", () => {
    const { user } = buildPrompt("claude", "テスト", "", [], 2, "もっと具体的に");
    expect(user).toContain("もっと具体的に");
    expect(user).toContain("司会者");
  });

  it("truncates long topic to 2000 chars", () => {
    const longTopic = "あ".repeat(3000);
    const { user } = buildPrompt("claude", longTopic, "", [], 1, "");
    expect(user).not.toContain("あ".repeat(3000));
  });

  it("truncates long profile to 5000 chars", () => {
    const longProfile = "x".repeat(6000);
    const { sys } = buildPrompt("claude", "テスト", longProfile, [], 1, "");
    expect(sys).not.toContain("x".repeat(6000));
    expect(sys).toContain("x".repeat(5000));
  });

  it("throws for unknown model", () => {
    expect(() => buildPrompt("unknown", "テスト", "", [], 1, "")).toThrow("Unknown model");
  });

  it("names other models correctly for each AI", () => {
    const { sys: claudeSys } = buildPrompt("claude", "テスト", "", [], 1, "");
    expect(claudeSys).toContain("ChatGPTとGemini");

    const { sys: chatgptSys } = buildPrompt("chatgpt", "テスト", "", [], 1, "");
    expect(chatgptSys).toContain("ClaudeとGemini");
  });
});
