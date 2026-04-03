import { describe, it, expect } from "vitest";
import { exportToMarkdown } from "../export";

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
});
