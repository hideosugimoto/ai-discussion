import { useState, useEffect, lazy, Suspense } from "react";
import { MODELS, MODE_MODELS, DISCUSSION_MODES, INTERVENTION_QUICKFILLS } from "./constants";
import { PLACEHOLDER_ROTATION } from "./suggestedQuestions";
import SuggestedQuestions from "./components/SuggestedQuestions";
import { saveSettings } from "./storage";
import RoundSection from "./components/RoundSection";
import useKeyValidation from "./hooks/useKeyValidation";
import { downloadMarkdown, downloadHtml } from "./export";
import useSettings from "./hooks/useSettings";
import useCryptoBackup from "./hooks/useCryptoBackup";
import useDiscussion from "./hooks/useDiscussion";
import useAuth from "./hooks/useAuth";
import useUsage from "./hooks/useUsage";
import useRoundEstimate from "./hooks/useRoundEstimate";
import useCloudHistory from "./hooks/useCloudHistory";
import useShare from "./hooks/useShare";
import useBilling from "./hooks/useBilling";
import Onboarding from "./components/Onboarding";
import ConsensusCard from "./components/ConsensusCard";
import FinalVerdict from "./components/FinalVerdict";
import DiscussionHeader from "./components/DiscussionHeader";
import ExpandedPanels from "./components/ExpandedPanels";
import HelpHint from "./components/HelpHint";
import PlanBadge from "./components/PlanBadge";
import UsagePill from "./components/UsagePill";
import AuthBar from "./components/AuthBar";
import FileAttachment from "./components/FileAttachment";
import { useHelp } from "./hooks/useHelp.jsx";
import { pts } from "./lib/consensus";
import { drawConsensusImage, downloadCanvasPng } from "./lib/shareImage";

const SummaryPanel = lazy(() => import("./components/SummaryPanel"));
const HistoryPanel = lazy(() => import("./components/HistoryPanel"));
const PersonaPanel = lazy(() => import("./components/PersonaPanel"));
const ActionPlanView = lazy(() => import("./components/ActionPlanView"));
const SharedView = lazy(() => import("./components/SharedView"));
const ShareDialog = lazy(() => import("./components/ShareDialog"));
const DemoView = lazy(() => import("./components/DemoView"));

