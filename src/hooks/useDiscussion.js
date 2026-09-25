import { useState, useRef, useCallback, useEffect } from "react";
import { MODELS, MODE_MODELS, RESEARCH_CONFIG } from "../constants";
import { SUMMARY_MODEL } from "../models.config";
import { buildPrompt, buildReportPrompt } from "../prompt";
import { parseLedgerBlock, parseOpenItems, mergeLedger, ledgerIndex, serializeLedger, sanitizeLedger, sanitizeOpenItems } from "../research/ledger";
import { generateResearchPlan } from "../research/plan";
import { callClaude, callChatGPT, callGemini } from "../api";
import { callProxyClaude, callProxyChatGPT, callProxyGemini, callProxySearch } from "../apiProxy";
import { saveDiscussion } from "../history";
import { buildActionPlanPrompt, parseActionPlan } from "../actionPlan";
import { shouldSummarize } from "../lib/fileParser";
import actionPlanPromptText from "../prompts/action-plan.txt?raw";
import combinedSummaryPromptText from "../prompts/combined-summary.txt?raw";
import researchPlanPromptText from "../prompts/research-plan.txt?raw";
import researchReportPromptText from "../prompts/research-report.txt?raw";
import detailedPromptText from "../prompts/detailed-analysis.txt?raw";
import finalVerdictPromptText from "../prompts/final-verdict.txt?raw";
import finalVerdictCritiquePromptText from "../prompts/final-verdict-critique.txt?raw";

const ATTACHMENT_SUMMARY_SYSTEM =
  "あなたは資料を議論用に要約するアシスタントです。重要な数値・固有名詞・主張は省略せず、引用可能な形で簡潔にまとめます。";

function buildAttachmentSummaryUser(name, text) {
  return `ファイル名: ${name}\n以下の内容を、議論で参照しやすいよう 600〜800字程度で要約してください。重要な数値・固有名詞・主張は省略せず保持してください。元の文書の意図と論点を残してください。\n\n${text}`;
}

async function callGPTMini(apiKey, authToken, viaProxy, sys, user, sessionId, turnNumber) {
  if (viaProxy && authToken) {
    return await callProxyChatGPT(authToken, SUMMARY_MODEL, sys, user, () => {}, undefined, sessionId, turnNumber);
  }
  return await callChatGPT(apiKey, SUMMARY_MODEL, sys, user, () => {});
}

// Returns a new attachments array with `summary` filled in on any items that
// were not already summarised. Returns the same reference (===) when nothing
// changed so callers can avoid extra renders. Falls back to the original
// attachment on individual summary failures — degraded but never blocking.
async function ensureAttachmentSummaries({ attachments, summaryMode, apiKey, authToken, viaProxy, sessionId }) {
  if (!attachments || attachments.length === 0) return attachments;
  if (!shouldSummarize(summaryMode, attachments)) return attachments;
  if (!authToken && !apiKey) return attachments; // can't reach the summary model

  const pending = attachments.some((a) => !a.summary);
  if (!pending) return attachments;

  let changed = false;
  const next = await Promise.all(attachments.map(async (a) => {
    if (a.summary) return a;
    try {
      const sys = ATTACHMENT_SUMMARY_SYSTEM;
      const user = buildAttachmentSummaryUser(a.name, a.text);
      const summary = await callGPTMini(apiKey, authToken, viaProxy, sys, user, sessionId, 0);
      const cleaned = (summary || "").trim();
      if (!cleaned) return a;
      changed = true;
      return { ...a, summary: cleaned };
    } catch {
      return a;
    }
  }));
  return changed ? next : attachments;
}

