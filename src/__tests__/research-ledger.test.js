import { describe, it, expect } from "vitest";
import {
  parseLedgerBlock,
  parseOpenItems,
  mergeLedger,
  ledgerIndex,
  serializeLedger,
  ledgerStats,
  sanitizeLedger,
  isDocumentUrl,
  CONFIDENCE,
} from "../research/ledger";

const meta = { modelId: "claude", round: 2 };

const message = `今回は雲海閣の泉質と価格を確認しました。

【台帳】
- 雲海閣 | 泉質 | 単純酸性硫黄温泉 | 確実 | https://example.com/unkaikaku
- 雲海閣 | 素泊まり料金 | 4,875円（1名・10/20） | 確実 | https://example.com/unkaikaku
- 雲海閣 | 一人泊 | 可 | 要確認 |

【未確認】
- 雲海閣 | 口コミ分布 | 施設ページが動的描画で読めなかった
`;

describe("parseLedgerBlock", () => {
  it("議事本文を無視して台帳ブロックだけを読む", () => {
    const entries = parseLedgerBlock(message, meta);
    expect(entries).toHaveLength(3);
    expect(entries[0]).toMatchObject({
      target: "雲海閣",
      field: "泉質",
      value: "単純酸性硫黄温泉",
      confidence: CONFIDENCE.CONFIRMED,
      url: "https://example.com/unkaikaku",
      modelId: "claude",
      round: 2,
    });
  });

  it("出典URLのない「確実」は要確認に落とす", () => {
    const entries = parseLedgerBlock(`【台帳】\n- A社 | 価格 | 1000円 | 確実 |`, meta);
    expect(entries[0].confidence).toBe(CONFIDENCE.NEEDS_CHECK);
  });

  it("全角パイプ・別の箇条書き記号・Markdownリンクを受け付ける", () => {
    const text = `【台帳】\n・B社 ｜ 定員 ｜ 10名 ｜ 確実 ｜ [公式](https://example.com/b)`;
    const [e] = parseLedgerBlock(text, meta);
    expect(e).toMatchObject({ target: "B社", field: "定員", value: "10名", url: "https://example.com/b" });
  });

  it("値のない行と、台帳ブロックが無い発言は捨てる", () => {
    expect(parseLedgerBlock(`【台帳】\n- C社 | 価格 |`, meta)).toHaveLength(0);
    expect(parseLedgerBlock("台帳の話はしていません", meta)).toHaveLength(0);
  });

  it("次の【見出し】でブロックを打ち切る", () => {
    const entries = parseLedgerBlock(message, meta);
    expect(entries.some((e) => e.field === "口コミ分布")).toBe(false);
  });

  it("URLでない文字列は出典として採用しない", () => {
    const [e] = parseLedgerBlock(`【台帳】\n- D社 | 価格 | 500円 | 確実 | 公式サイトより`, meta);
    expect(e.url).toBe("");
    expect(e.confidence).toBe(CONFIDENCE.NEEDS_CHECK);
  });
});

describe("parseOpenItems", () => {
  it("未確認ブロックを行単位で拾う", () => {
    expect(parseOpenItems(message)).toEqual([
      "雲海閣 | 口コミ分布 | 施設ページが動的描画で読めなかった",
    ]);
  });
});

describe("mergeLedger", () => {
  it("同一の事実は重複させない（ラウンドをまたいでも増えない）", () => {
    const first = parseLedgerBlock(message, meta);
    const merged = mergeLedger(mergeLedger([], first), first);
    expect(merged).toHaveLength(3);
  });

  it("同じ対象×項目で値が違えば両方残し、矛盾として印を付ける", () => {
    const a = parseLedgerBlock(`【台帳】\n- E社 | 価格 | 1000円 | 確実 | https://example.com/1`, { modelId: "claude", round: 1 });
    const b = parseLedgerBlock(`【台帳】\n- E社 | 価格 | 1200円 | 確実 | https://example.com/2`, { modelId: "gemini", round: 2 });
    const merged = mergeLedger(mergeLedger([], a), b);
    expect(merged).toHaveLength(2);
    expect(merged.every((e) => e.conflict)).toBe(true);
    expect(ledgerStats(merged).conflicts).toBe(2);
  });

  it("入力を破壊しない", () => {
    const base = mergeLedger([], parseLedgerBlock(message, meta));
    const before = JSON.stringify(base);
    mergeLedger(base, parseLedgerBlock(`【台帳】\n- F社 | 価格 | 1円 | 推測 |`, meta));
    expect(JSON.stringify(base)).toBe(before);
  });
});