export default function App() {
  const [theme, setTheme] = useState(() => localStorage.getItem("ai-discussion-theme") || "dark");

  // Detect ?share=ID in URL → enter shared-view mode
  const [shareViewId, setShareViewId] = useState(() => {
    const url = new URL(window.location.href);
    return url.searchParams.get("share");
  });

  // Read-only sample-discussion preview ("try before you buy").
  const [showDemo, setShowDemo] = useState(false);

  const exitShareView = () => {
    setShareViewId(null);
    const url = new URL(window.location.href);
    url.searchParams.delete("share");
    window.history.replaceState({}, "", url.pathname + url.search);
  };

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("ai-discussion-theme", theme);
  }, [theme]);

  const auth = useAuth();
  const { usage, fetchUsage } = useUsage(auth.token);
  const cloudHistory = useCloudHistory(auth.isPremium ? auth.token : null);
  const share = useShare(auth.isPremium ? auth.token : null);
  const [shareDialog, setShareDialog] = useState(null); // null | "creating" | { url } | { error }
  const help = useHelp();

  const settings = useSettings();
  const { keys, saveKeys, profile, profileUpdatedAt, profileNotice, constitution,
          searchMode, setSearchMode,
          preferOwnKeys, setPreferOwnKeys,
          updateKey, toggleSaveKeys, updateProfile, updateConstitution, dismissProfileNotice,
          allKeysSet } = settings;

  // Premium users with all three keys set can opt to spend their own API keys
  // instead of the plan budget. Only effective when keys are complete, so the
  // direct-call path never fails on a missing key.
  const useOwnKeys = auth.isPremium && preferOwnKeys && allKeysSet;

  const [topic, setTopic]       = useState("");
  // Default to "fast": good quality at ~1/3 the cost, so casual use doesn't burn
  // the monthly budget. "best" is an opt-in per session — NOT persisted, so a
  // reload (or reset/clear) returns to "fast".
  const [mode, setMode]         = useState("fast");
  // Adaptive "remaining rounds" estimate (per mode), learned from actual usage.
  const roundEstimate = useRoundEstimate(usage, mode);
  // Don't auto-open the API-keys panel on first load: showing 3 empty key
  // fields before any value is shown was the biggest first-impression wall.
  // New users get the Onboarding card instead (value + login / keys paths).
  const [activePanel, setActivePanel] = useState(null);
  const togglePanel = (id) => setActivePanel((p) => p === id ? null : id);
  const [discussionMode, setDiscussionMode] = useState("standard");
  const [conclusionTarget, setConclusionTarget] = useState("claude");
  const [personas, setPersonas] = useState({ claude:"", chatgpt:"", gemini:"" });
  const [contextDiscussions, setContextDiscussions] = useState([]); // 過去議論コンテキスト（最大3件）
  const [attachments, setAttachments] = useState([]); // 添付ファイル（議題への追加コンテキスト）
  const [summaryMode, setSummaryMode] = useState("auto"); // "auto" | "on" | "off" — 添付の要約モード
  const [placeholderIdx, setPlaceholderIdx] = useState(() => Math.floor(Math.random() * PLACEHOLDER_ROTATION.length));
  const [topicFocused, setTopicFocused] = useState(false);

  useEffect(() => {
    if (topic.trim() || topicFocused) return;
    const timer = setInterval(() => {
      setPlaceholderIdx((i) => (i + 1) % PLACEHOLDER_ROTATION.length);
    }, 4000);
    return () => clearInterval(timer);
  }, [topic, topicFocused]);

  const disc = useDiscussion({
    keys, topic, profile, mode, discussionMode, setDiscussionMode,
    conclusionTarget, personas, constitution, contextDiscussions,
    attachments, setAttachments, summaryMode,
    authToken: auth.token, isPremium: auth.isPremium, useOwnKeys,
    searchMode: auth.isPremium ? searchMode : "off",
    cloudUpsertFn: auth.isPremium ? cloudHistory.upsert : null,
  });
  const { discussion, summaries, detailedAnalyses, rollingSummary,
          running, started, intervention, setIntervention, showIntervention,
          sidePanel, setSidePanel,
          actionPlan, actionPlanLoading,
          verdict, verdictLoading, handleGenerateVerdict,
          bottomRef,
          handleStart: startDiscussion, handleNextRound, handleStop, handleReset,
          handleGenerateActionPlan, runDetailedAnalysis, loadFromHistory } = disc;

  // The "現在の到達点" card draws on the cumulative rolling summary when live;
  // for history-loaded discussions (no rolling) it falls back to the latest
  // per-round summary, whose stances/agreements approximate the current state.
  const consensusSummary = rollingSummary || [...summaries].reverse().find(Boolean) || null;

  const crypto = useCryptoBackup({
    keys, profile, saveKeys,
    setKeys: (fn) => { const next = fn(keys); for (const id of ["claude","chatgpt","gemini"]) updateKey(id, next[id]); },
    setProfile: (val) => updateProfile(val),
    persistSettings: (data) => saveSettings(data),
    onDone: () => setActivePanel(null),
  });

  const { status: keyStatus, validate: validateKey } = useKeyValidation();

  // Premium users don't need API keys
  const canStart = auth.isPremium || allKeysSet;

  // 自動追従スクロール: ユーザーが上にスクロールしたら停止、下端付近に戻ったら再開
  const [autoFollow, setAutoFollow] = useState(true);
  // 上部のコスト表示(PlanBadge)を過ぎてスクロールしたら使用量ピルを出す
  const [scrolledPastTop, setScrolledPastTop] = useState(false);
  useEffect(() => {
    const handleScroll = () => {
      const threshold = 100;
      const nearBottom = window.innerHeight + window.scrollY >= document.body.offsetHeight - threshold;
      setAutoFollow(nearBottom);
      setScrolledPastTop(window.scrollY > 160);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToTop = () => window.scrollTo({ top: 0, behavior: "smooth" });

  useEffect(() => {
    if (autoFollow) bottomRef.current?.scrollIntoView({ behavior:"smooth" });
  }, [discussion, bottomRef, autoFollow]);

  const scrollToLatest = () => {
    bottomRef.current?.scrollIntoView({ behavior:"smooth" });
    setAutoFollow(true);
  };

  // Fetch usage on login and after each round
  useEffect(() => {
    if (auth.isPremium) fetchUsage();
  }, [auth.isPremium, discussion.length, fetchUsage]);

  const handleStart = async () => {
    setActivePanel(null);
    await startDiscussion();
  };

  const handleResetInputs = () => {
    setTopic("");
    setMode("fast");
    setDiscussionMode("standard");
    setConclusionTarget("claude");
    setPersonas({ claude:"", chatgpt:"", gemini:"" });
    setContextDiscussions([]);
    setAttachments([]);
  };

  // Reset (end discussion) also returns the mode to the default "fast", so "best"
  // is never silently carried into the next discussion.
  const handleResetAll = () => {
    handleReset();
    setMode("fast");
  };

  const hasResettableState = !!(
    topic.trim() ||
    discussionMode !== "standard" ||
    conclusionTarget !== "claude" ||
    personas.claude || personas.chatgpt || personas.gemini ||
    contextDiscussions.length > 0 ||
    attachments.length > 0
  );

  const handleAddContext = (item) => {
    if (!item?.id) return;
    setContextDiscussions((prev) => {
      if (prev.some((d) => d.id === item.id)) return prev; // 重複無視
      if (prev.length >= 3) return prev; // 最大3件
      return [...prev, { id: item.id, topic: item.topic, summaries: item.summaries || [] }];
    });
    setActivePanel(null);
  };

  const handleRemoveContext = (id) => {
    setContextDiscussions((prev) => prev.filter((d) => d.id !== id));
  };

  const handleLoadHistory = (item) => {
    loadFromHistory(item, setTopic, setDiscussionMode, setPersonas, setConclusionTarget, setAttachments);
    setActivePanel(null);
  };

  const handleScrollToMessage = (quote) => {
    const els = document.querySelectorAll("[data-id^='msg-']");
    for (const el of els) {
      if (el.textContent?.includes(quote)) {
        el.scrollIntoView({ behavior:"smooth", block:"center" });
        el.style.outline = "2px solid var(--accent)";
        setTimeout(() => { el.style.outline = "none"; }, 2000);
        return;
      }
    }
  };

  const handleExportMd = () => { downloadMarkdown(topic, discussion, summaries, personas); };
  const handleExportHtml = () => { downloadHtml(topic, discussion, summaries, personas); };

  // Render the conclusion as a shareable PNG (OGP ratio) from the verdict +
  // consensus counts. Pure client-side canvas — no deps, no external fonts.
  const handleSaveVerdictImage = () => {
    const s = consensusSummary || {};
    const canvas = document.createElement("canvas");
    drawConsensusImage(canvas, {
      topic,
      recommendation: verdict?.recommendation || "",
      agree: pts(s.agreements).length,
      conflict: pts(s.disagreements).length,
      unresolved: pts(s.unresolved).length,
      confidence: verdict?.confidence,
    });
    downloadCanvasPng(canvas, `ai-discussion_結論_${new Date().toISOString().slice(0,10)}.png`);
  };

  const handleShare = async () => {
    if (!auth.isPremium) {
      window.alert("共有機能は Premium プラン限定です。");
      return;
    }
    if (!discussion.length) return;
    const confirmMsg =
      "この議論を共有リンクで公開します。\n\n" +
      "共有データに含まれるもの:\n" +
      "・議題\n" +
      "・各AIの発言本文\n" +
      "・ラウンドサマリー（合意/対立/未解決/立場変化）\n\n" +
      "共有データに含まれないもの:\n" +
      "・あなたのプロフィール\n" +
      "・各AIに設定したペルソナ\n" +
      "・議論の憲法（価値観）\n" +
      "・司会者として書いた介入文\n" +
      "・APIキー\n\n" +
      "URLを知っている人だけがアクセスできます（検索エンジンには載りません）。\n" +
      "共有しますか？";
    if (!window.confirm(confirmMsg)) return;

    setShareDialog("creating");
    try {
      const dataJson = JSON.stringify({
        discussion,
        summaries,
        mode,
        discussionMode,
      });
      const result = await share.create(topic, dataJson);
      const url = `${window.location.origin}/?share=${encodeURIComponent(result.id)}`;
      setShareDialog({ url });
      try {
        await navigator.clipboard.writeText(url);
      } catch {
        // clipboard may not be available; the URL is shown in the dialog anyway
      }
    } catch (e) {
      setShareDialog({ error: e.message });
    }
  };

  const cm = MODE_MODELS[mode];
  const latestSummary = summaries[summaries.length - 1] ?? null;

  const { startCheckout, startCreditPurchase } = useBilling({
    token: auth.token, isPremium: auth.isPremium, fetchUsage,
  });

  const keyConfigs = [
    { id:"claude",  label:"Anthropic API Key (Claude)", ph:"sk-ant-...",  link:"https://console.anthropic.com" },
    { id:"chatgpt", label:"OpenAI API Key (ChatGPT)",   ph:"sk-...",      link:"https://platform.openai.com/api-keys" },
    { id:"gemini",  label:"Google API Key (Gemini)",    ph:"AIza...",     link:"https://aistudio.google.com/apikey" },
  ];

  const validationColor = (id) => {
    const s = keyStatus[id];
    if (!s) return "var(--border)";
    if (s === "checking") return "var(--warning-bd)";
    if (s === "ok") return "var(--success-bg)";
    return "var(--error)";
  };

  // Shared-view mode (?share=ID): show read-only view of someone else's discussion.
  // Placed here AFTER all hooks to avoid violating React rules of hooks.
  if (shareViewId) {
    return <Suspense fallback={null}><SharedView shareId={shareViewId} onExit={exitShareView} /></Suspense>;
  }

  if (showDemo) {
    return <Suspense fallback={null}><DemoView onExit={() => setShowDemo(false)} onStart={() => setShowDemo(false)} /></Suspense>;
  }

  return (
    <Suspense fallback={null}>
    <div style={{ minHeight:"100vh", background:"var(--bg)", color:"var(--text)", display:"flex", flexDirection:"column", alignItems:"center", padding:"24px 16px 80px" }}>

      {/* Profile update notice */}
      {profileNotice && (
        <div style={{ width:"100%", maxWidth:720, marginBottom:12, padding:"10px 16px", background:"var(--warning-bg)", border:"1px solid var(--warning-bd)", borderRadius:8, display:"flex", justifyContent:"space-between", alignItems:"center", gap:12 }}>
          <span style={{ color:"var(--warning)", fontSize:13 }}>📅 プロフィールが{profileNotice}日間更新されていません。Claude.aiやChatGPTで最新情報を取得して更新することをおすすめします。</span>
          <button onClick={dismissProfileNotice} aria-label="通知を閉じる" style={{ background:"none", border:"none", color:"var(--warning)", cursor:"pointer", fontSize:16, padding:"0 4px", flexShrink:0 }}>✕</button>
        </div>
      )}

      <AuthBar auth={auth} usage={usage} />

      {/* Premium badge or loading */}
      {auth.planLoading && auth.user && (
        <div style={{ width:"100%", maxWidth:900, marginBottom:8, padding:"6px 14px", background:"var(--accent-bg)", border:"1px solid var(--accent-bd)", borderRadius:8, fontSize:12, color:"var(--accent-light)", textAlign:"center" }}>
          プラン情報を確認中...
        </div>
      )}
      {auth.isPremium && !auth.planLoading && (
        <PlanBadge plan={auth.plan} usage={usage} estimate={roundEstimate} token={auth.token} onCreditPurchase={startCreditPurchase} usingOwnKeys={useOwnKeys} />
      )}

      {/* Header (title + model badges + mode/theme/search toggles) */}
      <DiscussionHeader
        cm={cm}
        mode={mode} setMode={setMode}
        theme={theme} setTheme={setTheme}
        isPremium={auth.isPremium}
        searchMode={searchMode} setSearchMode={setSearchMode}
        useOwnKeys={useOwnKeys}
      />

      <div style={{ width:"100%", maxWidth:1400, padding:"0 8px" }}>

        {/* ── 初見オンボーディング（開始できない時＝キー未設定・非課金） ── */}
        {!canStart && !started && (
          <Onboarding
            isLoggedIn={!!auth.user}
            onLogin={auth.login}
            onUseKeys={() => togglePanel("keys")}
            onPickPlan={startCheckout}
            onTryDemo={() => setShowDemo(true)}
          />
        )}

        {/* ── 過去議論コンテキスト ── */}
        {!started && contextDiscussions.length > 0 && (
          <div style={{ marginBottom:10, padding:"10px 12px", background:"var(--accent-bg)", border:"1px solid var(--accent-bd)", borderRadius:10 }}>
            <div style={{ fontSize:11, color:"var(--text3)", marginBottom:6, display:"flex", alignItems:"center", gap:6 }}>
              <span>📎 文脈に含める過去議論（{contextDiscussions.length}/3）</span>
              <span style={{ fontSize:10 }}>— 各AIに要約だけ伝わります</span>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
              {contextDiscussions.map((d) => (
                <div key={d.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"6px 10px", background:"var(--bg)", borderRadius:6, fontSize:12 }}>
                  <span style={{ color:"var(--text)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", flex:1 }}>{d.topic}</span>
                  <button
                    onClick={() => handleRemoveContext(d.id)}
                    aria-label="文脈から外す"
                    style={{ background:"none", border:"none", color:"var(--text3)", cursor:"pointer", fontSize:14, padding:"0 6px", marginLeft:6 }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── 議題入力 ── */}
        {!started && (
          <div style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:10, overflow:"hidden", marginBottom:16 }}>
            <textarea value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={2000} aria-label="議題"
              onKeyDown={(e) => { if (e.key==="Enter"&&(e.metaKey||e.ctrlKey)) handleStart(); }}
              onFocus={() => setTopicFocused(true)} onBlur={() => setTopicFocused(false)}
              placeholder={`議題を入力... (Ctrl+Enter で開始)\n例: ${PLACEHOLDER_ROTATION[placeholderIdx]}\n💡 下の「おすすめ質問」から選ぶこともできます`} rows={3}
              style={{ width:"100%", background:"transparent", border:"none", padding:14, color:"var(--text)", fontSize:14, lineHeight:1.7, resize:"vertical" }} />
            <FileAttachment
              attachments={attachments} setAttachments={setAttachments}
              disabled={running}
              summaryMode={summaryMode} setSummaryMode={setSummaryMode}
            />
            <div style={{ padding:"8px 12px", borderTop:"1px solid var(--border)", display:"flex", justifyContent:"space-between", alignItems:"center", gap:8 }}>
              <span style={{ fontSize:11, color:profile.trim()?"var(--success)":"var(--text3)" }}>{profile.trim()?"👤 プロフィールあり":"👤 なし"}</span>
              <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                {hasResettableState && (
                  <button onClick={handleResetInputs} aria-label="議題・モード・ペルソナをクリア"
                    title="今回の入力（議題・議論モード・ペルソナ・文脈）だけ初期化。APIキー・プロフィール・憲法は保持"
                    style={{ background:"none", border:"1px solid var(--border)", borderRadius:8, padding:"8px 12px", color:"var(--text3)", fontSize:11, cursor:"pointer" }}>
                    ↺ クリア
                  </button>
                )}
                <button onClick={handleStart} disabled={!topic.trim()||running||!canStart}
                  style={{ background:canStart&&topic.trim()?"var(--accent)":"var(--surface)", border:"1px solid var(--border)", borderRadius:8, padding:"8px 20px", color:canStart&&topic.trim()?"#fff":"var(--text3)", fontSize:13, fontWeight:700, cursor:(topic.trim()&&canStart)?"pointer":"not-allowed", opacity:(topic.trim()&&canStart)?1:0.35 }}>
                  {!canStart?"キーを設定またはログイン":"▶ 開始"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── オプション設定 ── */}
        {!started && (
          <div style={{ marginBottom:16 }}>
            <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:6 }}>
              {[
                { id:"keys",    label:"🔑 APIキー", badge:allKeysSet?"✓":"⚠" },
                { id:"profile", label:"👤 プロフィール", badge:profile.trim()?"✓":null },
                { id:"suggest", label:"💡 おすすめ質問" },
                { id:"history", label:"📂 履歴" },
              ].map(({id,label,badge}) => (
                <button key={id} onClick={() => togglePanel(id)}
                  style={{ padding:"5px 12px", border:`1px solid ${activePanel===id?"var(--accent-bd)":"var(--border)"}`, borderRadius:8, cursor:"pointer", fontSize:11, fontFamily:"monospace", background:activePanel===id?"var(--accent-bg)":"transparent", color:activePanel===id?"var(--text)":"var(--text2)", display:"flex", alignItems:"center", gap:4 }}>
                  <span>{label}</span>
                  {badge && <span style={{ fontSize:10, color:badge==="✓"?"var(--success)":"var(--warning)" }}>{badge}</span>}
                </button>
              ))}
              <button onClick={() => toggleSaveKeys(!saveKeys)} aria-label={`ブラウザ保存 ${saveKeys?"OFF":"ON"}に切り替え`}
                title={saveKeys ? "APIキー・プロフィールをブラウザに保存中（クリックでOFFに）" : "ONにするとAPIキー・プロフィールをブラウザのlocalStorageに保存"}
                style={{ padding:"5px 12px", border:`1px solid ${saveKeys?"var(--success)":"var(--border)"}`, borderRadius:8, cursor:"pointer", fontSize:11, fontFamily:"monospace", background:saveKeys?"var(--success)":"transparent", color:saveKeys?"#fff":"var(--text2)", display:"flex", alignItems:"center", gap:4 }}>
                <span>{saveKeys ? "💾 保存ON" : "💾 保存OFF"}</span>
              </button>
            </div>
            {saveKeys && (
              <div style={{ fontSize:11, color:"var(--text3)", marginBottom:6 }}>
                APIキーとプロフィールをこのブラウザに保存中（localStorage）
              </div>
            )}
            <HelpHint>
              保存ON/OFF = APIキーとプロフィールをブラウザに残すかどうか。共用PCではOFF推奨。データは外部に送信されません
            </HelpHint>

            {/* ── 高度な設定（折りたたみ） ── */}
            <details style={{ marginTop:12 }}>
              <summary style={{ fontSize:13, fontWeight:600, color:"var(--text)", cursor:"pointer", userSelect:"none", padding:"8px 12px", border:"1px solid var(--border)", borderRadius:8, background:"var(--bg)", display:"flex", alignItems:"center", gap:6 }}>
                <span>⚙️ 高度な設定</span>
                <span style={{ fontSize:11, fontWeight:400, color:"var(--text3)" }}>— 議論モード・ペルソナ・憲法・セキュリティ・バックアップ</span>
              </summary>
              <div style={{ marginTop:10, display:"flex", flexDirection:"column", gap:10 }}>
                <div>
                  <div style={{ fontSize:11, color:"var(--text3)", fontFamily:"monospace", letterSpacing:"0.1em", marginBottom:6 }}>議論モード</div>
                  <div role="radiogroup" aria-label="議論モード" style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                    {DISCUSSION_MODES.map(({id,label,description}) => (
                      <button key={id} role="radio" aria-checked={discussionMode===id} onClick={() => setDiscussionMode(id)}
                        title={description}
                        style={{ padding:"5px 12px", border:"1px solid var(--border)", borderRadius:20, cursor:"pointer", fontSize:11, fontWeight:600, background:discussionMode===id?"var(--accent)":"transparent", color:discussionMode===id?"#fff":"var(--text2)" }}>
                        {label}
                      </button>
                    ))}
                  </div>
                  <div style={{ fontSize:11, color:"var(--text2)", marginTop:4 }}>
                    {DISCUSSION_MODES.find((m) => m.id === discussionMode)?.description}
                  </div>
                  {help.helpMode && (
                    <div style={{ fontSize:10, color:"var(--text3)", marginTop:6, padding:"8px 10px", background:"var(--bg)", borderRadius:6, lineHeight:1.7 }}>
                      💡 モード別の特徴:<br />
                      ・<b>標準</b>: バランスの取れた議論（迷ったらこれ）<br />
                      ・<b>ディベート</b>: 各AIが対立しながら論点を掘り下げる。反論・批判が中心<br />
                      ・<b>ブレスト</b>: 否定せずアイデアを発散。「Yes, and」の姿勢<br />
                      ・<b>事実検証</b>: 根拠・データ重視で互いの発言を検証<br />
                      ・<b>合意形成</b>: 歩み寄り・第三案で「落とし所」へ収束。対立より合意づくり<br />
                      ・<b>意思決定</b>: 選択肢を評価軸で比較・採点し、条件別の推奨を出す（最終ジャッジと好相性）<br />
                      ・<b>中立まとめ</b>: 1つのAIが中立記録者として全体を「合意/相違/結論」に整理（裁定はしない）
                    </div>
                  )}
                  {discussionMode === "conclusion" && (
                    <div style={{ marginTop:8, padding:"8px 10px", background:"var(--accent-bg)", border:"1px solid var(--accent-bd)", borderRadius:8 }}>
                      <div style={{ fontSize:11, color:"var(--text3)", marginBottom:6 }}>まとめ担当AI（1AIが3者の議論を統合）</div>
                      <div role="radiogroup" aria-label="まとめ担当AI" style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                        {MODELS.map((m) => (
                          <button key={m.id} role="radio" aria-checked={conclusionTarget===m.id} onClick={() => setConclusionTarget(m.id)}
                            title={`${m.name} が中立記録者として3者の議論を統合`}
                            style={{ padding:"4px 10px", border:`1px solid ${conclusionTarget===m.id?m.color:"var(--border)"}`, borderRadius:16, cursor:"pointer", fontSize:11, fontWeight:600, background:conclusionTarget===m.id?m.bg:"transparent", color:conclusionTarget===m.id?m.color:"var(--text2)" }}>
                            {m.icon} {m.name}
                          </button>
                        ))}
                      </div>
                      <HelpHint>
                        中立まとめモードは3AIで議論せず、選んだAIだけが全体を「合意点／相違点／最終結論」に中立整理します（どちらが正しいかの裁定はしません）。実行後は自動で標準モードに戻ります
                      </HelpHint>
                    </div>
                  )}
                </div>
                <PersonaPanel personas={personas} onChange={setPersonas} />
                <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                  {[
                    { id:"constitution", label:"📜 憲法", badge:constitution.trim()?"✓":null },
                    { id:"security",     label:"🔒 セキュリティ" },
                    { id:"backup",       label:"🔐 バックアップ" },
                  ].map(({id,label,badge}) => (
                    <button key={id} onClick={() => togglePanel(id)}
                      style={{ padding:"5px 12px", border:`1px solid ${activePanel===id?"var(--accent-bd)":"var(--border)"}`, borderRadius:8, cursor:"pointer", fontSize:11, fontFamily:"monospace", background:activePanel===id?"var(--accent-bg)":"transparent", color:activePanel===id?"var(--text)":"var(--text2)", display:"flex", alignItems:"center", gap:4 }}>
                      <span>{label}</span>
                      {badge && <span style={{ fontSize:10, color:"var(--success)" }}>{badge}</span>}
                    </button>
                  ))}
                </div>
              </div>
            </details>
          </div>
        )}

        {/* Expanded panel content */}
        <ExpandedPanels
          activePanel={activePanel}
          keyConfigs={keyConfigs} keys={keys} updateKey={updateKey}
          keyStatus={keyStatus} validateKey={validateKey} validationColor={validationColor}
          isPremium={auth.isPremium} useOwnKeys={useOwnKeys}
          preferOwnKeys={preferOwnKeys} setPreferOwnKeys={setPreferOwnKeys} allKeysSet={allKeysSet}
          profile={profile} updateProfile={updateProfile}
          constitution={constitution} updateConstitution={updateConstitution}
          crypto={crypto}
        />

        {/* Plan selection lives in the Onboarding card above (single source). */}

        {activePanel === "suggest" && (
          <SuggestedQuestions
            hasProfile={!!profile.trim()}
            onSelect={(q) => {
              setTopic(q.text);
              setDiscussionMode(q.mode);
              setActivePanel(null);
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          />
        )}

        {activePanel === "history" && (
          <div style={{ marginTop:8, marginBottom:10 }}>
            <HistoryPanel
              open={true}
              onToggle={() => togglePanel("history")}
              onLoad={handleLoadHistory}
              onAddContext={!started ? handleAddContext : undefined}
              contextIds={contextDiscussions.map((d) => d.id)}
              cloudHistory={cloudHistory}
              isPremium={auth.isPremium}
            />
          </div>
        )}

        {/* Topic display */}
        {started && (
          <div style={{ padding:"10px 14px", background:"var(--accent-bg)", border:"1px solid var(--accent-bd)", borderRadius:10, marginBottom:20, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <div>
              <div style={{ fontSize:10, color:"var(--text3)", fontFamily:"monospace", marginBottom:3 }}>議題{profile.trim()?" · 👤":""}</div>
              <div style={{ fontSize:14, color:"var(--accent-light)", fontWeight:500 }}>{topic}</div>
            </div>
            <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
              {discussion.length > 0 && (<>
                <button onClick={handleExportHtml} aria-label="HTMLエクスポート" title="この議論をHTMLファイルとしてダウンロード（印刷・共有用）" style={{ background:"none", border:"1px solid var(--border)", borderRadius:6, padding:"4px 10px", color:"var(--text2)", cursor:"pointer", fontSize:12 }}>📥 HTML</button>
                <button onClick={handleExportMd} aria-label="Markdownエクスポート" title="この議論をMarkdownファイルとしてダウンロード（Notion・Obsidian等に貼付け）" style={{ background:"none", border:"1px solid var(--border)", borderRadius:6, padding:"4px 10px", color:"var(--text2)", cursor:"pointer", fontSize:12 }}>📥 MD</button>
                {auth.isPremium && (
                  <button onClick={handleShare} aria-label="共有リンクを作成" disabled={running} title="この議論を共有可能なリンクとして公開（URL知っている人だけ閲覧可）"
                    style={{ background:"none", border:"1px solid var(--accent-bd)", borderRadius:6, padding:"4px 10px", color:"var(--accent-light)", cursor:running?"not-allowed":"pointer", fontSize:12, opacity:running?0.5:1 }}>
                    🔗 共有
                  </button>
                )}
              </>)}
              <button onClick={handleResetAll} title="この議論を終了して新しい議題を入力する画面に戻る（履歴は自動保存済み・モードは高速に戻ります）" style={{ background:"none", border:"1px solid var(--accent-bd)", borderRadius:6, padding:"4px 10px", color:"var(--text3)", cursor:"pointer", fontSize:12 }}>リセット</button>
            </div>
          </div>
        )}
        {started && help.helpMode && discussion.length > 0 && (
          <HelpHint>
            「リセット」= 議論を終了して新規入力画面へ（履歴は自動保存）／「共有」= URLで他人と共有（個人情報は除外）／「HTML/MD」= ファイル出力
          </HelpHint>
        )}

        {/* 現在の到達点（結論ファースト）: 議論本文の上に常時表示 */}
        {started && discussion.length > 0 && consensusSummary && (
          <ConsensusCard
            summary={consensusSummary}
            summaries={summaries}
            roundCount={discussion.length}
            conclusion={verdict?.recommendation || actionPlan?.conclusion}
            running={running}
          />
        )}

        {/* 最終ジャッジ（検証付き単一結論）: 議論が1ラウンド以上・停止中に提供 */}
        {started && discussion.length > 0 && !running && (
          <FinalVerdict verdict={verdict} loading={verdictLoading} onGenerate={handleGenerateVerdict} onSaveImage={handleSaveVerdictImage} />
        )}

        {/* Discussion + Side Panel layout */}
        <div className={sidePanel ? "app-layout" : ""}>
          <div className={sidePanel ? "app-main" : ""}>
            {discussion.map((round, i) => (
              <div key={i}>
                <RoundSection round={round} roundNum={i+1} isLatest={i===discussion.length-1} personas={personas} summary={summaries[i]} />
                {!sidePanel && summaries[i] !== undefined && !round.isConclusion && (
                  <SummaryPanel
                    summary={summaries[i]}
                    roundNum={i+1}
                    onScrollToMessage={handleScrollToMessage}
                    sidePanel={false}
                    onToggleSidePanel={() => setSidePanel(true)}
                    detailedAnalysis={detailedAnalyses[i]}
                    onRequestDetailed={() => runDetailedAnalysis(i)}
                  />
                )}
              </div>
            ))}

            {running && (
              <div style={{ textAlign:"center", marginTop:8 }}>
                <button onClick={handleStop} style={{ background:"none", border:"1px solid var(--error)", borderRadius:20, padding:"8px 24px", color:"var(--error)", cursor:"pointer", fontSize:13, fontWeight:600 }}>
                  ⏹ 停止
                </button>
              </div>
            )}

            {showIntervention && !running && discussion.length > 0 && (
              <div style={{ marginTop:16, display:"flex", flexDirection:"column", gap:10 }}>
                <div style={{ background:"var(--surface)", border:"1px solid var(--accent-bd)", borderRadius:10, overflow:"hidden" }}>
                  <textarea value={intervention} onChange={(e) => setIntervention(e.target.value)} maxLength={1000} aria-label="司会者介入"
                    placeholder={"💬 司会者として介入する（任意）\n例: 経済的影響についてもっと掘り下げてください"}
                    rows={2}
                    style={{ width:"100%", background:"transparent", border:"none", padding:"12px 14px", color:"var(--accent-light)", fontSize:13, lineHeight:1.6, resize:"none" }} />
                </div>
                {/* ワンタップ介入: あなたが議論の指揮者。次ラウンドの方向を1タップで */}
                <div style={{ display:"flex", justifyContent:"center", gap:6, flexWrap:"wrap" }}>
                  {INTERVENTION_QUICKFILLS.map((q) => (
                    <button key={q} onClick={() => setIntervention(q)}
                      style={{ padding:"4px 10px", border:"1px solid var(--accent-bd)", borderRadius:14, cursor:"pointer", fontSize:10.5, fontWeight:600, background:"var(--accent-bg)", color:"var(--accent-light)" }}>
                      {q}
                    </button>
                  ))}
                </div>
                <div style={{ display:"flex", justifyContent:"center", gap:6, flexWrap:"wrap" }}>
                  {DISCUSSION_MODES.map(({id,label}) => (
                    <button key={id} role="radio" aria-checked={discussionMode===id} onClick={() => setDiscussionMode(id)}
                      style={{ padding:"4px 10px", border:"1px solid var(--border)", borderRadius:16, cursor:"pointer", fontSize:10, fontWeight:600, background:discussionMode===id?"var(--accent)":"transparent", color:discussionMode===id?"#fff":"var(--text3)" }}>
                      {label}
                    </button>
                  ))}
                </div>
                {discussionMode === "conclusion" && (
                  <div style={{ display:"flex", justifyContent:"center", alignItems:"center", gap:6, flexWrap:"wrap" }}>
                    <span style={{ fontSize:10, color:"var(--text3)" }}>まとめ担当:</span>
                    {MODELS.map((m) => (
                      <button key={m.id} role="radio" aria-checked={conclusionTarget===m.id} onClick={() => setConclusionTarget(m.id)}
                        style={{ padding:"3px 9px", border:`1px solid ${conclusionTarget===m.id?m.color:"var(--border)"}`, borderRadius:14, cursor:"pointer", fontSize:10, fontWeight:600, background:conclusionTarget===m.id?m.bg:"transparent", color:conclusionTarget===m.id?m.color:"var(--text3)" }}>
                        {m.icon} {m.name}
                      </button>
                    ))}
                  </div>
                )}
                <div style={{ textAlign:"center" }}>
                  <button onClick={handleNextRound} style={{ background:"none", border:"1px solid var(--accent)", borderRadius:20, padding:"10px 28px", color:"var(--accent-light)", cursor:"pointer", fontSize:13, fontWeight:600 }}>
                    ↻ {discussionMode === "conclusion" ? `中立まとめを生成（${MODELS.find(m=>m.id===conclusionTarget)?.name}）` : `次のラウンドへ（Round ${discussion.length+1}）`}
                  </button>
                </div>
              </div>
            )}

            {!running && discussion.length > 0 && (
              <ActionPlanView plan={actionPlan} loading={actionPlanLoading} onGenerate={handleGenerateActionPlan} />
            )}

            <div ref={bottomRef} />
          </div>

          {sidePanel && latestSummary !== undefined && (
            <SummaryPanel
              summary={latestSummary}
              roundNum={discussion.length}
              onScrollToMessage={handleScrollToMessage}
              sidePanel={true}
              onToggleSidePanel={() => setSidePanel(false)}
              detailedAnalysis={detailedAnalyses[discussion.length - 1]}
              onRequestDetailed={() => runDetailedAnalysis(discussion.length - 1)}
            />
          )}
        </div>
      </div>

      {/* 使用量ピル: 上部のコスト表示を過ぎてスクロールした有料ユーザーに表示 */}
      {auth.isPremium && !auth.planLoading && usage && !useOwnKeys && scrolledPastTop && (
        <UsagePill usage={usage} estimate={roundEstimate} onClick={scrollToTop} />
      )}

      {/* フローティング「↓ 最新へ」ボタン: 自動追従OFF時のみ表示 */}
      {!autoFollow && started && discussion.length > 0 && (
        <button onClick={scrollToLatest} aria-label="最新メッセージへスクロール"
          style={{ position:"fixed", right:20, bottom:24, zIndex:100, padding:"12px 18px", background:"var(--accent)", color:"#fff", border:"none", borderRadius:24, fontSize:13, fontWeight:600, cursor:"pointer", boxShadow:"0 4px 14px rgba(0,0,0,0.25)", display:"flex", alignItems:"center", gap:6 }}>
          ↓ 最新へ
        </button>
      )}

      <ShareDialog state={shareDialog} onClose={() => setShareDialog(null)} />
    </div>
    </Suspense>
  );
}
