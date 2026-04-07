import { describe, it, expect } from "vitest";
import { buildPrompt } from "../prompt";

describe("buildPrompt", () => {
  it("round 1 includes topic and 300 char instruction", () => {
    const { sys, user } = buildPrompt("claude", "AIの未来", "", [], 1, "");
    expect(sys).toContain("Claude");
    expect(sys).toContain("250〜350字");
    expect(user).toContain("AIの未来");
  });

  it("round 2+ includes 200 char instruction", () => {
    const history = [{ messages: [
      { modelId: "claude", text: "Claudeの意見" },
      { modelId: "chatgpt", text: "ChatGPTの意見" },
      { modelId: "gemini", text: "Geminiの意見" },
    ]}];
    const { sys, user } = buildPrompt("chatgpt", "AIの未来", "", history, 2, "");
    expect(sys).toContain("200〜300字");
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

  it("debate mode includes 反論 instruction", () => {
    const { sys } = buildPrompt("claude", "テスト", "", [], 1, "", "debate");
    expect(sys).toContain("立場を明確");
  });

  it("brainstorm mode includes アイデア instruction", () => {
    const { sys } = buildPrompt("claude", "テスト", "", [], 1, "", "brainstorm");
    expect(sys).toContain("自由なアイデア");
  });

  it("factcheck mode includes 根拠 instruction", () => {
    const { sys } = buildPrompt("claude", "テスト", "", [], 1, "", "factcheck");
    expect(sys).toContain("事実・データ・根拠");
  });

  it("conclusion mode includes 結論 instruction", () => {
    const { sys } = buildPrompt("claude", "テスト", "", [], 1, "", "conclusion");
    expect(sys).toContain("結論");
    expect(sys).toContain("論点を整理");
  });

  it("conclusion mode round 2 includes 収束 instruction", () => {
    const history = [{ messages: [
      { modelId: "claude", text: "Claudeの結論" },
      { modelId: "chatgpt", text: "ChatGPTの結論" },
      { modelId: "gemini", text: "Geminiの結論" },
    ]}];
    const { sys } = buildPrompt("claude", "テスト", "", history, 2, "", "conclusion");
    expect(sys).toContain("合意できる点");
    expect(sys).toContain("収束");
  });

  it("unknown discussion mode falls back to standard", () => {
    const { sys } = buildPrompt("claude", "テスト", "", [], 1, "", "invalid");
    expect(sys).toContain("250〜350字");
  });

  it("names other models correctly for each AI", () => {
    const { sys: claudeSys } = buildPrompt("claude", "テスト", "", [], 1, "");
    expect(claudeSys).toContain("ChatGPTとGemini");

    const { sys: chatgptSys } = buildPrompt("chatgpt", "テスト", "", [], 1, "");
    expect(chatgptSys).toContain("ClaudeとGemini");
  });
});
