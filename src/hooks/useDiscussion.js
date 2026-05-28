import { useState, useRef, useCallback, useEffect } from "react";
import { MODELS, MODE_MODELS } from "../constants";
import { SUMMARY_MODEL } from "../models.config";
import { buildPrompt } from "../prompt";
import { callClaude, callChatGPT, callGemini } from "../api";
import { callProxyClaude, callProxyChatGPT, callProxyGemini } from "../apiProxy";
import { saveDiscussion } from "../history";
import { buildActionPlanPrompt, parseActionPlan } from "../actionPlan";
import { shouldSummarize } from "../lib/fileParser";
import actionPlanPromptText from "../prompts/action-plan.txt?raw";
import summaryPromptText from "../prompts/summary.txt?raw";
import rollingSummaryPromptText from "../prompts/rolling-summary.txt?raw";
import detailedPromptText from "../prompts/detailed-analysis.txt?raw";

const ATTACHMENT_SUMMARY_SYSTEM =
  "あなたは資料を議論用に要約するアシスタントです。重要な数値・固有名詞・主張は省略せず、引用可能な形で簡潔にまとめます。";

function buildAttachmentSummaryUser(name, text) {
  return `ファイル名: ${name}\n以下の内容を、議論で参照しやすいよう 600〜800字程度で要約してください。重要な数値・固有名詞・主張は省略せず保持してください。元の文書の意図と論点を残してください。\n\n${text}`;
}

async function callGPTMini(apiKey, authToken, isPremium, sys, user, sessionId, turnNumber) {
  if (isPremium && authToken) {
    return await callProxyChatGPT(authToken, SUMMARY_MODEL, sys, user, () => {}, undefined, sessionId, turnNumber);
  }
  return await callChatGPT(apiKey, SUMMARY_MODEL, sys, user, () => {});
}

