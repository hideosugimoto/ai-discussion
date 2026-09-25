import { describe, it, expect } from "vitest";
import { buildPrompt, buildReportPrompt, buildResearchBlocks } from "../prompt";
import { parsePlan } from "../research/plan";
import { RESEARCH_CONFIG } from "../constants";
import { mergeLedger, parseLedgerBlock, ledgerIndex, serializeLedger } from "../research/ledger";

const IDS = ["claude", "chatgpt", "gemini"];
const plan = parsePlan("泉質を確認\n価格を確認\n口コミを確認", IDS);
const ledger = mergeLedger([], parseLedgerBlock(
  `【台帳】\n- 雲海閣 | 泉質 | 単純酸性硫黄温泉 | 確実 | https://example.com/u`,
  { modelId: "gemini", round: 1 },
));
const research = { plan, ledgerIndex: ledgerIndex(ledger), openItems: ["雲海閣 | 口コミ | 未取得"], searchBudget: 3 };

const history = [{ messages: [{ modelId: "claude", text: "前ラウンドの長い議論本文です" }] }];

describe("調査モードのプロンプト", () => {
  it("字数制限や反論の義務づけを課さない", () => {
    const { sys } = buildPrompt("claude", "宿を調べて", "", [], 1, "", "research", {}, "", [], [], null, [], null, true, research);
    expect(sys).not.toContain("200〜300字");
    expect(sys).not.toContain("新しい論点・反論・譲歩のいずれかを必ず1つ以上");
    // 反論は「義務」ではなく「禁止」側に置かれている
    expect(sys).toContain("他AIへの同意表明・反論");
    expect(sys).toContain("調査担当者");
  });

  it("出力契約（本文＋台帳＋未確認）を指示する", () => {
    const { sys } = buildPrompt("claude", "宿を調べて", "", [], 1, "", "research", {}, "", [], [], null, [], null, true, research);
    expect(sys).toContain("【台帳】");
    expect(sys).toContain("【未確認】");
    expect(sys).toContain("対象 | 項目 | 値 | 確度 | 出典URL");
  });

  it("担当分担と検索回数の上限を伝える", () => {
    const { sys } = buildPrompt("chatgpt", "宿を調べて", "", [], 2, "", "research", {}, "", [], [], null, [], null, true, research);
    expect(sys).toContain("あなたの担当項目");
    expect(sys).toContain("価格を確認");
    expect(sys).toContain("最大3回");
  });

  it("議論の書き起こしを再送しない（台帳が状態を運ぶ）", () => {
    const { user } = buildPrompt("claude", "宿を調べて", "", history, 3, "", "research", {}, "", [], [], null, [], null, true, research);
    expect(user).not.toContain("前ラウンドの長い議論本文です");
    expect(user).toContain("確定事実台帳");
    expect(user).toContain("雲海閣");
  });

  it("通常モードは従来どおり書き起こしを送る（退行防止）", () => {
    const { user } = buildPrompt("claude", "宿を調べて", "", history, 3, "", "standard", {}, "", [], [], null, [], null, false);
    expect(user).toContain("前ラウンドの長い議論本文です");
  });

  it("台帳が空でも着手を促す", () => {
    const { user } = buildPrompt("claude", "宿", "", [], 1, "", "research", {}, "", [], [], null, [], null, true, { plan, searchBudget: 3 });
    expect(user).toContain("まだ空です");
  });

  it("司会者の介入は調査モードでも届く", () => {
    const { user } = buildPrompt("claude", "宿", "", [], 2, "秩父を優先して", "research", {}, "", [], [], null, [], null, true, research);
    expect(user).toContain("秩父を優先して");
  });

  it("議題はキャッシュ対象の前半に、台帳は可変部分に置く", () => {
    const { userCachePrefix, userVariable } = buildPrompt("claude", "宿を調べて", "", [], 2, "", "research", {}, "", [], [], null, [], null, true, research);
    expect(userCachePrefix).toContain("宿を調べて");
    expect(userCachePrefix).not.toContain("雲海閣");
    expect(userVariable).toContain("雲海閣");
  });
});

describe("プロキシの入力上限", () => {
  // functions/api/chat/stream.js は system 16000字 / message 50000字を超えると
  // 400 を返す = そのラウンドが丸ごと失敗する。最悪ケースで越えないこと。
  const MAX_SYS = 16000;
  const MAX_MSG = 50000;

  it("最長構成でも system が上限を超えない", () => {
    const longPlan = parsePlan(
      Array.from({ length: 12 }, (_, i) => `項目${i}: ${"あ".repeat(95)}`).join("\n"),
      IDS,
    );
    const { sys } = buildPrompt(
      "claude", "あ".repeat(2000), "プ".repeat(5000), [], 5, "い".repeat(1000), "research",
      { claude: "ペ".repeat(100) }, "憲".repeat(2000), [], [], null, [], null, true,
      { plan: longPlan, ledgerIndex: "", openItems: [], searchBudget: 3 },
    );
    expect(sys.length).toBeLessThan(MAX_SYS);
  });

  it("台帳が上限まで育っても message が上限を超えない", () => {
    const bigIndex = Array.from({ length: 60 }, (_, i) => `・対象${i} ｜ 済: 価格,評価 ｜ 出典: https://example.com/${i}`).join("\n");
    const { user } = buildPrompt(
      "claude", "あ".repeat(2000), "", [], 9, "い".repeat(1000), "research",
      {}, "", [], [], null, [], null, true,
      { plan, ledgerIndex: bigIndex, openItems: Array.from({ length: 20 }, (_, i) => `未確認${i}`), searchBudget: 3 },
    );
    expect(user.length).toBeLessThan(MAX_MSG);
  });
});

describe("buildResearchBlocks", () => {
  it("検索予算が未指定なら RESEARCH_CONFIG の既定値で説明する（値の二重管理を防ぐ）", () => {
    const { toolText } = buildResearchBlocks({ plan }, "claude");
    expect(toolText).toContain(`最大${RESEARCH_CONFIG.searchBudget}回`);
  });

  it("前ラウンドの未確認項目を引き継ぐ", () => {
    const { ledgerText } = buildResearchBlocks(research, "claude");
    expect(ledgerText).toContain("未確認項目");
    expect(ledgerText).toContain("口コミ");
  });
});

describe("buildReportPrompt", () => {
  it("台帳だけを根拠にするよう束縛する", () => {
    const user = buildReportPrompt("宿を20軒調べて", serializeLedger(ledger), "", "");
    expect(user).toContain("宿を20軒調べて");
    expect(user).toContain("単純酸性硫黄温泉");
    expect(user).toContain("台帳だけを根拠");
  });

  it("台帳が空なら「調査結果なし」と言わせる", () => {
    expect(buildReportPrompt("議題", "", "", "")).toContain("調査結果なし");
  });
});
