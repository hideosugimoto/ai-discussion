import { useState, useEffect, lazy, Suspense } from "react";
import { MODELS, MODE_MODELS, THEMES, DISCUSSION_MODES } from "./constants";
import { PLACEHOLDER_ROTATION } from "./suggestedQuestions";
import SuggestedQuestions from "./components/SuggestedQuestions";
import { saveSettings } from "./storage";
import ModelBadge from "./components/ModelBadge";
import RoundSection from "./components/RoundSection";
import useKeyValidation from "./hooks/useKeyValidation";
import { downloadMarkdown, downloadHtml } from "./export";
import useSettings from "./hooks/useSettings";
import useCryptoBackup from "./hooks/useCryptoBackup";
import useDiscussion from "./hooks/useDiscussion";
import useAuth from "./hooks/useAuth";
import useUsage from "./hooks/useUsage";
import useCloudHistory from "./hooks/useCloudHistory";
import useShare from "./hooks/useShare";
import PlanPicker from "./components/PlanPicker";
import HelpHint from "./components/HelpHint";
import PlanBadge from "./components/PlanBadge";
import AuthBar from "./components/AuthBar";
import { useHelp } from "./hooks/useHelp.jsx";

const SecurityPanel = lazy(() => import("./components/SecurityPanel"));
const SummaryPanel = lazy(() => import("./components/SummaryPanel"));
const HistoryPanel = lazy(() => import("./components/HistoryPanel"));
const PersonaPanel = lazy(() => import("./components/PersonaPanel"));
const ActionPlanView = lazy(() => import("./components/ActionPlanView"));
const SharedView = lazy(() => import("./components/SharedView"));
const ShareDialog = lazy(() => import("./components/ShareDialog"));

