import { describe, it, expect } from "vitest";
import { buildActionPlanPrompt, parseActionPlan } from "../actionPlan";

describe("buildActionPlanPrompt", () => {
  const mockDiscussion = [
    { messages: [
      { modelId: "claude", text: "AIツールに投資すべき" },
      { modelId: "chatgpt", text: "段階的に進めるべき" },
      { modelId: "gemini", text: "リスク管理が重要" },
    ], userIntervention: "" },
  ];

  const mockSummaries = [{
    agreements: [{ point: "AI投資は必要" }],
    disagreements: [{ point: "投資規模" }],
    unresolved: [],
    positionChanges: [],
  }];

  it("includes topic in prompt", () => {
    const prompt = buildActionPlanPrompt("新規事業の方向性", mockDiscussion, mockSummaries);
    expect(prompt).toContain("新規事業の方向性");
  });

  it("includes discussion content", () => {
    const prompt = buildActionPlanPrompt("テスト", mockDiscussion, mockSummaries);
    expect(prompt).toContain("AIツールに投資すべき");
    expect(prompt).toContain("段階的に進めるべき");
  });

  it("includes summary data", () => {
    const prompt = buildActionPlanPrompt("テスト", mockDiscussion, mockSummaries);
    expect(prompt).toContain("AI投資は必要");
  });

  it("handles empty summaries", () => {
    const prompt = buildActionPlanPrompt("テスト", mockDiscussion, []);
    expect(prompt).toContain("テスト");
  });
});

describe("parseActionPlan", () => {
  it("parses valid JSON response", () => {
    const json = JSON.stringify({
      conclusion: "AI投資を段階的に実施",
      actions: [{ task: "市場調査", priority: "high", timeframe: "今週", rationale: "根拠" }],
      risks: ["競合参入"],
      nextQuestion: "予算配分",
    });
    const result = parseActionPlan(json);
    expect(result.conclusion).toBe("AI投資を段階的に実施");
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0].priority).toBe("high");
    expect(result.risks).toHaveLength(1);
    expect(result.nextQuestion).toBe("予算配分");
  });

  it("handles markdown-wrapped JSON", () => {
    const raw = '```json\n{"conclusion":"test","actions":[],"risks":[],"nextQuestion":""}\n```';
    const result = parseActionPlan(raw);
    expect(result.conclusion).toBe("test");
  });

  it("returns fallback on invalid JSON", () => {
    const result = parseActionPlan("not json at all");
    expect(result.conclusion).toBe("");
    expect(result.actions).toEqual([]);
    expect(result.risks).toEqual([]);
  });

  it("validates action structure", () => {
    const json = JSON.stringify({
      conclusion: "test",
      actions: [
        { task: "valid", priority: "high", timeframe: "今日", rationale: "ok" },
        { task: 123, priority: "invalid" },
        "not an object",
      ],
      risks: ["risk1", 42],
      nextQuestion: "next",
    });
    const result = parseActionPlan(json);
    expect(result.actions).toHaveLength(1);
    expect(result.risks).toEqual(["risk1"]);
  });

  it("limits actions to 10 items", () => {
    const actions = Array.from({ length: 15 }, (_, i) => ({
      task: `task${i}`, priority: "low", timeframe: "今月", rationale: "r",
    }));
    const json = JSON.stringify({ conclusion: "x", actions, risks: [], nextQuestion: "" });
    const result = parseActionPlan(json);
    expect(result.actions.length).toBeLessThanOrEqual(10);
  });
});
