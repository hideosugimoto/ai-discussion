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

  it("conclusion mode round 1 acts as neutral recorder", () => {
    const { sys } = buildPrompt("claude", "テスト", "", [], 1, "", "conclusion");
    expect(sys).toContain("中立的な記録者");
    expect(sys).toContain("論点");
    expect(sys).toContain("暫定結論");
  });

  it("conclusion mode round 2 synthesizes 3 AIs into single conclusion", () => {
    const history = [{ messages: [
      { modelId: "claude", text: "Claudeの意見" },
      { modelId: "chatgpt", text: "ChatGPTの意見" },
      { modelId: "gemini", text: "Geminiの意見" },
    ]}];
    const { sys } = buildPrompt("claude", "テスト", "", history, 2, "", "conclusion");
    expect(sys).toContain("中立的な記録者");
    expect(sys).toContain("合意できる点");
    expect(sys).toContain("意見が分かれる点");
    expect(sys).toContain("最終結論");
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

  // ── contextDiscussions (Phase 1) ──────────────────────────
  describe("contextDiscussions injection", () => {
    const goodSummary = {
      agreements: [{ point: "AIは人間を補助する" }, { point: "倫理が重要" }],
      disagreements: [{ point: "雇用への影響" }],
      unresolved: [{ point: "規制の主体" }],
    };

    it("injects past discussion summary into system prompt", () => {
      const ctx = [{ id: "1", topic: "前回のAI議論", summaries: [goodSummary] }];
      const { sys } = buildPrompt("claude", "今回の議題", "", [], 1, "", "standard", null, "", ctx);
      expect(sys).toContain("質問者の過去の関連議論");
      expect(sys).toContain("前回のAI議論");
      expect(sys).toContain("AIは人間を補助する");
      expect(sys).toContain("雇用への影響");
      expect(sys).toContain("規制の主体");
    });

    it("excludes context section when contextDiscussions is empty or undefined", () => {
      const { sys: a } = buildPrompt("claude", "テスト", "", [], 1, "");
      const { sys: b } = buildPrompt("claude", "テスト", "", [], 1, "", "standard", null, "", []);
      const { sys: c } = buildPrompt("claude", "テスト", "", [], 1, "", "standard", null, "", null);
      expect(a).not.toContain("質問者の過去の関連議論");
      expect(b).not.toContain("質問者の過去の関連議論");
      expect(c).not.toContain("質問者の過去の関連議論");
    });

    it("limits context to maximum 3 discussions", () => {
      const ctx = Array.from({ length: 5 }, (_, i) => ({
        id: String(i),
        topic: `TOPIC_ALPHA_${i}`,
        summaries: [goodSummary],
      }));
      const { sys } = buildPrompt("claude", "テスト", "", [], 1, "", "standard", null, "", ctx);
      expect(sys).toContain("TOPIC_ALPHA_0");
      expect(sys).toContain("TOPIC_ALPHA_1");
      expect(sys).toContain("TOPIC_ALPHA_2");
      expect(sys).not.toContain("TOPIC_ALPHA_3");
      expect(sys).not.toContain("TOPIC_ALPHA_4");
    });

    it("uses the latest non-error summary when multiple rounds exist", () => {
      const ctx = [{
        id: "1",
        topic: "T",
        summaries: [
          { agreements: [{ point: "古い合意" }], disagreements: [], unresolved: [] },
          { error: true },
          { agreements: [{ point: "新しい合意" }], disagreements: [], unresolved: [] },
        ],
      }];
      const { sys } = buildPrompt("claude", "テスト", "", [], 1, "", "standard", null, "", ctx);
      expect(sys).toContain("新しい合意");
      expect(sys).not.toContain("古い合意");
    });

    it("falls back to placeholder when no usable summary exists", () => {
      const ctx = [{ id: "1", topic: "要約なし議論", summaries: [{ error: true }] }];
      const { sys } = buildPrompt("claude", "テスト", "", [], 1, "", "standard", null, "", ctx);
      expect(sys).toContain("要約なし議論");
      expect(sys).toContain("要約なし");
    });

    it("truncates very long topic in context to prevent prompt bloat", () => {
      const longTopic = "あ".repeat(200);
      const ctx = [{ id: "1", topic: longTopic, summaries: [goodSummary] }];
      const { sys } = buildPrompt("claude", "テスト", "", [], 1, "", "standard", null, "", ctx);
      expect(sys).not.toContain("あ".repeat(200));
      expect(sys).toContain("…"); // truncation marker
    });

    it("limits each summary section to 3 items in context", () => {
      const ctx = [{
        id: "1",
        topic: "T",
        summaries: [{
          agreements: Array.from({ length: 10 }, (_, i) => ({ point: `合意${i}` })),
          disagreements: [],
          unresolved: [],
        }],
      }];
      const { sys } = buildPrompt("claude", "テスト", "", [], 1, "", "standard", null, "", ctx);
      expect(sys).toContain("合意0");
      expect(sys).toContain("合意1");
      expect(sys).toContain("合意2");
      expect(sys).not.toContain("合意3");
    });
  });
});
