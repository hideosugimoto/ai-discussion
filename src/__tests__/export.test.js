import { describe, it, expect } from "vitest";
import { exportToMarkdown, exportToHtml } from "../export";

describe("exportToMarkdown", () => {
  const mockDiscussion = [
    {
      messages: [
        { modelId: "claude", text: "Claudeの回答", error: null, loading: false },
        { modelId: "chatgpt", text: "ChatGPTの回答", error: null, loading: false },
        { modelId: "gemini", text: "Geminiの回答", error: null, loading: false },
      ],
      userIntervention: "",
    },
  ];

  it("includes topic and round header", () => {
    const md = exportToMarkdown("AIの未来", mockDiscussion, []);
    expect(md).toContain("AIの未来");
    expect(md).toContain("## Round 1");
  });

  it("includes all AI responses", () => {
    const md = exportToMarkdown("テスト", mockDiscussion, []);
    expect(md).toContain("Claudeの回答");
    expect(md).toContain("ChatGPTの回答");
    expect(md).toContain("Geminiの回答");
  });

  it("includes user intervention when present", () => {
    const disc = [{ ...mockDiscussion[0], userIntervention: "もっと具体的に" }];
    const md = exportToMarkdown("テスト", disc, []);
    expect(md).toContain("もっと具体的に");
    expect(md).toContain("司会者");
  });

  it("includes summary when available", () => {
    const summaries = [{ agreements: [{ point: "全員同意" }], disagreements: [], unresolved: [], positionChanges: [] }];
    const md = exportToMarkdown("テスト", mockDiscussion, summaries);
    expect(md).toContain("全員同意");
    expect(md).toContain("合意点");
  });

  it("sanitizes HTML entities in XSS payload", () => {
    const disc = [{ messages: [{ modelId: "claude", text: "<script>alert(1)</script>", error: null, loading: false }], userIntervention: "" }];
    const md = exportToMarkdown("テスト", disc, []);
    expect(md).not.toContain("<script>");
    expect(md).toContain("&lt;script&gt;");
  });

  it("escapes Markdown link injection", () => {
    const disc = [{ messages: [{ modelId: "claude", text: "[click](javascript:alert(1))", error: null, loading: false }], userIntervention: "" }];
    const md = exportToMarkdown("テスト", disc, []);
    expect(md).not.toContain("[click]");
    expect(md).toContain("\\[click\\]");
  });

  it("handles empty discussion", () => {
    const md = exportToMarkdown("テスト", [], []);
    expect(md).toContain("テスト");
    expect(md).toContain("**ラウンド数:** 0");
  });

  it("handles error messages", () => {
    const disc = [{ messages: [{ modelId: "claude", text: "", error: "API error", loading: false }], userIntervention: "" }];
    const md = exportToMarkdown("テスト", disc, []);
    expect(md).toContain("エラー: API error");
  });

  it("includes the final verdict (judgement) when provided", () => {
    const verdict = {
      recommendation: "段階導入を採用すべき",
      confidence: "high",
      resolved: [{ point: "速度かコストか", verdict: "折衷", reason: "リスク分割", confidence: "medium" }],
      caveats: ["規模が大きい場合は再検討"],
      decisionHint: "ロールバック手順の実在",
      critique: { survives: "partial", strongestObjection: "二重運用コスト", fix: "期限を区切る" },
    };
    const md = exportToMarkdown("テスト", mockDiscussion, [], null, verdict, null);
    expect(md).toContain("最終ジャッジ");
    expect(md).toContain("段階導入を採用すべき");
    expect(md).toContain("確信度: 高");
    expect(md).toContain("折衷");
    expect(md).toContain("ロールバック手順の実在");
    expect(md).toContain("条件付きで成立");
  });

  it("includes the action plan when provided", () => {
    const plan = {
      conclusion: "既存先へ横展開",
      actions: [{ task: "提案書作成", priority: "high", timeframe: "今週", rationale: "勝ちやすい" }],
      risks: ["単価低下"],
      nextQuestion: "どの媒体で発信するか",
    };
    const md = exportToMarkdown("テスト", mockDiscussion, [], null, null, plan);
    expect(md).toContain("アクションプラン");
    expect(md).toContain("既存先へ横展開");
    expect(md).toContain("提案書作成");
    expect(md).toContain("単価低下");
    expect(md).toContain("どの媒体で発信するか");
  });

  it("omits the decision layer when verdict/plan are absent (backward compatible)", () => {
    const md = exportToMarkdown("テスト", mockDiscussion, []);
    expect(md).not.toContain("最終ジャッジ");
    expect(md).not.toContain("アクションプラン");
  });

  it("HTML export embeds the verdict and escapes it", () => {
    // Empty discussion → exercises the verdict block (sanitizeHtml) without the
    // message markdown path (DOMPurify needs a DOM, absent in this node env).
    const verdict = { recommendation: "<b>結論</b>", confidence: "medium", resolved: [], caveats: [], decisionHint: "" };
    const html = exportToHtml("テスト", [], [], {}, verdict, null);
    expect(html).toContain("最終ジャッジ");
    expect(html).not.toContain("<b>結論</b>");
    expect(html).toContain("&lt;b&gt;結論&lt;/b&gt;");
  });
});
