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

describe("調査モードの成果物エクスポート", () => {
  const rounds = [{ messages: [{ modelId: "claude", text: "調査しました", error: null }], userIntervention: "" }];
  const research = {
    report: "# 調査レポート\n\n雲海閣は源泉かけ流しです。",
    ledger: [
      { target: "雲海閣", field: "泉質", value: "単純酸性硫黄温泉", confidence: "確実", url: "https://example.com/u" },
      { target: "雲海閣", field: "価格", value: "4,875円", confidence: "要確認", url: "" },
      { target: "渓雲閣", field: "価格", value: "15,400円|税込", confidence: "確実", url: "https://example.com/k", conflict: true },
    ],
  };

  it("Markdownにレポートと台帳を含める（アプリ外へ持ち出せること）", () => {
    const md = exportToMarkdown("宿を調べて", rounds, [], {}, null, null, research);
    expect(md).toContain("調査レポート");
    expect(md).toContain("雲海閣は源泉かけ流しです。");
    expect(md).toContain("確定事実台帳（3件）");
    expect(md).toContain("https://example.com/u");
    expect(md).toContain("出典なし");
  });

  it("値に含まれる | が表を壊さない", () => {
    const md = exportToMarkdown("宿", rounds, [], {}, null, null, research);
    const row = md.split("\n").find((l) => l.includes("15,400円"));
    expect(row).toContain("15,400円\\|税込");
    // エスケープ済みの \| をセル区切りに数えない＝列数が崩れていない
    const cells = row.split(/(?<!\\)\|/);
    expect(cells.length).toBe(7); // 先頭/末尾の空セル + 5列
  });

  // 注: レポート本文とAI発言のMarkdown描画は DOMPurify を通るため、DOMのない
  // このテスト環境では実行できない（既存テストも rounds=[] で回避している）。
  // ここでは台帳テーブル側＝エスケープとhrefの生成だけを検証する。
  it("HTMLの台帳テーブルに値と出典リンクを出す", () => {
    const html = exportToHtml("宿を調べて", [], [], {}, null, null, { ...research, report: "" });
    expect(html).toContain("単純酸性硫黄温泉");
    expect(html).toContain('href="https://example.com/u"');
    expect(html).toContain("出典なし");
  });

  it("調査でないときは調査セクションを出さない（既存の出力を変えない）", () => {
    const md = exportToMarkdown("普通の議論", rounds, [], {}, null, null, undefined);
    expect(md).not.toContain("確定事実台帳");
    const html = exportToHtml("普通の議論", [], [], {}, null, null, undefined);
    expect(html).not.toContain("確定事実台帳");
  });
});