// Returns a new attachments array with `summary` filled in on any items that
// were not already summarised. Returns the same reference (===) when nothing
// changed so callers can avoid extra renders. Falls back to the original
// attachment on individual summary failures — degraded but never blocking.
async function ensureAttachmentSummaries({ attachments, summaryMode, apiKey, authToken, isPremium, sessionId }) {
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
      const summary = await callGPTMini(apiKey, authToken, isPremium, sys, user, sessionId, 0);
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

async function generateSummary(apiKey, authToken, isPremium, messages, topic, roundNum, personas, sessionId) {
  const roundText = messages
    .map((m) => {
      const name = MODELS.find((x) => x.id === m.modelId)?.name ?? m.modelId;
      const p = (personas?.[m.modelId] || "").trim();
      return `[${p ? `${name}（${p}）` : name}] ${m.text || "(エラー)"}`;
    })
    .join("\n\n");

  const userMsg = `【議題】${topic}\n【Round ${roundNum}の発言】\n${roundText}\n\nJSON形式で出力してください。`;

  const tryOnce = async () => {
    const text = await callGPTMini(apiKey, authToken, isPremium, summaryPromptText, userMsg, sessionId, roundNum);
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
  return {
    agreements: Array.isArray(parsed.agreements) ? parsed.agreements : [],
    disagreements: Array.isArray(parsed.disagreements) ? parsed.disagreements : [],
    unresolved: Array.isArray(parsed.unresolved) ? parsed.unresolved : [],
    positionChanges: Array.isArray(parsed.positionChanges) ? parsed.positionChanges : [],
    stances: parsed.stances && typeof parsed.stances === "object" ? parsed.stances : {},
  };
}

async function generateRollingSummary(apiKey, authToken, isPremium, messages, topic, roundNum, personas, prevRolling, sessionId) {
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

  const text = await callGPTMini(apiKey, authToken, isPremium, rollingSummaryPromptText, userMsg, sessionId, roundNum);
  const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  const parsed = JSON.parse(cleaned);
  if (!parsed || typeof parsed !== "object") throw new Error("Invalid rolling summary format");
  return {
    agreements: Array.isArray(parsed.agreements) ? parsed.agreements : [],
    disagreements: Array.isArray(parsed.disagreements) ? parsed.disagreements : [],
    unresolved: Array.isArray(parsed.unresolved) ? parsed.unresolved : [],
    stances: parsed.stances && typeof parsed.stances === "object" ? parsed.stances : {},
  };
}

async function generateDetailedAnalysis(apiKey, authToken, isPremium, allRounds, topic, personas, sessionId) {
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

  const text = await callGPTMini(apiKey, authToken, isPremium, detailedPromptText, userMsg, sessionId, allRounds.length);
  const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  const parsed = JSON.parse(cleaned);
  if (!parsed || typeof parsed !== "object") throw new Error("Invalid analysis format");
  return {
    themes: Array.isArray(parsed.themes) ? parsed.themes : [],
    consensus: Array.isArray(parsed.consensus) ? parsed.consensus : [],
    unresolved: Array.isArray(parsed.unresolved) ? parsed.unresolved : [],
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

export default function useDiscussion({ keys, topic, profile, mode, discussionMode, setDiscussionMode, conclusionTarget, personas, constitution, contextDiscussions, attachments, setAttachments, summaryMode, authToken, isPremium, cloudUpsertFn }) {
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
  const [discussionId, setDiscussionId] = useState(null);
  const [rollingSummary, setRollingSummary] = useState(null);

  const abortRef = useRef(null);
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
      const summary = await generateSummary(keys.chatgpt, authToken, isPremium, roundMessages, topic, roundNum, personas, sessionId);
      setSummaries((s) => {
        const next = [...s];
        next[roundNum - 1] = summary;
        return next;
      });
      // Update rolling summary (cumulative) - non-blocking, falls back to per-round on failure
      generateRollingSummary(keys.chatgpt, authToken, isPremium, roundMessages, topic, roundNum, personas, rollingSummaryRef.current, sessionId)
        .then((rolling) => setRollingSummary(rolling))
        .catch(() => setRollingSummary((prev) => prev ?? { error: true }));
    } catch {
      setSummaries((s) => {
        const next = [...s];
        next[roundNum - 1] = { agreements:[], disagreements:[], unresolved:[], positionChanges:[], error:true };
        return next;
      });
    }
  }, [keys.chatgpt, authToken, isPremium, topic, personas]);

  const runDetailedAnalysis = useCallback(async (roundIdx) => {
    if ((!keys.chatgpt && !isPremium) || detailedAnalyses[roundIdx]) return;
    setDetailedAnalyses((s) => { const next = [...s]; next[roundIdx] = null; return next; });
    try {
      const roundsUpTo = discussion.slice(0, roundIdx + 1);
      const analysis = await generateDetailedAnalysis(keys.chatgpt, authToken, isPremium, roundsUpTo, topic, personas, discussionIdRef.current);
      setDetailedAnalyses((s) => { const next = [...s]; next[roundIdx] = analysis; return next; });
    } catch {
      setDetailedAnalyses((s) => { const next = [...s]; next[roundIdx] = { themes: [], consensus: [], unresolved: [], error: true }; return next; });
    }
  }, [keys.chatgpt, authToken, isPremium, topic, discussion, detailedAnalyses]);

  const runRound = useCallback(async (currentHistory, roundNum, userIntervention) => {
    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);
    setShowIntervention(false);
    setIntervention("");

    const isConclusionRound = discussionMode === "conclusion";
    const targetModels = isConclusionRound
      ? MODELS.filter((m) => m.id === (conclusionTarget || "claude"))
      : MODELS;

    const initMessages = targetModels.map((m) => ({ modelId:m.id, text:"", error:null, loading:true }));
    setDiscussion((d) => [...d, { messages:initMessages, userIntervention, isConclusion: isConclusionRound }]);

    const models = MODE_MODELS[mode];

    // Summarise attachments before the round if mode demands it. Sets summary
    // on the original attachment records so subsequent rounds reuse them and
    // the UI can show that a file was compressed.
    const effectiveAttachments = await ensureAttachmentSummaries({
      attachments: attachmentsRef.current,
      summaryMode: summaryModeRef.current,
      apiKey: keys.chatgpt,
      authToken,
      isPremium,
      sessionId: discussionIdRef.current,
    });
    if (effectiveAttachments !== attachmentsRef.current && setAttachmentsRef.current) {
      setAttachmentsRef.current(effectiveAttachments);
    }

    const results = await Promise.all(
      targetModels.map(async (model) => {
        const { sys, user, userCachePrefix, userVariable } = buildPrompt(model.id, topic, profile, currentHistory, roundNum, userIntervention, discussionMode, personas, constitution, contextDiscussions, summariesRef.current, rollingSummaryRef.current, effectiveAttachments);
        const tag = models[model.id].tag;
        // Only pass userParts to Claude when there are attachments — otherwise
        // the prefix isn't large enough to benefit from cache_control and adds
        // unnecessary block overhead.
        const userParts = (effectiveAttachments && effectiveAttachments.length > 0)
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
          if (isPremium && authToken) {
            // Premium: server-side proxy (no API keys needed)
            const sid = discussionIdRef.current;
            if (model.id === "claude")  text = await callProxyClaude(authToken, tag, sys, user, onChunk, sig, sid, roundNum, userParts);
            if (model.id === "chatgpt") text = await callProxyChatGPT(authToken, tag, sys, user, onChunk, sig, sid, roundNum);
            if (model.id === "gemini")  text = await callProxyGemini(authToken, tag, sys, user, onChunk, sig, sid, roundNum);
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
      const newRound = { messages: results, userIntervention, isConclusion: isConclusionRound };
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
  }, [mode, keys, topic, profile, discussionMode, setDiscussionMode, conclusionTarget, personas, constitution, contextDiscussions, runSummary, isPremium, authToken, syncToCloud]);

  const handleStart = async () => {
    if (!topic.trim() || running) return;
    setDiscussion([]);
    setSummaries([]);
    setDetailedAnalyses([]);
    setRollingSummary(null);
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
    setDiscussion([]); setSummaries([]); setDetailedAnalyses([]); setRollingSummary(null); setActionPlan(null); setStarted(false); setShowIntervention(false); setSidePanel(false); setDiscussionId(null);
  };

  const handleGenerateActionPlan = async () => {
    if ((!keys.chatgpt && !isPremium) || actionPlanLoading) return;
    setActionPlanLoading(true);
    try {
      const userMsg = buildActionPlanPrompt(topic, discussion, summaries);
      const raw = await callGPTMini(keys.chatgpt, authToken, isPremium, actionPlanPromptText, userMsg, discussionIdRef.current, discussion.length);
      setActionPlan(parseActionPlan(raw));
    } catch {
      setActionPlan({ conclusion: "生成に失敗しました", actions: [], risks: [], nextQuestion: "" });
    } finally {
      setActionPlanLoading(false);
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
    setStarted(true);
    setShowIntervention(true);
  };

  return {
    discussion, summaries, detailedAnalyses,
    running, started, intervention, setIntervention, showIntervention,
    sidePanel, setSidePanel,
    actionPlan, actionPlanLoading,
    bottomRef,
    handleStart, handleNextRound, handleStop, handleReset,
    handleGenerateActionPlan, runDetailedAnalysis, loadFromHistory,
  };
}