describe("ledgerIndex", () => {
  it("値を送らず、済んだ項目と出典URLだけを渡す（毎ラウンド再送されるため）", () => {
    const merged = mergeLedger([], parseLedgerBlock(message, meta));
    const index = ledgerIndex(merged);
    expect(index).toContain("雲海閣");
    expect(index).toContain("泉質");
    expect(index).toContain("https://example.com/unkaikaku");
    expect(index).not.toContain("単純酸性硫黄温泉");
    expect(index).not.toContain("4,875円");
  });

  it("空の台帳では空文字", () => {
    expect(ledgerIndex([])).toBe("");
  });
});

describe("serializeLedger", () => {
  it("レポート用には値と確度と出典をそのまま出す", () => {
    const merged = mergeLedger([], parseLedgerBlock(message, meta));
    const text = serializeLedger(merged);
    expect(text).toContain("■ 雲海閣");
    expect(text).toContain("単純酸性硫黄温泉");
    expect(text).toContain("https://example.com/unkaikaku");
    expect(text).toContain("出典なし");
  });

  it("上限を超えたら打ち切りを明示する", () => {
    const merged = mergeLedger([], parseLedgerBlock(message, meta));
    expect(serializeLedger(merged, 10)).toContain("上限");
  });
});

describe("sanitizeLedger", () => {
  it("保存データから読み直すときに壊れた行を落とす", () => {
    const restored = sanitizeLedger([
      { target: "G社", field: "価格", value: "100円", confidence: "確実", url: "https://example.com/g" },
      { target: "", field: "価格", value: "100円" },
      null,
      "not an object",
    ]);
    expect(restored).toHaveLength(1);
    expect(restored[0].confidence).toBe(CONFIDENCE.CONFIRMED);
  });
});

describe("URLの由来を http(s) に限定する（リンク描画・HTMLエクスポート先）", () => {
  // 台帳のURLは ResearchPanel の <a href> と HTML エクスポートの href に入る。
  // React も export の sanitizeHtml も javascript: スキームを止めないので、
  // 侵入口（パーサ／保存データの読み戻し）の両方で落とすことが唯一の防御。
  it("パース時に javascript: を弾く", () => {
    const [e] = parseLedgerBlock(`【台帳】\n- X社 | 価格 | 1円 | 確実 | javascript:alert(1)`, meta);
    expect(e.url).toBe("");
  });

  it("保存データの読み戻しでも javascript: / data: を弾く", () => {
    const restored = sanitizeLedger([
      { target: "X社", field: "価格", value: "1円", confidence: "確実", url: "javascript:alert(1)" },
      { target: "Y社", field: "価格", value: "2円", confidence: "確実", url: "data:text/html,<script>" },
      { target: "Z社", field: "価格", value: "3円", confidence: "確実", url: "https://example.com/z" },
    ]);
    expect(restored.map((e) => e.url)).toEqual(["", "", "https://example.com/z"]);
  });
});

