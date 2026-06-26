import { useState, useRef, useCallback, useEffect } from "react";
import { MODELS, MODE_MODELS } from "../constants";
import { SUMMARY_MODEL } from "../models.config";
import { buildPrompt } from "../prompt";
import { callClaude, callChatGPT, callGemini } from "../api";
import { callProxyClaude, callProxyChatGPT, callProxyGemini, callProxySearch } from "../apiProxy";
import { saveDiscussion } from "../history";
import { buildActionPlanPrompt, parseActionPlan } from "../actionPlan";
import { shouldSummarize } from "../lib/fileParser";
import actionPlanPromptText from "../prompts/action-plan.txt?raw";
import combinedSummaryPromptText from "../prompts/combined-summary.txt?raw";
import detailedPromptText from "../prompts/detailed-analysis.txt?raw";
import finalVerdictPromptText from "../prompts/final-verdict.txt?raw";

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

async function generateFinalVerdict(apiKey, authToken, viaProxy, allRounds, topic, personas, sessionId) {
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

// Build the cloud-sync payload from current discussion state.
// Intentionally excludes profile, constitution, and API keys — only the
// discussion artifact itself is uploaded. (Personas are part of the
// discussion record because they affect the message content.)
function buildCloudPayload(topic, discussion, summaries, mode, discussionMode, personas, conclusionTarget) {
  return {
    topic,
    data_json: JSON.stringify({
      discussion,
      summaries,
      mode,
      discussionMode,
      personas,
      conclusionTarget,
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

  useEffect(() => { discussionRef.current = discussion; }, [discussion]);
  useEffect(() => { summariesRef.current = summaries; }, [summaries]);
  useEffect(() => { discussionIdRef.current = discussionId; }, [discussionId]);
  useEffect(() => { rollingSummaryRef.current = rollingSummary; }, [rollingSummary]);
  useEffect(() => { attachmentsRef.current = attachments; }, [attachments]);
  useEffect(() => { summaryModeRef.current = summaryMode; }, [summaryMode]);
  useEffect(() => { setAttachmentsRef.current = setAttachments; }, [setAttachments]);

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
      saveDiscussion(topic, discussion, summaries, mode, discussionMode, personas, discussionId, conclusionTarget)
        .then((id) => {
          if (!discussionId) setDiscussionId(id);
          syncToCloud(id, buildCloudPayload(topic, discussion, summaries, mode, discussionMode, personas, conclusionTarget));
        })
        .catch(() => {});
    }
  }, [topic, discussion, summaries, mode, discussionMode, personas, discussionId, conclusionTarget, syncToCloud]);

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
    const targetModels = isConclusionRound
      ? MODELS.filter((m) => m.id === (conclusionTarget || "claude"))
      : MODELS;

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
    const useNativeThisRound = canSearch && searchMode === "native" && shouldSearchFreshRound;

    // Architecture B shared search. Cost optimization: only search fresh on
    // Round 1 and when the user intervenes; other rounds REUSE the last results
    // so we don't re-pay grounding calls + injection every round. The reused
    // block stays stable, so it also stays in the cacheable prefix.
    let searchContext = null;
    if (searchMode === "shared" && canSearch) {
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

    const results = await Promise.all(
      targetModels.map(async (model) => {
        const { sys, user, userCachePrefix, userVariable } = buildPrompt(model.id, topic, profile, currentHistory, roundNum, userIntervention, discussionMode, personas, constitution, contextDiscussions, summariesRef.current, rollingSummaryRef.current, effectiveAttachments, searchContext, useNativeThisRound);
        const tag = models[model.id].tag;
        // Pass userParts to Claude when the cacheable prefix is large enough to
        // benefit from cache_control: when there are attachments OR injected
        // search results (both live in the prefix and are stable across reuse
        // rounds). Otherwise the prefix is too small to be worth a cache block.
        const hasSearch = Array.isArray(searchSources) && searchSources.length > 0;
        const userParts = ((effectiveAttachments && effectiveAttachments.length > 0) || hasSearch)
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
            if (model.id === "claude")  text = await callProxyClaude(authToken, tag, sys, user, onChunk, sig, sid, roundNum, userParts, useNativeThisRound);
            if (model.id === "chatgpt") text = await callProxyChatGPT(authToken, tag, sys, user, onChunk, sig, sid, roundNum, useNativeThisRound);
            if (model.id === "gemini")  text = await callProxyGemini(authToken, tag, sys, user, onChunk, sig, sid, roundNum, useNativeThisRound);
          } else {
            // Free: direct API calls (user's own keys)
            if (model.id === "claude")  text = await callClaude(keys.claude, tag, sys, user, onChunk, sig, userParts);
            if (model.id === "chatgpt") text = await callChatGPT(keys.chatgpt, tag, sys, user, onChunk, sig);
            if (model.id === "gemini")  text = await callGemini(keys.gemini, tag, sys, user, onChunk, sig);
          }
          return { modelId:model.id, text, error:null, loading:false };
        } catch (e) {
          const msg = controller.signal.aborted ? "停止しました" : e.message;
          return { modelId:model.id, text:"", error:msg, loading:false };
        }
      })
    );

    setDiscussion((d) => {
      const u = [...d];
      u[u.length - 1] = { ...u[u.length - 1], messages:results };
      return u;
    });

    setRunning(false);
    abortRef.current = null;

    if (!controller.signal.aborted) {
      setShowIntervention(true);
      // 結論まとめラウンドはサマリー生成をスキップ（3AI前提の機能のため）
      if (!isConclusionRound) {
        runSummary(results, roundNum, discussionIdRef.current);
      } else {
        // プレースホルダ（インデックス整合性のため）
        setSummaries((s) => [...s, null]);
      }
      const curDisc = discussionRef.current;
      const curSummaries = summariesRef.current;
      const curId = discussionIdRef.current;
      const newRound = { messages: results, userIntervention, isConclusion: isConclusionRound, searchSources };
      const finalDiscussion = curDisc.length > 0 ? [...curDisc.slice(0, -1), newRound] : [newRound];
      saveDiscussion(topic, finalDiscussion, curSummaries, mode, discussionMode, personas, curId, conclusionTarget)
        .then((id) => {
          if (!curId) setDiscussionId(id);
          syncToCloud(id, buildCloudPayload(topic, finalDiscussion, curSummaries, mode, discussionMode, personas, conclusionTarget));
        })
        .catch(() => {});
      // 結論ラウンド完了後は自動でstandardモードに戻す
      if (isConclusionRound && setDiscussionMode) {
        setDiscussionMode("standard");
      }
    }
  }, [mode, keys, topic, profile, discussionMode, setDiscussionMode, conclusionTarget, personas, constitution, contextDiscussions, runSummary, isPremium, authToken, useOwnKeys, searchMode, syncToCloud]);

  const handleStart = async () => {
    if (!topic.trim() || running) return;
    setDiscussion([]);
    setSummaries([]);
    setDetailedAnalyses([]);
    setRollingSummary(null);
    setActionPlan(null);
    setVerdict(null);
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
      saveDiscussion(topic, discussion, summaries, mode, discussionMode, personas, discussionId, conclusionTarget)
        .then((id) => {
          syncToCloud(id, buildCloudPayload(topic, discussion, summaries, mode, discussionMode, personas, conclusionTarget));
        })
        .catch(() => {});
    }
    lastSearchSourcesRef.current = [];
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

  const handleGenerateVerdict = async () => {
    if ((!keys.chatgpt && !isPremium) || verdictLoading || discussion.length === 0) return;
    setVerdictLoading(true);
    try {
      const v = await generateFinalVerdict(keys.chatgpt, authToken, viaProxy, discussion, topic, personas, discussionIdRef.current);
      setVerdict(v);
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
    verdict, verdictLoading, handleGenerateVerdict,
    bottomRef,
    handleStart, handleNextRound, handleStop, handleReset,
    handleGenerateActionPlan, runDetailedAnalysis, loadFromHistory,
  };
}
