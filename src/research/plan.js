// 調査計画と分担 (research plan + lane assignment).
//
// Why a plan at all: the failure mode of an open research request in a panel is
// that all three AIs negotiate the approach for round after round and then all
// three verify the *same* first item — triple cost, single-item progress. The
// plan is generated once, from the topic, by the cheap summary model, and then
// each item is assigned to exactly one AI by index. Nothing is negotiated at
// runtime and the three AIs cover three disjoint slices per round.
//
// Assignment is `index % models.length`, i.e. deterministic and stable across
// rounds: an AI keeps its own items and so keeps the context it has already
// gathered for them.

const MAX_ITEMS = 12;
const MAX_LABEL_LEN = 100;
const DEFAULT_MODEL_IDS = ["claude", "chatgpt", "gemini"];

// Used when plan generation fails (or there is no summary model reachable).
// Splitting one topic by *perspective* still gives three disjoint lanes, so a
// failed plan call degrades to slower research rather than to triplicated work.
export const FALLBACK_ITEM_LABELS = [
  "対象の特定と、価格・仕様・数値など一次情報の確認",
  "評判・口コミ・第三者評価の確認（出典サイト名と件数を明記）",
  "アクセス・費用・手続きなど実行面の条件の確認",
];

// 議題が小さいと、プランナーは「6〜12項目」の指示に反して1〜2項目しか返さない。
// 実測（2026-09-25）では「2件調べる」議題で2項目になり、index%3 の3体目が無担当に
// なった。無担当のAIは指示上は自由に動くため、分担の保証がそこで消える。
// 不足分はこの補充項目で埋める。対象を新規に特定させる項目ではなく、他AIが挙げた
// 対象の「検証」と「拡張」に回す役割なので、既存項目と作業が重ならない。
export const SUPPLEMENT_ITEM_LABELS = [
  "他AIが台帳に挙げた対象について、値を別の出典で照合し、食い違いがあれば両方の出典とともに指摘",
  "他AIが台帳に挙げた対象について、評判・口コミ・第三者評価を確認（出典サイト名と件数を明記）",
  "条件を満たす候補のうち、まだ台帳に無い対象を新たに探して1件追加",
];

// 担当が空のAIが出ないよう、項目数をAI数まで補う。
export function ensureCoverage(labels, modelIds = DEFAULT_MODEL_IDS) {
  const ids = modelIds.length ? modelIds : DEFAULT_MODEL_IDS;
  const out = [...labels];
  for (let i = 0; out.length < ids.length && i < SUPPLEMENT_ITEM_LABELS.length; i++) {
    out.push(SUPPLEMENT_ITEM_LABELS[i]);
  }
  return out;
}

export function assignOwners(labels, modelIds = DEFAULT_MODEL_IDS) {
  const ids = modelIds.length ? modelIds : DEFAULT_MODEL_IDS;
  return ensureCoverage(labels, ids).slice(0, MAX_ITEMS).map((label, i) => ({
    id: `T${i + 1}`,
    label,
    owner: ids[i % ids.length],
  }));
}

export function fallbackPlan(modelIds = DEFAULT_MODEL_IDS) {
  const ids = modelIds.length ? modelIds : DEFAULT_MODEL_IDS;
  return { items: assignOwners(FALLBACK_ITEM_LABELS, ids), fallback: true, modelIds: ids };
}

// The plan model is asked for one item per line, no numbering. Be tolerant:
// strip list markers, drop empty lines and anything that is obviously a
// preamble ("以下が" 等) rather than a task.
export function parsePlan(raw, modelIds = DEFAULT_MODEL_IDS) {
  const labels = (raw || "")
    .split("\n")
    .map((line) => line.replace(/^[\s\d.、)）\-*・>]+/, "").trim())
    .filter((line) => line.length >= 4 && !line.startsWith("【") && !/^```/.test(line))
    .map((line) => (line.length > MAX_LABEL_LEN ? line.slice(0, MAX_LABEL_LEN) : line))
    .slice(0, MAX_ITEMS);
  if (labels.length === 0) return fallbackPlan(modelIds);
  const ids = modelIds.length ? modelIds : DEFAULT_MODEL_IDS;
  return { items: assignOwners(labels, ids), fallback: false, modelIds: ids };
}

export function itemsFor(plan, modelId) {
  const items = Array.isArray(plan?.items) ? plan.items : [];
  return items.filter((it) => it.owner === modelId);
}

// The plan block injected into every research round. It is identical every
// round, so it sits in the cacheable prefix of the prompt.
export function formatPlanForModel(plan, modelId, nameOf) {
  const items = Array.isArray(plan?.items) ? plan.items : [];
  if (items.length === 0) return "";
  const ids = Array.isArray(plan?.modelIds) && plan.modelIds.length ? plan.modelIds : DEFAULT_MODEL_IDS;
  const ordinal = ids.indexOf(modelId) + 1;
  const mine = items.filter((it) => it.owner === modelId);
  const others = items.filter((it) => it.owner !== modelId);
  const fmt = (it) => `- [${it.id}] ${it.label}`;
  const parts = [
    "\n\n【調査計画と分担】",
    "あなたの担当項目（これだけを調べる。他AIの担当には手を出さない）:",
    mine.length ? mine.map(fmt).join("\n") : "- （担当なし。台帳の未確認項目のうち、他AIが着手していないものを1つ選ぶ）",
  ];
  if (others.length) {
    const byOwner = others
      .map((it) => `- [${it.id}] ${(nameOf ? nameOf(it.owner) : it.owner)}: ${it.label}`)
      .join("\n");
    parts.push("他AIの担当（重複調査は禁止。相手の結果は台帳で共有される）:", byOwner);
  }
  // 対象が事前に確定していない調査では、3AIが同時に同じ検索をして同じ上位1件を
  // 選ぶ。実測（2026-09-25）では初回に2体が同一施設を調べ、片方が丸ごと無駄に
  // なった。ラウンド2以降は台帳が衝突を防ぐが、初回だけは防げないので、AIごとに
  // 決定論的に違う順位を割り当てて散らす。
  if (ordinal > 0 && ids.length > 1) {
    parts.push(
      `\n【初回の対象選びのルール】あなたは${ids.length}者のうち${ordinal}番目の担当です。`
      + `台帳が空の初回、対象がまだ決まっていない項目では、検索結果の上位1件に飛びつかず、`
      + `条件に合う候補を${ids.length}件以上挙げたうえで${ordinal}番目の候補を選んでください。`
      + `他AIも同時に同じ検索をしており、対象が重複した分の調査は捨てられます。`,
    );
  }
  return parts.join("\n");
}

// One cheap call (summary model) turns the topic into the item list.
// `callModel(sys, user)` is injected so this module stays free of transport.
export async function generateResearchPlan(callModel, systemPrompt, topic, profile, modelIds = DEFAULT_MODEL_IDS) {
  const user = `【議題】\n${(topic || "").slice(0, 2000)}`
    + (profile ? `\n\n【質問者の背景】\n${profile.slice(0, 300)}` : "")
    + `\n\n調査項目を1行ずつ出力してください。`;
  try {
    const raw = await callModel(systemPrompt, user);
    return parsePlan(raw, modelIds);
  } catch {
    return fallbackPlan(modelIds);
  }
}