// 実機で得た Claude Sonnet 4.6 の出力（2026-09-25、ローカル wrangler pages dev 経由）。
// プロンプトは「- 対象 | 項目 | ...」の箇条書きを指定したが、モデルは Markdown
// テーブルで返した。この形を取りこぼすと台帳が丸ごと空になるので固定しておく。
const LIVE_SONNET_OUTPUT = `公式ページで料金を確認できました。

【台帳】
| 対象 | 項目 | 値 | 確度 | 出典URL |
|---|---|---|---|---|
| おふろの王様 志木店（埼玉県志木市） | 大人入浴料金（平日） | 900円（中学生以上） | 確実 | https://www.ousama2603.com/shiki/ |
| おふろの王様 志木店（埼玉県志木市） | 大人入浴料金（土・日・祝日） | 1,000円（中学生以上） | 確実 | https://www.ousama2603.com/shiki/ |
| おふろの王様 志木店（埼玉県志木市） | 定休日 | 年中無休（公式ページ上に明示記載なし） | 要確認 | https://onsen-life.com/facility/ofuro-no-ousama-shiki-branch |

【未確認】
| 対象 | 項目 | 確認できなかった理由 |
|---|---|---|
| おふろの王様 志木店 | 定休日（公式確定） | 公式トップページに定休日の明記なし |`;

describe("実機出力の回帰（Markdownテーブル形式）", () => {
  it("テーブルで返ってきても3件すべて抽出する", () => {
    const entries = parseLedgerBlock(LIVE_SONNET_OUTPUT, { modelId: "claude", round: 1 });
    expect(entries).toHaveLength(3);
    expect(entries[0]).toMatchObject({
      target: "おふろの王様 志木店（埼玉県志木市）",
      field: "大人入浴料金（平日）",
      value: "900円（中学生以上）",
      confidence: CONFIDENCE.CONFIRMED,
      url: "https://www.ousama2603.com/shiki/",
    });
    expect(entries[2].confidence).toBe(CONFIDENCE.NEEDS_CHECK);
  });

  it("区切り行とヘッダ行を事実として登録しない", () => {
    const entries = parseLedgerBlock(LIVE_SONNET_OUTPUT, { modelId: "claude", round: 1 });
    expect(entries.some((e) => e.target === "対象")).toBe(false);
    expect(entries.some((e) => /^:?-+:?$/.test(e.target))).toBe(false);
  });

  it("未確認もテーブルの骨組みを混入させない", () => {
    const open = parseOpenItems(LIVE_SONNET_OUTPUT);
    expect(open).toHaveLength(1);
    expect(open[0]).toContain("おふろの王様 志木店");
    expect(open[0]).not.toContain("---");
  });
});

describe("出典の質（実機で発覚: 画像URLを根拠に「確実」と書かれた）", () => {
  it("画像ファイルを出典にした「確実」は要確認へ落とす", () => {
    const text = `【台帳】\n- おふろの王様 和光店 | 入浴料金 | 平日950円 | 確実 | https://sp.jorudan.co.jp/onsen/images/spot/640/2353_1.jpg`;
    const [e] = parseLedgerBlock(text, meta);
    expect(e.confidence).toBe(CONFIDENCE.NEEDS_CHECK);
    expect(e.url).toBe("https://sp.jorudan.co.jp/onsen/images/spot/640/2353_1.jpg");
  });

  it("通常のページURLなら確実のまま通す", () => {
    const text = `【台帳】\n- A社 | 価格 | 100円 | 確実 | https://example.com/price`;
    expect(parseLedgerBlock(text, meta)[0].confidence).toBe(CONFIDENCE.CONFIRMED);
  });

  it("クエリ付きのページURLを画像と誤判定しない", () => {
    const text = `【台帳】\n- A社 | 価格 | 100円 | 確実 | https://example.com/price?img=x.jpg`;
    expect(parseLedgerBlock(text, meta)[0].confidence).toBe(CONFIDENCE.CONFIRMED);
  });

  it("isDocumentUrl は空文字と不正URLをfalseにする", () => {
    expect(isDocumentUrl("")).toBe(false);
    expect(isDocumentUrl("not a url")).toBe(false);
    expect(isDocumentUrl("https://example.com/a.PNG")).toBe(false);
    expect(isDocumentUrl("https://example.com/doc.html")).toBe(true);
  });
});
