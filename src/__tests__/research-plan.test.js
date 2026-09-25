import { describe, it, expect } from "vitest";
import { parsePlan, assignOwners, fallbackPlan, itemsFor, formatPlanForModel, generateResearchPlan } from "../research/plan";

const IDS = ["claude", "chatgpt", "gemini"];

describe("parsePlan", () => {
  it("1行1項目を読み、3AIへ順番に割り振る", () => {
    const plan = parsePlan("温泉の泉質を確認\n価格を確認\n口コミを確認\n経路を確認", IDS);
    expect(plan.items.map((i) => i.owner)).toEqual(["claude", "chatgpt", "gemini", "claude"]);
    expect(plan.items[0]).toMatchObject({ id: "T1", label: "温泉の泉質を確認" });
  });

  it("番号・箇条書き記号を落とす", () => {
    const plan = parsePlan("1. 泉質を確認\n- 価格を確認", IDS);
    // 3件目以降はAI数に合わせた補充項目（担当の空白を作らないため）
    expect(plan.items.slice(0, 2).map((i) => i.label)).toEqual(["泉質を確認", "価格を確認"]);
  });

  it("12項目を超えたら切り捨てる", () => {
    const raw = Array.from({ length: 20 }, (_, i) => `項目${i + 1}を一次情報で確認`).join("\n");
    expect(parsePlan(raw, IDS).items).toHaveLength(12);
  });

  it("空・ノイズしか無ければフォールバック計画になる", () => {
    expect(parsePlan("", IDS).fallback).toBe(true);
    expect(parsePlan("\n\n  \n", IDS).fallback).toBe(true);
  });

  it("フォールバックでも3AIの担当は重ならない", () => {
    const owners = fallbackPlan(IDS).items.map((i) => i.owner);
    expect(new Set(owners).size).toBe(3);
  });
});

describe("assignOwners", () => {
  it("同じ入力なら毎回同じ割り当て（ラウンドをまたいで担当が変わらない）", () => {
    const a = assignOwners(["x", "y", "z", "w"], IDS);
    const b = assignOwners(["x", "y", "z", "w"], IDS);
    expect(a).toEqual(b);
  });
});

describe("formatPlanForModel", () => {
  const plan = parsePlan("泉質を確認\n価格を確認\n口コミを確認", IDS);

  it("自分の担当と他AIの担当を分けて示す", () => {
    const text = formatPlanForModel(plan, "chatgpt", (id) => id.toUpperCase());
    expect(text).toContain("あなたの担当項目");
    expect(text).toContain("価格を確認");
    expect(text).toContain("他AIの担当");
    expect(text).toContain("CLAUDE");
  });

  it("担当が無いAIにも指示を出す（空欄で終わらせない）", () => {
    const solo = { items: [{ id: "T1", label: "泉質を確認", owner: "claude" }] };
    expect(formatPlanForModel(solo, "gemini")).toContain("担当なし");
  });

  it("itemsFor は自分の項目だけ返す", () => {
    expect(itemsFor(plan, "claude").map((i) => i.label)).toEqual(["泉質を確認"]);
  });
});

describe("generateResearchPlan", () => {
  it("モデル出力を計画に変換する", async () => {
    const plan = await generateResearchPlan(async () => "泉質を確認\n価格を確認", "sys", "議題", "", IDS);
    expect(plan.fallback).toBe(false);
    expect(plan.items.slice(0, 2).map((i) => i.label)).toEqual(["泉質を確認", "価格を確認"]);
  });

  it("計画生成に失敗しても調査は止めない（フォールバックへ）", async () => {
    const plan = await generateResearchPlan(async () => { throw new Error("boom"); }, "sys", "議題", "", IDS);
    expect(plan.fallback).toBe(true);
    expect(plan.items.length).toBeGreaterThan(0);
  });
});

describe("担当の空白を作らない（実機で発覚: 計画2項目でGeminiが無担当）", () => {
  it("項目がAI数より少なければ補充項目で埋める", () => {
    const plan = parsePlan("施設Aを特定して料金を確認\n施設Bを特定して料金を確認", IDS);
    expect(plan.items.length).toBeGreaterThanOrEqual(IDS.length);
    const owners = new Set(plan.items.map((i) => i.owner));
    expect(owners).toEqual(new Set(IDS));
  });

  it("補充項目は既存項目と作業が重ならない（検証・拡張役）", () => {
    const plan = parsePlan("施設Aを特定して料金を確認", IDS);
    const added = plan.items.slice(1).map((i) => i.label).join(" ");
    expect(added).toMatch(/照合|口コミ|まだ台帳に無い/);
  });

  it("十分な項目数があれば補充しない", () => {
    const raw = Array.from({ length: 6 }, (_, i) => `項目${i + 1}を一次情報で確認`).join("\n");
    const plan = parsePlan(raw, IDS);
    expect(plan.items).toHaveLength(6);
    expect(plan.items.every((i) => /^項目\d/.test(i.label))).toBe(true);
  });
});

describe("初回の対象衝突を散らす（実機で発覚: 2体が同一施設を調査）", () => {
  const plan = parsePlan("施設を1件特定\n別の施設を1件特定\nさらに別の施設を1件特定", IDS);

  it("AIごとに異なる順位を指示する", () => {
    const forClaude = formatPlanForModel(plan, "claude", (id) => id);
    const forGemini = formatPlanForModel(plan, "gemini", (id) => id);
    expect(forClaude).toContain("3者のうち1番目");
    expect(forClaude).toContain("1番目の候補を選んで");
    expect(forGemini).toContain("3者のうち3番目");
    expect(forGemini).toContain("3番目の候補を選んで");
  });

  it("未知のAIには順位指示を出さない", () => {
    expect(formatPlanForModel(plan, "unknown-ai", (id) => id)).not.toContain("番目の担当です");
  });
});