// Generate up to 3 facet sub-queries for this round from the topic, the user's
// profile, and (round 2+) the most recent intervention so re-searches follow
// the discussion's evolving focus. Splitting one broad topic (e.g. a trip into
// 食事 / 酒 / 観光) yields concrete material instead of one shallow result set.
// Each query is tagged place/general so the backend routes place queries
// (restaurants/spots/lodging) to Maps grounding. Returns [{q,type}]; falls back
// to a single general raw-topic query on any failure.
async function generateSearchQueries(apiKey, authToken, viaProxy, topic, profile, intervention, sessionId) {
  const fallback = (topic || "").trim() ? [{ q: topic.slice(0, 200), type: "general" }] : [];
  const sys = "あなたは検索クエリ作成アシスタントです。与えられた議題で最新情報が必要な観点を最大3つに分け、それぞれの簡潔で具体的な日本語検索クエリを作ります。各クエリの先頭に種別を付けます: 店・施設・観光地・宿・場所に関するものは「place:」、それ以外（事実・統計・トレンド・一般情報）は「general:」。観点が1つで十分なら1つだけでよい。出力は1行に1クエリ、最大3行。形式は「place: 〇〇」または「general: 〇〇」。説明・番号・引用符・前置きは不要。";
  const user = `議題: ${(topic || "").slice(0, 500)}`
    + (profile ? `\n質問者の背景: ${profile.slice(0, 300)}` : "")
    + (intervention ? `\n直近の論点（今回はこの観点を優先）: ${intervention.slice(0, 300)}` : "");
  try {
    const raw = await callGPTMini(apiKey, authToken, viaProxy, sys, user, sessionId, 0);
    const queries = (raw || "")
      .split("\n")
      .map((line) => line.replace(/^[\s\d.、)）-]+/, "").trim())
      .filter(Boolean)
      .map((line) => {
        const m = line.match(/^(place|general)\s*[:：]\s*(.+)$/i);
        const type = m && m[1].toLowerCase() === "place" ? "place" : "general";
        const q = (m ? m[2] : line).replace(/^["'「」]+|["'「」]+$/g, "").trim();
        return { q, type };
      })
      .filter((item) => item.q)
      .slice(0, 3);
    return queries.length ? queries : fallback;
  } catch {
    return fallback;
  }
}

// One gpt-5.4-mini call produces BOTH the per-round summary and the updated
// cumulative (rolling) summary, halving the summary call count. Same round text
// and prev-rolling context the two separate calls used, so quality is preserved.
// Returns { round, rolling } with the same shapes the callers already expect.
async function generateCombinedSummary(apiKey, authToken, viaProxy, messages, topic, roundNum, personas, prevRolling, sessionId) {
  const roundText = messages
    .map((m) => {
      const name = MODELS.find((x) => x.id === m.modelId)?.name ?? m.modelId;
      const p = (personas?.[m.modelId] || "").trim();
      return `[${p ? `${name}（${p}）` : name}] ${m.text || "(エラー)"}`;
    })
    .join("\n\n");

  const prevJson = prevRolling && !prevRolling.error ? JSON.stringify(prevRolling) : "";
  const prevText = prevJson && prevJson.length <= 3000
    ? `【前回までの累積要約】\n${prevJson}\n\n`
    : "";

  const userMsg = `${prevText}【議題】${topic}\n【Round ${roundNum}の発言】\n${roundText}\n\nJSON形式で出力してください。`;

  const tryOnce = async () => {
    const text = await callGPTMini(apiKey, authToken, viaProxy, combinedSummaryPromptText, userMsg, sessionId, roundNum);
    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    return JSON.parse(cleaned);
  };

  let parsed;
  try {
    parsed = await tryOnce();
  } catch {
    parsed = await tryOnce();
  }
  if (!parsed || typeof parsed !== "object") throw new Error("Invalid summary format");

  const arr = (v) => (Array.isArray(v) ? v : []);
  const obj = (v) => (v && typeof v === "object" ? v : {});
  const r = obj(parsed.round);
  const ro = obj(parsed.rolling);
  return {
    round: {
      agreements: arr(r.agreements),
      disagreements: arr(r.disagreements),
      unresolved: arr(r.unresolved),
      positionChanges: arr(r.positionChanges),
      stances: obj(r.stances),
    },
    rolling: {
      agreements: arr(ro.agreements),
      disagreements: arr(ro.disagreements),
      unresolved: arr(ro.unresolved),
      stances: obj(ro.stances),
    },
  };
}

async function generateDetailedAnalysis(apiKey, authToken, viaProxy, allRounds, topic, personas, sessionId) {
  const allText = allRounds
    .map((round, i) => {
      const msgs = round.messages
        .map((m) => {
          const name = MODELS.find((x) => x.id === m.modelId)?.name ?? m.modelId;
          const p = (personas?.[m.modelId] || "").trim();
          return `[${p ? `${name}（${p}）` : name}] ${m.text || "(エラー)"}`;
        })
        .join("\n\n");
      return `【Round ${i + 1}】\n${msgs}`;
    })
    .join("\n\n---\n\n");

  const userMsg = `【議題】${topic}\n\n${allText}\n\nJSON形式で出力してください。`;

  const text = await callGPTMini(apiKey, authToken, viaProxy, detailedPromptText, userMsg, sessionId, allRounds.length);
  const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  const parsed = JSON.parse(cleaned);
  if (!parsed || typeof parsed !== "object") throw new Error("Invalid analysis format");
  return {
    themes: Array.isArray(parsed.themes) ? parsed.themes : [],
    consensus: Array.isArray(parsed.consensus) ? parsed.consensus : [],
    unresolved: Array.isArray(parsed.unresolved) ? parsed.unresolved : [],
  };
}

// "最終ジャッジ": resolve each disagreement and produce a single recommendation
// with confidence — Fugu's "one answer" deliverable, but with the reasoning and
// the underlying debate kept visible.
const ONE_OF = (v, allowed, fallback) => (allowed.includes(v) ? v : fallback);

async function generateFinalVerdict(apiKey, authToken, viaProxy, allRounds, topic, personas, sessionId, priorObjection) {
  const allText = allRounds
    .map((round, i) => {
      const msgs = round.messages
        .map((m) => {
          const name = MODELS.find((x) => x.id === m.modelId)?.name ?? m.modelId;
          const p = (personas?.[m.modelId] || "").trim();
          return `[${p ? `${name}（${p}）` : name}] ${m.text || "(エラー)"}`;
        })
        .join("\n\n");
      return `【Round ${i + 1}】\n${msgs}`;
    })
    .join("\n\n---\n\n");

  // Re-judge mode: a prior verdict failed its stress test, so we feed the
  // strongest objection back in and force the judge to confront it head-on.
  const objection = typeof priorObjection === "string" ? priorObjection.trim() : "";
  const rebuttalBlock = objection
    ? `\n\n【前回の推奨に出た最も強い反論（必ず正面から扱うこと）】\n${objection}\nこの反論に逃げず応答すること。推奨を維持するなら反論への反証を根拠に示し、覆るなら結論自体を見直して、改めて最も妥当な単一の推奨を導いてください。`
    : "";
  const userMsg = `【議題】${topic}\n\n${allText}${rebuttalBlock}\n\nJSON形式で出力してください。`;
  const text = await callGPTMini(apiKey, authToken, viaProxy, finalVerdictPromptText, userMsg, sessionId, allRounds.length);
  const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  const parsed = JSON.parse(cleaned);
  if (!parsed || typeof parsed !== "object") throw new Error("Invalid verdict format");
  const conf = ["high", "medium", "low"];
  return {
    recommendation: typeof parsed.recommendation === "string" ? parsed.recommendation : "",
    confidence: ONE_OF(parsed.confidence, conf, "medium"),
    resolved: (Array.isArray(parsed.resolved) ? parsed.resolved : []).map((r) => ({
      point: typeof r?.point === "string" ? r.point : "",
      verdict: typeof r?.verdict === "string" ? r.verdict : "",
      reason: typeof r?.reason === "string" ? r.reason : "",
      confidence: ONE_OF(r?.confidence, conf, "medium"),
    })).filter((r) => r.point || r.verdict),
    caveats: (Array.isArray(parsed.caveats) ? parsed.caveats : []).filter((x) => typeof x === "string"),
    decisionHint: typeof parsed.decisionHint === "string" ? parsed.decisionHint : "",
  };
}

// Adversarial stress test of the verdict: an independent critic mounts the
// strongest objection from the debate and judges whether the recommendation
// survives. Makes the rigor visible — something a hidden one-shot answer can't
// show. Returns null on failure so the verdict still renders without it.
async function generateVerdictCritique(apiKey, authToken, viaProxy, recommendation, allRounds, topic, sessionId) {
  const roundText = allRounds
    .map((round, i) => {
      const msgs = round.messages.map((m) => {
        const name = MODELS.find((x) => x.id === m.modelId)?.name ?? m.modelId;
        return `[${name}] ${m.text || "(エラー)"}`;
      }).join("\n\n");
      return `【Round ${i + 1}】\n${msgs}`;
    })
    .join("\n\n---\n\n");
  const userMsg = `【議題】${topic}\n\n【検証対象の最終推奨】\n${recommendation}\n\n【議論の記録】\n${roundText}\n\nJSON形式で出力してください。`;
  try {
    const text = await callGPTMini(apiKey, authToken, viaProxy, finalVerdictCritiquePromptText, userMsg, sessionId, allRounds.length);
    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(cleaned);
    if (!parsed || typeof parsed !== "object") return null;
    return {
      survives: ONE_OF(parsed.survives, ["yes", "partial", "no"], "partial"),
      strongestObjection: typeof parsed.strongestObjection === "string" ? parsed.strongestObjection : "",
      weakness: typeof parsed.weakness === "string" ? parsed.weakness : "",
      fix: typeof parsed.fix === "string" ? parsed.fix : "",
    };
  } catch {
    return null;
  }
}

// Build the cloud-sync payload from current discussion state.
// Intentionally excludes profile, constitution, and API keys — only the
// discussion artifact itself is uploaded. (Personas are part of the
// discussion record because they affect the message content.)
function buildCloudPayload(topic, discussion, summaries, mode, discussionMode, personas, conclusionTarget, research) {
  return {
    topic,
    data_json: JSON.stringify({
      discussion,
      summaries,
      mode,
      discussionMode,
      personas,
      conclusionTarget,
      researchPlan: research?.plan || null,
      researchReport: research?.report || "",
    }),
    tags: [],
  };
}

export default function useDiscussion({ keys, topic, profile, mode, discussionMode, setDiscussionMode, conclusionTarget, personas, constitution, contextDiscussions, attachments, setAttachments, summaryMode, authToken, isPremium, useOwnKeys, searchMode, cloudUpsertFn }) {
  // When a premium user opts to use their own keys, route all AI/summary/search
  // calls through the direct API path (their keys) instead of the plan proxy, so
  // nothing is charged to the monthly plan budget. `viaProxy` is the single
  // decision used everywhere a request is dispatched.
  const viaProxy = isPremium && !!authToken && !useOwnKeys;
  const [discussion, setDiscussion] = useState([]);
  const [summaries, setSummaries] = useState([]);
  const [detailedAnalyses, setDetailedAnalyses] = useState([]);
  const [running, setRunning]   = useState(false);
  const [started, setStarted]   = useState(false);
  const [intervention, setIntervention] = useState("");
  const [showIntervention, setShowIntervention] = useState(false);
  const [sidePanel, setSidePanel] = useState(false);
  const [actionPlan, setActionPlan] = useState(null);
  const [actionPlanLoading, setActionPlanLoading] = useState(false);
  const [verdict, setVerdict] = useState(null);
  const [verdictLoading, setVerdictLoading] = useState(false);
  const [discussionId, setDiscussionId] = useState(null);
  const [rollingSummary, setRollingSummary] = useState(null);
  // 調査モード state. `ledger` is derived from the rounds (each round stores the
  // facts it added), so reload and history load rebuild it instead of trusting
  // a separate blob.
  const [ledger, setLedger] = useState([]);
  const [openItems, setOpenItems] = useState([]);
  const [researchPlan, setResearchPlan] = useState(null);
  const [report, setReport] = useState("");
  const [reportLoading, setReportLoading] = useState(false);

  const abortRef = useRef(null);
  // Last search results, reused across rounds that don't search fresh (cost opt).
  const lastSearchSourcesRef = useRef([]);
  const bottomRef = useRef(null);
  const discussionRef = useRef(discussion);
  const summariesRef = useRef(summaries);
  const discussionIdRef = useRef(discussionId);
  const rollingSummaryRef = useRef(rollingSummary);
  const attachmentsRef = useRef(attachments);
  const summaryModeRef = useRef(summaryMode);
  const setAttachmentsRef = useRef(setAttachments);
  const ledgerRef = useRef(ledger);
  const openItemsRef = useRef(openItems);
  const researchPlanRef = useRef(researchPlan);
  const reportRef = useRef(report);

  useEffect(() => { discussionRef.current = discussion; }, [discussion]);
  useEffect(() => { summariesRef.current = summaries; }, [summaries]);
  useEffect(() => { discussionIdRef.current = discussionId; }, [discussionId]);
  useEffect(() => { rollingSummaryRef.current = rollingSummary; }, [rollingSummary]);
  useEffect(() => { attachmentsRef.current = attachments; }, [attachments]);
  useEffect(() => { summaryModeRef.current = summaryMode; }, [summaryMode]);
  useEffect(() => { setAttachmentsRef.current = setAttachments; }, [setAttachments]);
  useEffect(() => { ledgerRef.current = ledger; }, [ledger]);
  useEffect(() => { openItemsRef.current = openItems; }, [openItems]);
  useEffect(() => { researchPlanRef.current = researchPlan; }, [researchPlan]);
  useEffect(() => { reportRef.current = report; }, [report]);

  const cloudUpsertRef = useRef(cloudUpsertFn);
  useEffect(() => { cloudUpsertRef.current = cloudUpsertFn; }, [cloudUpsertFn]);

  const syncToCloud = useCallback((id, payload) => {
    const fn = cloudUpsertRef.current;
    if (!fn || !id || !payload) return;
    // Best-effort: never block the UI on cloud sync failures
    Promise.resolve(fn(id, payload)).catch(() => {});
  }, []);

  const autoSave = useCallback(() => {
    if (discussion.length > 0 && topic.trim()) {
      const research = { plan: researchPlan, report };
      saveDiscussion(topic, discussion, summaries, mode, discussionMode, personas, discussionId, conclusionTarget, research)
        .then((id) => {
          if (!discussionId) setDiscussionId(id);
          syncToCloud(id, buildCloudPayload(topic, discussion, summaries, mode, discussionMode, personas, conclusionTarget, research));
        })
        .catch(() => {});
    }
  }, [topic, discussion, summaries, mode, discussionMode, personas, discussionId, conclusionTarget, syncToCloud, researchPlan, report]);

  useEffect(() => {
    const handler = () => { autoSave(); };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [autoSave]);

  const runSummary = useCallback(async (roundMessages, roundNum, sessionId) => {
    if (!keys.chatgpt && !isPremium) return;
    setSummaries((s) => [...s, null]);
    try {
      // One call returns both the round summary and the updated rolling summary.
      const { round, rolling } = await generateCombinedSummary(keys.chatgpt, authToken, viaProxy, roundMessages, topic, roundNum, personas, rollingSummaryRef.current, sessionId);
      setSummaries((s) => {
        const next = [...s];
        next[roundNum - 1] = round;
        return next;
      });
      setRollingSummary(rolling);
    } catch {
      setSummaries((s) => {
        const next = [...s];
        next[roundNum - 1] = { agreements:[], disagreements:[], unresolved:[], positionChanges:[], error:true };
        return next;
      });
      setRollingSummary((prev) => prev ?? { error: true });
    }
  }, [keys.chatgpt, authToken, isPremium, useOwnKeys, topic, personas]);

  const runDetailedAnalysis = useCallback(async (roundIdx) => {
    if ((!keys.chatgpt && !isPremium) || detailedAnalyses[roundIdx]) return;
    setDetailedAnalyses((s) => { const next = [...s]; next[roundIdx] = null; return next; });
    try {
      const roundsUpTo = discussion.slice(0, roundIdx + 1);
      const analysis = await generateDetailedAnalysis(keys.chatgpt, authToken, viaProxy, roundsUpTo, topic, personas, discussionIdRef.current);
      setDetailedAnalyses((s) => { const next = [...s]; next[roundIdx] = analysis; return next; });
    } catch {
      setDetailedAnalyses((s) => { const next = [...s]; next[roundIdx] = { themes: [], consensus: [], unresolved: [], error: true }; return next; });
    }
  }, [keys.chatgpt, authToken, isPremium, useOwnKeys, topic, discussion, detailedAnalyses]);

  const runRound = useCallback(async (currentHistory, roundNum, userIntervention) => {
    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);
    setShowIntervention(false);
    setIntervention("");
    setVerdict(null); // a new round invalidates any prior final verdict

    const isConclusionRound = discussionMode === "conclusion";
    const isResearchRound = discussionMode === "research";
    const targetModels = isConclusionRound
      ? MODELS.filter((m) => m.id === (conclusionTarget || "claude"))
      : MODELS;

    // 調査モード: the plan is produced once, by the cheap summary model, and then
    // reused verbatim every round — it is what keeps the three AIs on disjoint
    // slices instead of all verifying the same first item.
    let plan = researchPlanRef.current;
    if (isResearchRound && !plan) {
      plan = await generateResearchPlan(
        (sys, user) => callGPTMini(keys.chatgpt, authToken, viaProxy, sys, user, discussionIdRef.current, 0),
        researchPlanPromptText,
        topic,
        profile,
        MODELS.map((m) => m.id),
      );
      if (controller.signal.aborted) { setRunning(false); abortRef.current = null; return; }
      researchPlanRef.current = plan;
      setResearchPlan(plan);
    }

    // Search modes (premium-only, skipped on conclusion rounds):
    //  - "shared":  Architecture B — one server-side search, same evidence
    //    injected into all three models.
    //  - "native":  each AI uses its own web search tool (different sources →
    //    richer debate). No shared injection.
    // Cost optimization (both modes): search only on Round 1 and after a user
    // intervention (focus shifts); other rounds carry context forward.
    // Web search runs only through the plan proxy (operator grounding); there is
    // no own-key search path, so it is disabled when using own keys.
    const canSearch = viaProxy && !isConclusionRound;
    const shouldSearchFreshRound = roundNum === 1 || !!(userIntervention && userIntervention.trim());
    // Native search runs per-AI this round only when fresh search is warranted;
    // reuse rounds rely on conversation history instead of new tool calls.
    // 調査モード always searches natively, every round: each AI works its own
    // lane, so a shared result set would be the wrong evidence for two of them,
    // and a round that cannot search cannot add a fact.
    const useNativeThisRound = canSearch && (isResearchRound || (searchMode === "native" && shouldSearchFreshRound));

    // Architecture B shared search. Cost optimization: only search fresh on
    // Round 1 and when the user intervenes; other rounds REUSE the last results
    // so we don't re-pay grounding calls + injection every round. The reused
    // block stays stable, so it also stays in the cacheable prefix.
    let searchContext = null;
    if (searchMode === "shared" && canSearch && !isResearchRound) {
      const shouldSearchFresh = shouldSearchFreshRound;
      if (shouldSearchFresh) {
        try {
          const queries = await generateSearchQueries(keys.chatgpt, authToken, viaProxy, topic, profile, userIntervention, discussionIdRef.current);
          if (queries.length && !controller.signal.aborted) {
            searchContext = await callProxySearch(authToken, queries, controller.signal, discussionIdRef.current);
          }
        } catch {
          searchContext = null;
        }
        if (Array.isArray(searchContext?.results) && searchContext.results.length) {
          lastSearchSourcesRef.current = searchContext.results;
        }
      } else if (lastSearchSourcesRef.current.length) {
        searchContext = { results: lastSearchSourcesRef.current };
      }
    }
    const searchSources = Array.isArray(searchContext?.results) ? searchContext.results : [];

    const initMessages = targetModels.map((m) => ({ modelId:m.id, text:"", error:null, loading:true }));
    setDiscussion((d) => [...d, { messages:initMessages, userIntervention, isConclusion: isConclusionRound, searchSources }]);

    const models = MODE_MODELS[mode];

    // Summarise attachments before the round if mode demands it. Sets summary
    // on the original attachment records so subsequent rounds reuse them and
    // the UI can show that a file was compressed.
    const effectiveAttachments = await ensureAttachmentSummaries({
      attachments: attachmentsRef.current,
      summaryMode: summaryModeRef.current,
      apiKey: keys.chatgpt,
      authToken,
      viaProxy,
      sessionId: discussionIdRef.current,
    });
    if (effectiveAttachments !== attachmentsRef.current && setAttachmentsRef.current) {
      setAttachmentsRef.current(effectiveAttachments);
    }

    // Same for all three AIs this round — built once, not per model.
    const research = isResearchRound
      ? {
          plan,
          ledgerIndex: ledgerIndex(ledgerRef.current),
          openItems: openItemsRef.current,
          // 0 when this round has no search path (own keys / 非Premium): the
          // prompt then tells the AI it cannot search, instead of inviting it
          // to fill the ledger from memory.
          searchBudget: useNativeThisRound ? RESEARCH_CONFIG.searchBudget : 0,
        }
      : undefined;
    // Research rounds need room for the ledger block after the tool calls; the
    // panel default (1500) truncates it mid-table.
    const callOpts = isResearchRound
      ? { searchMaxUses: RESEARCH_CONFIG.searchBudget, nativeFetch: true, maxTokens: RESEARCH_CONFIG.roundMaxTokens }
      : undefined;

    const results = await Promise.all(
      targetModels.map(async (model) => {
        const { sys, user, userCachePrefix, userVariable } = buildPrompt(model.id, topic, profile, currentHistory, roundNum, userIntervention, discussionMode, personas, constitution, contextDiscussions, summariesRef.current, rollingSummaryRef.current, effectiveAttachments, searchContext, useNativeThisRound, research);
        const tag = models[model.id].tag;
        // Pass userParts to Claude when the cacheable prefix is large enough to
        // benefit from cache_control: when there are attachments OR injected
        // search results (both live in the prefix and are stable across reuse
        // rounds). Otherwise the prefix is too small to be worth a cache block.
        // 調査モード always splits: the topic block is re-sent unchanged every
        // round and research runs several rounds, so the 1.25x write pays back
        // from round 2 (and is silently ignored if the prefix is under the
        // model's cache minimum).
        const hasSearch = Array.isArray(searchSources) && searchSources.length > 0;
        const userParts = ((effectiveAttachments && effectiveAttachments.length > 0) || hasSearch || isResearchRound)
          ? { cachePrefix: userCachePrefix, variable: userVariable }
          : undefined;

        const onChunk = (chunk) => {
          setDiscussion((d) => {
            const u = [...d];
            const last = { ...u[u.length - 1] };
            last.messages = last.messages.map((m) =>
              m.modelId === model.id ? { ...m, text:(m.text||"") + chunk } : m
            );
            u[u.length - 1] = last;
            return u;
          });
        };

        try {
          let text = "";
          const sig = controller.signal;
          if (viaProxy) {
            // Premium: server-side proxy (no API keys needed)
            const sid = discussionIdRef.current;
            if (model.id === "claude")  text = await callProxyClaude(authToken, tag, sys, user, onChunk, sig, sid, roundNum, userParts, useNativeThisRound, callOpts);
            if (model.id === "chatgpt") text = await callProxyChatGPT(authToken, tag, sys, user, onChunk, sig, sid, roundNum, useNativeThisRound, callOpts);
            if (model.id === "gemini")  text = await callProxyGemini(authToken, tag, sys, user, onChunk, sig, sid, roundNum, useNativeThisRound, callOpts);
          } else {
            // Free: direct API calls (user's own keys)
            if (model.id === "claude")  text = await callClaude(keys.claude, tag, sys, user, onChunk, sig, userParts, callOpts);
            if (model.id === "chatgpt") text = await callChatGPT(keys.chatgpt, tag, sys, user, onChunk, sig, callOpts);
            if (model.id === "gemini")  text = await callGemini(keys.gemini, tag, sys, user, onChunk, sig, callOpts);
          }
          return { modelId:model.id, text, error:null, loading:false };
        } catch (e) {
          const msg = controller.signal.aborted ? "停止しました" : e.message;
          return { modelId:model.id, text:"", error:msg, loading:false };
        }
      })
    );

    // 調査モード: pull each AI's 【台帳】 / 【未確認】 blocks out of its own turn.
    // Parsing client-side (rather than asking a summariser model to extract
    // them) keeps values verbatim — a paraphrased price or URL is worthless —
    // and adds no extra call to the round.
    const ledgerAdds = isResearchRound
      ? results.flatMap((r) => parseLedgerBlock(r.text, { modelId: r.modelId, round: roundNum }))
      : [];
    const roundOpenItems = isResearchRound
      ? results.flatMap((r) => parseOpenItems(r.text))
      : [];
    if (isResearchRound) {
      const nextLedger = mergeLedger(ledgerRef.current, ledgerAdds);
      ledgerRef.current = nextLedger;
      openItemsRef.current = roundOpenItems;
      setLedger(nextLedger);
      setOpenItems(roundOpenItems);
    }

    setDiscussion((d) => {
      const u = [...d];
      u[u.length - 1] = { ...u[u.length - 1], messages:results, ledgerAdds, openItems: roundOpenItems };
      return u;
    });

    setRunning(false);
    abortRef.current = null;

    if (!controller.signal.aborted) {
      setShowIntervention(true);
      // 中立まとめラウンドはサマリー生成をスキップ（3AI前提の機能のため）
      // 調査モードも同様。合意/対立/未解決の要約は調査の役に立たないうえ、
      // ラウンドごとに要約モデルの呼び出しが1回増えるだけになる。
      if (!isConclusionRound && !isResearchRound) {
        runSummary(results, roundNum, discussionIdRef.current);
      } else {
        // プレースホルダ（インデックス整合性のため）
        setSummaries((s) => [...s, null]);
      }
      const curDisc = discussionRef.current;
      const curSummaries = summariesRef.current;
      const curId = discussionIdRef.current;
      const researchState = { plan: researchPlanRef.current, report: reportRef.current };
      const newRound = { messages: results, userIntervention, isConclusion: isConclusionRound, searchSources, ledgerAdds, openItems: roundOpenItems };
      const finalDiscussion = curDisc.length > 0 ? [...curDisc.slice(0, -1), newRound] : [newRound];
      saveDiscussion(topic, finalDiscussion, curSummaries, mode, discussionMode, personas, curId, conclusionTarget, researchState)
        .then((id) => {
          if (!curId) setDiscussionId(id);
          syncToCloud(id, buildCloudPayload(topic, finalDiscussion, curSummaries, mode, discussionMode, personas, conclusionTarget, researchState));
        })
        .catch(() => {});
      // 結論ラウンド完了後は自動でstandardモードに戻す
      if (isConclusionRound && setDiscussionMode) {
        setDiscussionMode("standard");
      }
    }
  }, [mode, keys, topic, profile, discussionMode, setDiscussionMode, conclusionTarget, personas, constitution, contextDiscussions, runSummary, isPremium, authToken, useOwnKeys, searchMode, syncToCloud]);

  const resetResearch = () => {
    ledgerRef.current = [];
    openItemsRef.current = [];
    researchPlanRef.current = null;
    reportRef.current = "";
    setLedger([]); setOpenItems([]); setResearchPlan(null); setReport("");
  };

  // 最終レポート: one call, no tools, the ledger as the only source material.
  // This is the deliverable the panel never produced — the rounds gather facts,
  // this turns them into the document the topic actually asked for.
  const handleGenerateReport = async () => {
    if (reportLoading || running) return;
    const entries = ledgerRef.current;
    if (!entries.length) {
      setReport("台帳が空です。調査ラウンドを実行してから作成してください。");
      return;
    }
    setReportLoading(true);
    setReport("");
    const target = MODELS.find((m) => m.id === (conclusionTarget || "claude")) || MODELS[0];
    const tag = MODE_MODELS[mode][target.id].tag;
    const user = buildReportPrompt(topic, serializeLedger(entries), profile, constitution);
    const opts = { maxTokens: RESEARCH_CONFIG.reportMaxTokens };
    let full = "";
    const onChunk = (chunk) => { full += chunk; setReport((prev) => prev + chunk); };
    try {
      const sid = discussionIdRef.current;
      const turn = discussionRef.current.length || 1;
      if (viaProxy) {
        if (target.id === "claude")  await callProxyClaude(authToken, tag, researchReportPromptText, user, onChunk, undefined, sid, turn, undefined, false, opts);
        if (target.id === "chatgpt") await callProxyChatGPT(authToken, tag, researchReportPromptText, user, onChunk, undefined, sid, turn, false, opts);
        if (target.id === "gemini")  await callProxyGemini(authToken, tag, researchReportPromptText, user, onChunk, undefined, sid, turn, false, opts);
      } else {
        if (target.id === "claude")  await callClaude(keys.claude, tag, researchReportPromptText, user, onChunk, undefined, undefined, opts);
        if (target.id === "chatgpt") await callChatGPT(keys.chatgpt, tag, researchReportPromptText, user, onChunk, undefined, opts);
        if (target.id === "gemini")  await callGemini(keys.gemini, tag, researchReportPromptText, user, onChunk, undefined, opts);
      }
      // Persist as soon as it exists: a report is the session's deliverable and
      // must survive a reload without waiting for another round.
      reportRef.current = full;
      const curId = discussionIdRef.current;
      const researchState = { plan: researchPlanRef.current, report: full };
      if (curId && discussionRef.current.length) {
        saveDiscussion(topic, discussionRef.current, summariesRef.current, mode, discussionMode, personas, curId, conclusionTarget, researchState)
          .then((id) => syncToCloud(id, buildCloudPayload(topic, discussionRef.current, summariesRef.current, mode, discussionMode, personas, conclusionTarget, researchState)))
          .catch(() => {});
      }
    } catch (e) {
      setReport(`レポートの生成に失敗しました: ${e.message}`);
    } finally {
      setReportLoading(false);
    }
  };

  const handleStart = async () => {
    if (!topic.trim() || running) return;
    setDiscussion([]);
    setSummaries([]);
    setDetailedAnalyses([]);
    setRollingSummary(null);
    setActionPlan(null);
    setVerdict(null);
    resetResearch();
    lastSearchSourcesRef.current = [];
    setStarted(true);
    await runRound([], 1, "");
  };

  const handleNextRound = async () => {
    if (running) return;
    await runRound(discussion, discussion.length + 1, intervention);
  };

  const handleStop = () => { abortRef.current?.abort(); };

  const handleReset = () => {
    abortRef.current?.abort();
    if (discussion.length > 0 && topic.trim()) {
      const research = { plan: researchPlan, report };
      saveDiscussion(topic, discussion, summaries, mode, discussionMode, personas, discussionId, conclusionTarget, research)
        .then((id) => {
          syncToCloud(id, buildCloudPayload(topic, discussion, summaries, mode, discussionMode, personas, conclusionTarget, research));
        })
        .catch(() => {});
    }
    lastSearchSourcesRef.current = [];
    resetResearch();
    setDiscussion([]); setSummaries([]); setDetailedAnalyses([]); setRollingSummary(null); setActionPlan(null); setVerdict(null); setStarted(false); setShowIntervention(false); setSidePanel(false); setDiscussionId(null);
  };

  const handleGenerateActionPlan = async () => {
    if ((!keys.chatgpt && !isPremium) || actionPlanLoading) return;
    setActionPlanLoading(true);
    try {
      const userMsg = buildActionPlanPrompt(topic, discussion, summaries);
      const raw = await callGPTMini(keys.chatgpt, authToken, viaProxy, actionPlanPromptText, userMsg, discussionIdRef.current, discussion.length);
      setActionPlan(parseActionPlan(raw));
    } catch {
      setActionPlan({ conclusion: "生成に失敗しました", actions: [], risks: [], nextQuestion: "" });
    } finally {
      setActionPlanLoading(false);
    }
  };

  const handleGenerateVerdict = async (priorObjection) => {
    if ((!keys.chatgpt && !isPremium) || verdictLoading || discussion.length === 0) return;
    // priorObjection is a string only when invoked from the "re-judge" CTA;
    // the ↻ button passes a click event, which we must ignore here.
    const objection = typeof priorObjection === "string" ? priorObjection : "";
    setVerdictLoading(true);
    try {
      const base = await generateFinalVerdict(keys.chatgpt, authToken, viaProxy, discussion, topic, personas, discussionIdRef.current, objection);
      // Mark re-judged verdicts so the UI can show a "反論を反映済み" badge.
      const v = objection ? { ...base, rejudged: true } : base;
      setVerdict(v); // show the verdict immediately
      // Then stress-test it adversarially (best-effort; attaches when ready).
      const critique = await generateVerdictCritique(keys.chatgpt, authToken, viaProxy, v.recommendation, discussion, topic, discussionIdRef.current);
      if (critique) setVerdict({ ...v, critique });
    } catch {
      setVerdict({ recommendation: "生成に失敗しました。もう一度お試しください。", confidence: "low", resolved: [], caveats: [], decisionHint: "", error: true });
    } finally {
      setVerdictLoading(false);
    }
  };

  const loadFromHistory = (item, setTopic, setDiscussionMode, setPersonas, setConclusionTarget, setAttachments) => {
    if (!item?.topic || !Array.isArray(item.discussion)) return;
    setTopic(item.topic.slice(0, 2000));
    setDiscussion(item.discussion);
    setSummaries(Array.isArray(item.summaries) ? item.summaries : []);
    // 調査モード: the ledger is derived state — rebuild it from the rounds so a
    // loaded session can keep researching (and report) from where it stopped.
    // Re-sanitize here, not only in history.js: the cloud path builds the item
    // by hand (HistoryPanel → handleLoadCloud) and never passes through
    // validateDiscussion, so this is the one place every restore path crosses.
    // sanitizeLedger is also what guarantees `url` is http(s) — the ledger's
    // URLs are rendered as links in the panel and in the HTML export.
    const rebuilt = item.discussion.reduce((acc, r) => mergeLedger(acc, sanitizeLedger(r?.ledgerAdds)), []);
    const lastOpen = sanitizeOpenItems(
      [...item.discussion].reverse().find((r) => (r?.openItems || []).length)?.openItems,
    );
    ledgerRef.current = rebuilt;
    openItemsRef.current = lastOpen;
    researchPlanRef.current = item.researchPlan || null;
    reportRef.current = typeof item.researchReport === "string" ? item.researchReport.slice(0, 60000) : "";
    setLedger(rebuilt);
    setOpenItems(lastOpen);
    setResearchPlan(item.researchPlan || null);
    setReport(reportRef.current);
    setDiscussionMode(item.discussionMode || "standard");
    if (setConclusionTarget) {
      setConclusionTarget(["claude", "chatgpt", "gemini"].includes(item.conclusionTarget) ? item.conclusionTarget : "claude");
    }
    setPersonas(item.personas && typeof item.personas === "object"
      ? { claude: item.personas.claude || "", chatgpt: item.personas.chatgpt || "", gemini: item.personas.gemini || "" }
      : { claude:"", chatgpt:"", gemini:"" });
    // Attachments are session-scoped (their text is consumed by past rounds
    // already in the saved discussion). Clear on load so the next round
    // doesn't re-inject stale file context.
    if (setAttachments) setAttachments([]);
    setDiscussionId(item.id || null);
    setVerdict(null);
    setActionPlan(null);
    setStarted(true);
    setShowIntervention(true);
  };

  return {
    discussion, summaries, detailedAnalyses, rollingSummary,
    running, started, intervention, setIntervention, showIntervention,
    sidePanel, setSidePanel,
    actionPlan, actionPlanLoading,
    // 調査モードの状態はひとまとめで返す（個別に7つ返すとApp側の受け渡しが散る）
    research: { plan: researchPlan, ledger, openItems, report, reportLoading, generateReport: handleGenerateReport },
    verdict, verdictLoading, handleGenerateVerdict,
    bottomRef,
    handleStart, handleNextRound, handleStop, handleReset,
    handleGenerateActionPlan, runDetailedAnalysis, loadFromHistory,
  };
}