export default function App() {
  const [theme, setTheme] = useState(() => localStorage.getItem("ai-discussion-theme") || "dark");

  // Detect ?share=ID in URL → enter shared-view mode
  const [shareViewId, setShareViewId] = useState(() => {
    const url = new URL(window.location.href);
    return url.searchParams.get("share");
  });

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
          updateKey, toggleSaveKeys, updateProfile, updateConstitution, dismissProfileNotice,
          allKeysSet } = settings;

  const [topic, setTopic]       = useState("");
  const [mode, setMode]         = useState("best");
  const [activePanel, setActivePanel] = useState(!keys.claude ? "keys" : null);
  const togglePanel = (id) => setActivePanel((p) => p === id ? null : id);
  const [discussionMode, setDiscussionMode] = useState("standard");
  const [conclusionTarget, setConclusionTarget] = useState("claude");
  const [personas, setPersonas] = useState({ claude:"", chatgpt:"", gemini:"" });
  const [contextDiscussions, setContextDiscussions] = useState([]); // 過去議論コンテキスト（最大3件）
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
    authToken: auth.token, isPremium: auth.isPremium,
    cloudUpsertFn: auth.isPremium ? cloudHistory.upsert : null,
  });
  const { discussion, summaries, detailedAnalyses,
          running, started, intervention, setIntervention, showIntervention,
          sidePanel, setSidePanel,
          actionPlan, actionPlanLoading,
          bottomRef,
          handleStart: startDiscussion, handleNextRound, handleStop, handleReset,
          handleGenerateActionPlan, runDetailedAnalysis, loadFromHistory } = disc;

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
  useEffect(() => {
    const handleScroll = () => {
      const threshold = 100;
      const nearBottom = window.innerHeight + window.scrollY >= document.body.offsetHeight - threshold;
      setAutoFollow(nearBottom);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

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
    setDiscussionMode("standard");
    setConclusionTarget("claude");
    setPersonas({ claude:"", chatgpt:"", gemini:"" });
    setContextDiscussions([]);
  };

  const hasResettableState = !!(
    topic.trim() ||
    discussionMode !== "standard" ||
    conclusionTarget !== "claude" ||
    personas.claude || personas.chatgpt || personas.gemini ||
    contextDiscussions.length > 0
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
    loadFromHistory(item, setTopic, setDiscussionMode, setPersonas, setConclusionTarget);
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

  const startCheckout = async (targetPlan) => {
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${auth.token}` },
        body: JSON.stringify({ plan: targetPlan }),
      });
      if (!res.ok) throw new Error("Request failed");
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch {
      alert("決済ページの取得に失敗しました。再度お試しください。");
    }
  };

  const startCreditPurchase = async () => {
    try {
      const res = await fetch("/api/billing/credits", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${auth.token}` },
      });
      if (!res.ok) {
        let msg = "クレジット購入ページの取得に失敗しました。";
        try {
          const d = await res.json();
          if (d?.error) msg = d.error;
        } catch { /* ignore */ }
        throw new Error(msg);
      }
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch (e) {
      alert(e.message || "クレジット購入の開始に失敗しました。");
    }
  };

  // Refetch usage after credit purchase success redirect.
  // URL cleanup is unconditional so the param doesn't linger across sessions
  // (e.g. if the user logged out before redirect completed).
  useEffect(() => {
    const url = new URL(window.location.href);
    const creditStatus = url.searchParams.get("credit");
    if (creditStatus) {
      url.searchParams.delete("credit");
      window.history.replaceState({}, "", url.pathname + url.search);
    }
    if (creditStatus === "success" && auth.isPremium) {
      // Slight delay so webhook can land
      setTimeout(() => fetchUsage(), 1500);
    }
  }, [auth.isPremium, fetchUsage]);

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
        <PlanBadge plan={auth.plan} usage={usage} token={auth.token} onCreditPurchase={startCreditPurchase} />
      )}

      {/* Header */}
      <div style={{ textAlign:"center", marginBottom:20, width:"100%", maxWidth:900 }}>
        <div style={{ fontSize:11, color:"var(--text3)", letterSpacing:"0.3em", marginBottom:6 }}>AI ROUNDTABLE</div>
        <h1 style={{ margin:"0 0 14px", fontSize:22, fontWeight:700, color:"var(--text)", display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="28" height="28" style={{ flexShrink:0 }}>
            <rect width="64" height="64" rx="14" fill="#161627"/>
            <circle cx="32" cy="22" r="14" fill="#E8815C" opacity="0.85" style={{ mixBlendMode:"screen" }}/>
            <circle cx="22" cy="40" r="14" fill="#10A37F" opacity="0.85" style={{ mixBlendMode:"screen" }}/>
            <circle cx="42" cy="40" r="14" fill="#4285F4" opacity="0.85" style={{ mixBlendMode:"screen" }}/>
            <circle cx="32" cy="34" r="4" fill="#fff" opacity="0.9"/>
          </svg>
          3 AI Discussion
        </h1>
        <div style={{ display:"flex", justifyContent:"center", gap:8, flexWrap:"wrap", marginBottom:12 }}>
          {MODELS.map((m) => <ModelBadge key={m.id} model={m} tag={cm[m.id].label} />)}
        </div>
        <div style={{ display:"flex", justifyContent:"center", gap:8, flexWrap:"wrap" }}>
          <div role="radiogroup" aria-label="モード選択" style={{ display:"flex", background:"var(--surface)", border:"1px solid var(--border)", borderRadius:8, overflow:"hidden" }}>
            {[{id:"best",label:"🧠 最強"},{id:"fast",label:"⚡ 高速"}].map(({id,label}) => (
              <button key={id} role="radio" aria-checked={mode===id} onClick={() => setMode(id)} style={{ padding:"6px 14px", border:"none", cursor:"pointer", fontSize:12, fontWeight:600, background:mode===id?"var(--accent)":"transparent", color:mode===id?"#fff":"var(--text2)" }}>{label}</button>
            ))}
          </div>
          <div role="radiogroup" aria-label="テーマ選択" style={{ display:"flex", background:"var(--surface)", border:"1px solid var(--border)", borderRadius:8, overflow:"hidden" }}>
            {THEMES.map(({id,label}) => (
              <button key={id} role="radio" aria-checked={theme===id} onClick={() => setTheme(id)} style={{ padding:"6px 12px", border:"none", cursor:"pointer", fontSize:11, fontWeight:600, background:theme===id?"var(--accent)":"transparent", color:theme===id?"#fff":"var(--text2)" }}>{label}</button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ width:"100%", maxWidth:1400, padding:"0 8px" }}>

        {/* ── APIキー（未設定時は目立つ） ── */}
        {!canStart && !started && (
          <div style={{ marginBottom:12, padding:"10px 14px", background:"var(--warning-bg)", border:"1px solid var(--warning-bd)", borderRadius:10, display:"flex", alignItems:"center", gap:8, cursor:"pointer" }} onClick={() => togglePanel("keys")}>
            <span style={{ color:"var(--warning)", fontSize:13, fontWeight:600 }}>⚠ APIキーを設定してください</span>
            <span style={{ color:"var(--text3)", fontSize:11 }}>— 3つのAIサービスのAPIキーが必要です（またはログインして有料プランをご利用ください）</span>
          </div>
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
                      ・<b>結論まとめ</b>: 1つのAIが中立記録者として全体を「合意/相違/結論」に統合
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
                        結論まとめモードは3AIで議論せず、選んだAIだけが全体を「合意点／相違点／最終結論」にまとめます。実行後は自動で標準モードに戻ります
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
        {activePanel === "keys" && (
          <div style={{ marginTop:8, marginBottom:10, padding:14, background:"var(--surface)", border:"1px solid var(--border)", borderRadius:10 }}>
            <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
              {keyConfigs.map(({id,label,ph,link}) => (
                <div key={id}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4 }}>
                    <span style={{ fontSize:11, color:"var(--text3)", fontFamily:"monospace" }}>{label}</span>
                    <a href={link} target="_blank" rel="noopener noreferrer" style={{ fontSize:10, color:"var(--link)", textDecoration:"none" }}>取得 →</a>
                  </div>
                  <div style={{ display:"flex", gap:6 }}>
                    <input type="password" value={keys[id]} onChange={(e) => updateKey(id, e.target.value)} placeholder={ph} aria-label={label}
                      style={{ flex:1, background:"var(--bg)", border:`1px solid ${validationColor(id)}`, borderRadius:6, padding:"8px 10px", color:"var(--text)", fontSize:13, fontFamily:"monospace" }} />
                    <button onClick={() => validateKey(id, keys[id])} disabled={!keys[id] || keyStatus[id]==="checking"} aria-label={`${label} 疎通確認`}
                      style={{ padding:"8px 12px", background:"var(--accent-bg)", border:"1px solid var(--accent-bd)", borderRadius:6, color:keyStatus[id]==="ok"?"var(--success)":"var(--link)", cursor:keys[id]?"pointer":"not-allowed", fontSize:11, fontWeight:600, whiteSpace:"nowrap" }}>
                      {keyStatus[id]==="checking"?"確認中..." : keyStatus[id]==="ok"?"✓ OK" : keyStatus[id]?.startsWith("error")?"✗ NG":"疎通確認"}
                    </button>
                  </div>
                  {keyStatus[id]?.startsWith("error") && (
                    <div style={{ fontSize:11, color:"var(--error)", marginTop:4 }}>{keyStatus[id]}</div>
                  )}
                </div>
              ))}
              <div style={{ fontSize:11, color:"var(--text3)", lineHeight:1.6 }}>
                ※ 運営者サーバーには一切送信されません。上部の「💾 保存」ボタンでブラウザ保存のON/OFFを切り替えられます。
              </div>
            </div>
          </div>
        )}

        {activePanel === "security" && (
          <div style={{ marginTop:8, marginBottom:10 }}>
            <SecurityPanel />
          </div>
        )}

        {activePanel === "profile" && (
          <div style={{ marginTop:8, marginBottom:10, padding:14, background:"var(--surface)", border:"1px solid var(--border)", borderRadius:10 }}>
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              <div style={{ fontSize:11, color:"var(--text3)" }}>各AIのシステムプロンプトに自動注入。Claude.aiで「今まで把握している私の情報をまとめて」と聞いた内容をそのまま貼るのがおすすめ。</div>
              <HelpHint>
                プロフィール = あなた自身の情報。AIが「あなた向け」にカスタマイズした回答をしてくれます。「自己分析・キャリア相談」系の質問では特に効果的
              </HelpHint>
              <textarea value={profile} onChange={(e) => updateProfile(e.target.value)} maxLength={5000} aria-label="プロフィール"
                placeholder={"例:\n- エンジニア、30代\n- 会社員＋LLC運営\n- 最小労働・最大成果を目指している"} rows={5}
                style={{ width:"100%", background:"var(--bg)", border:"1px solid var(--border)", borderRadius:6, padding:10, color:"var(--text)", fontSize:13, lineHeight:1.7, resize:"vertical" }} />
              {profile.trim() && <button onClick={() => updateProfile("")} aria-label="プロフィールをクリア" style={{ alignSelf:"flex-end", background:"none", border:"1px solid var(--border)", borderRadius:6, padding:"4px 12px", color:"var(--error)", cursor:"pointer", fontSize:11 }}>クリア</button>}
            </div>
          </div>
        )}

        {activePanel === "constitution" && (
          <div style={{ marginTop:8, marginBottom:10, padding:14, background:"var(--surface)", border:"1px solid var(--border)", borderRadius:10 }}>
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              <div style={{ fontSize:11, color:"var(--text3)" }}>あなたの意思決定の基準・価値観を定義してください。議論中、各AIがこの憲法に基づいて推奨・非推奨を明示します。</div>
              <HelpHint>
                憲法 = あなたの価値観・判断基準。プロフィールとの違いは「事実」ではなく「ポリシー」。例: 「短期利益より長期の自由度」「破産リスクは絶対NG」など
              </HelpHint>
              <textarea value={constitution} onChange={(e) => updateConstitution(e.target.value)} maxLength={2000} aria-label="議論の憲法"
                placeholder={"例:\n- 最小労働・最大成果を優先する\n- 短期利益より長期の自由度を重視\n- リスクは取るが、破産リスクは絶対に避ける\n- 技術的負債は3ヶ月以内に返済する"}
                rows={5}
                style={{ width:"100%", background:"var(--bg)", border:"1px solid var(--border)", borderRadius:6, padding:10, color:"var(--text)", fontSize:13, lineHeight:1.7, resize:"vertical" }} />
              {constitution.trim() && <button onClick={() => updateConstitution("")} aria-label="憲法をクリア" style={{ alignSelf:"flex-end", background:"none", border:"1px solid var(--border)", borderRadius:6, padding:"4px 12px", color:"var(--error)", cursor:"pointer", fontSize:11 }}>クリア</button>}
            </div>
          </div>
        )}

        {activePanel === "backup" && (
          <div style={{ marginTop:8, marginBottom:10, padding:14, background:"var(--surface)", border:"1px solid var(--border)", borderRadius:10 }}>
            <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
              <HelpHint>
                バックアップ = APIキー・プロフィールをパスワードで暗号化してテキスト化。別端末への移行や、ブラウザデータが消えても復元できる安心機能
              </HelpHint>
              <div style={{ padding:"10px 12px", background:"var(--warning-bg)", border:"1px solid var(--warning-bd)", borderRadius:8, fontSize:11, color:"var(--warning)", lineHeight:1.6 }}>
                ⚠ APIキーはAES-GCM（256bit）で暗号化されます。<br/>
                パスワードを忘れると復元できません。安全な場所に保管してください。
              </div>
              <div>
                <div style={{ fontSize:12, color:"var(--text2)", marginBottom:8 }}>① バックアップの作成</div>
                <input type="password" value={crypto.exportPw} onChange={(e) => crypto.setExportPw(e.target.value)} placeholder="バックアップ用パスワードを設定" aria-label="エクスポート用パスワード"
                  style={{ width:"100%", background:"var(--bg)", border:"1px solid var(--border)", borderRadius:6, padding:"8px 10px", color:"var(--text)", fontSize:13, fontFamily:"monospace", marginBottom:8 }} />
                <button onClick={crypto.handleExport} disabled={!crypto.exportPw} style={{ width:"100%", background:crypto.exportPw?"var(--accent-bg)":"var(--surface)", border:"1px solid var(--accent-bd)", borderRadius:8, padding:"10px 20px", color:"#fff", fontSize:13, cursor:crypto.exportPw?"pointer":"not-allowed", fontWeight:600, opacity:crypto.exportPw?1:0.5 }}>
                  🔐 暗号化してコピー
                </button>
                {crypto.exportText && (
                  <textarea readOnly value={crypto.exportText} rows={3} aria-label="暗号化されたバックアップ"
                    style={{ width:"100%", background:"var(--bg)", border:"1px solid var(--border)", borderRadius:6, padding:10, color:"var(--text2)", fontSize:10, resize:"none", fontFamily:"monospace", marginTop:8 }} />
                )}
              </div>
              <div style={{ height:1, background:"var(--border)" }} />
              <div>
                <div style={{ fontSize:12, color:"var(--text2)", marginBottom:8 }}>② バックアップから復元</div>
                <textarea value={crypto.importText} onChange={(e) => crypto.setImportText(e.target.value)} placeholder="バックアップテキストを貼り付け" rows={3} aria-label="バックアップテキスト"
                  style={{ width:"100%", background:"var(--bg)", border:"1px solid var(--border)", borderRadius:6, padding:10, color:"var(--text)", fontSize:12, resize:"none", fontFamily:"monospace", marginBottom:8 }} />
                <input type="password" value={crypto.importPw} onChange={(e) => crypto.setImportPw(e.target.value)} placeholder="バックアップ時に設定したパスワード" aria-label="インポート用パスワード"
                  style={{ width:"100%", background:"var(--bg)", border:"1px solid var(--border)", borderRadius:6, padding:"8px 10px", color:"var(--text)", fontSize:13, fontFamily:"monospace", marginBottom:8 }} />
                <button onClick={crypto.handleImport} disabled={!crypto.importText.trim()||!crypto.importPw} style={{ width:"100%", background:"var(--accent)", border:"none", borderRadius:8, padding:"10px 20px", color:"#fff", fontSize:13, cursor:(crypto.importText.trim()&&crypto.importPw)?"pointer":"not-allowed", fontWeight:600, opacity:(crypto.importText.trim()&&crypto.importPw)?1:0.4 }}>
                  復元する
                </button>
              </div>
              {crypto.cryptoMsg && (
                <div style={{ fontSize:13, color:crypto.cryptoMsg.startsWith("✓")?"var(--success)":"var(--error)", textAlign:"center" }}>{crypto.cryptoMsg}</div>
              )}
            </div>
          </div>
        )}

        {/* Plan selection (Premium / Plus) */}
        {auth.user && !auth.isPremium && activePanel === "keys" && (
          <PlanPicker onPick={startCheckout} />
        )}

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
              <button onClick={handleReset} title="この議論を終了して新しい議題を入力する画面に戻る（履歴は自動保存済み）" style={{ background:"none", border:"1px solid var(--accent-bd)", borderRadius:6, padding:"4px 10px", color:"var(--text3)", cursor:"pointer", fontSize:12 }}>リセット</button>
            </div>
          </div>
        )}
        {started && help.helpMode && discussion.length > 0 && (
          <HelpHint>
            「リセット」= 議論を終了して新規入力画面へ（履歴は自動保存）／「共有」= URLで他人と共有（個人情報は除外）／「HTML/MD」= ファイル出力
          </HelpHint>
        )}

        {/* Discussion + Side Panel layout */}
        <div className={sidePanel ? "app-layout" : ""}>
          <div className={sidePanel ? "app-main" : ""}>
            {discussion.map((round, i) => (
              <div key={i}>
                <RoundSection round={round} roundNum={i+1} isLatest={i===discussion.length-1} personas={personas} />
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
                    ↻ {discussionMode === "conclusion" ? `結論まとめを生成（${MODELS.find(m=>m.id===conclusionTarget)?.name}）` : `次のラウンドへ（Round ${discussion.length+1}）`}
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
