import { MODELS } from "./constants";

const VALID_PRIORITIES = ["high", "medium", "low"];
const VALID_TIMEFRAMES = ["今日", "今週", "今月", "検討中"];
const MAX_ACTIONS = 10;

export function buildActionPlanPrompt(topic, discussion, summaries) {
  const roundTexts = discussion.map((round, i) => {
    const msgs = round.messages
      .map((m) => {
        const name = MODELS.find((x) => x.id === m.modelId)?.name ?? m.modelId;
        return `[${name}] ${m.text || "(エラー)"}`;
      })
      .join("\n");
    return `【Round ${i + 1}】\n${msgs}`;
  }).join("\n\n");

  const summaryTexts = summaries
    .filter((s) => s && !s.error)
    .map((s, i) => {
      const parts = [];
      if (s.agreements?.length) parts.push(`合意: ${s.agreements.map((a) => a.point).join(", ")}`);
      if (s.disagreements?.length) parts.push(`対立: ${s.disagreements.map((d) => d.point).join(", ")}`);
      if (s.unresolved?.length) parts.push(`未解決: ${s.unresolved.map((u) => u.point).join(", ")}`);
      return parts.length ? `Round ${i + 1}サマリー: ${parts.join(" / ")}` : "";
    })
    .filter(Boolean)
    .join("\n");

  return `【議題】${topic}\n\n【議論内容】\n${roundTexts}\n\n${summaryTexts ? `【サマリー】\n${summaryTexts}\n\n` : ""}上記の議論を踏まえ、具体的なアクションプランをJSON形式で出力してください。`;
}

export function parseActionPlan(raw) {
  const fallback = { conclusion: "", actions: [], risks: [], nextQuestion: "" };
  try {
    const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const data = JSON.parse(cleaned);
    if (typeof data !== "object" || data === null) return fallback;

    const actions = (Array.isArray(data.actions) ? data.actions : [])
      .filter((a) => typeof a === "object" && a !== null && typeof a.task === "string" && VALID_PRIORITIES.includes(a.priority))
      .map((a) => ({
        task: a.task.slice(0, 200),
        priority: a.priority,
        timeframe: VALID_TIMEFRAMES.includes(a.timeframe) ? a.timeframe : "検討中",
        rationale: typeof a.rationale === "string" ? a.rationale.slice(0, 200) : "",
      }))
      .slice(0, MAX_ACTIONS);

    const risks = (Array.isArray(data.risks) ? data.risks : [])
      .filter((r) => typeof r === "string")
      .slice(0, 5);

    return {
      conclusion: typeof data.conclusion === "string" ? data.conclusion.slice(0, 200) : "",
      actions,
      risks,
      nextQuestion: typeof data.nextQuestion === "string" ? data.nextQuestion.slice(0, 200) : "",
    };
  } catch {
    return fallback;
  }
}
