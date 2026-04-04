import { useState, useEffect } from "react";
import { MODELS, MODE_MODELS, THEMES, DISCUSSION_MODES } from "./constants";
import { saveSettings } from "./storage";
import ModelBadge from "./components/ModelBadge";
import RoundSection from "./components/RoundSection";
import SecurityPanel from "./components/SecurityPanel";
import SummaryPanel from "./components/SummaryPanel";
import useKeyValidation from "./hooks/useKeyValidation";
import { downloadMarkdown, downloadHtml } from "./export";
import HistoryPanel from "./components/HistoryPanel";
import PersonaPanel from "./components/PersonaPanel";
import ActionPlanView from "./components/ActionPlanView";
import useSettings from "./hooks/useSettings";
import useCryptoBackup from "./hooks/useCryptoBackup";
import useDiscussion from "./hooks/useDiscussion";

export default function App() {
  const [theme, setTheme] = useState(() => localStorage.getItem("ai-discussion-theme") || "dark");

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("ai-discussion-theme", theme);
  }, [theme]);

  const settings = useSettings();
  const { keys, saveKeys, profile, profileUpdatedAt, profileNotice, constitution,
          updateKey, toggleSaveKeys, updateProfile, updateConstitution, dismissProfileNotice,
          allKeysSet } = settings;

  const [topic, setTopic]       = useState("");
  const [mode, setMode]         = useState("best");
  const [activePanel, setActivePanel] = useState(!keys.claude ? "keys" : null);
  const togglePanel = (id) => setActivePanel((p) => p === id ? null : id);
  const [discussionMode, setDiscussionMode] = useState("standard");
  const [personas, setPersonas] = useState({ claude:"", chatgpt:"", gemini:"" });

  const disc = useDiscussion({ keys, topic, profile, mode, discussionMode, personas, constitution });
  const { discussion, summaries, detailedAnalyses,
          running, started, intervention, setIntervention, showIntervention,
          sidePanel, setSidePanel,
          actionPlan, actionPlanLoading,
          bottomRef,
          handleStart: startDiscussion, handleNextRound, handleStop, handleReset: resetDiscussion,
          handleGenerateActionPlan, runDetailedAnalysis, loadFromHistory } = disc;

  const crypto = useCryptoBackup({
    keys, profile, saveKeys,
    setKeys: (fn) => { const next = fn(keys); for (const id of ["claude","chatgpt","gemini"]) updateKey(id, next[id]); },
    setProfile: (val) => updateProfile(val),
    persistSettings: (data) => saveSettings(data),
    onDone: () => setActivePanel(null),
  });

  const { status: keyStatus, validate: validateKey } = useKeyValidation();

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:"smooth" }); }, [discussion, bottomRef]);

  const handleStart = async () => {
    setActivePanel(null);
    await startDiscussion();
  };

  const handleReset = () => {
    resetDiscussion();
  };

  const handleLoadHistory = (item) => {
    loadFromHistory(item, setTopic, setDiscussionMode, setPersonas);
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

  const cm = MODE_MODELS[mode];
  const latestSummary = summaries[summaries.length - 1] ?? null;

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

  return (
    <div style={{ minHeight:"100vh", background:"var(--bg)", color:"var(--text)", display:"flex", flexDirection:"column", alignItems:"center", padding:"24px 16px 80px" }}>

      {/* Profile update notice */}
      {profileNotice && (
        <div style={{ width:"100%", maxWidth:720, marginBottom:12, padding:"10px 16px", background:"var(--warning-bg)", border:"1px solid var(--warning-bd)", borderRadius:8, display:"flex", justifyContent:"space-between", alignItems:"center", gap:12 }}>
          <span style={{ color:"var(--warning)", fontSize:13 }}>📅 プロフィールが{profileNotice}日間更新されていません。Claude.aiやChatGPTで最新情報を取得して更新することをおすすめします。</span>
          <button onClick={dismissProfileNotice} aria-label="通知を閉じる" style={{ background:"none", border:"none", color:"var(--warning)", cursor:"pointer", fontSize:16, padding:"0 4px", flexShrink:0 }}>✕</button>
        </div>
      )}

      {/* Header */}
      <div style={{ textAlign:"center", marginBottom:20, width:"100%", maxWidth:900 }}>
        <div style={{ fontSize:11, color:"var(--text3)", letterSpacing:"0.3em", marginBottom:6 }}>AI ROUNDTABLE</div>
        <h1 style={{ margin:"0 0 14px", fontSize:22, fontWeight:700, color:"var(--text)" }}>3 AI Discussion</h1>
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
        {!allKeysSet && !started && (
          <div style={{ marginBottom:12, padding:"10px 14px", background:"var(--warning-bg)", border:"1px solid var(--warning-bd)", borderRadius:10, display:"flex", alignItems:"center", gap:8, cursor:"pointer" }} onClick={() => togglePanel("keys")}>
            <span style={{ color:"var(--warning)", fontSize:13, fontWeight:600 }}>⚠ APIキーを設定してください</span>
            <span style={{ color:"var(--text3)", fontSize:11 }}>— 3つのAIサービスのAPIキーが必要です</span>
          </div>
        )}

        {/* ── 議題入力 ── */}
        {!started && (
          <div style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:10, overflow:"hidden", marginBottom:16 }}>
            <textarea value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={2000} aria-label="議題"
              onKeyDown={(e) => { if (e.key==="Enter"&&(e.metaKey||e.ctrlKey)) handleStart(); }}
              placeholder={"議題を入力...\n例: AIは人間の仕事を奪うか\nCtrl+Enter で開始"} rows={3}
              style={{ width:"100%", background:"transparent", border:"none", padding:14, color:"var(--text)", fontSize:14, lineHeight:1.7, resize:"vertical" }} />
            <div style={{ padding:"8px 12px", borderTop:"1px solid var(--border)", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <span style={{ fontSize:11, color:profile.trim()?"var(--success)":"var(--text3)" }}>{profile.trim()?"👤 プロフィールあり":"👤 なし"}</span>
              <button onClick={handleStart} disabled={!topic.trim()||running||!allKeysSet}
                style={{ background:allKeysSet&&topic.trim()?"var(--accent)":"var(--surface)", border:"1px solid var(--border)", borderRadius:8, padding:"8px 20px", color:allKeysSet&&topic.trim()?"#fff":"var(--text3)", fontSize:13, fontWeight:700, cursor:(topic.trim()&&allKeysSet)?"pointer":"not-allowed", opacity:(topic.trim()&&allKeysSet)?1:0.35 }}>
                {!allKeysSet?"キーを設定してください":"▶ 開始"}
              </button>
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
                { id:"history", label:"📂 履歴" },
              ].map(({id,label,badge}) => (
                <button key={id} onClick={() => togglePanel(id)}
                  style={{ padding:"5px 12px", border:`1px solid ${activePanel===id?"var(--accent-bd)":"var(--border)"}`, borderRadius:8, cursor:"pointer", fontSize:11, fontFamily:"monospace", background:activePanel===id?"var(--accent-bg)":"transparent", color:activePanel===id?"var(--text)":"var(--text2)", display:"flex", alignItems:"center", gap:4 }}>
                  <span>{label}</span>
                  {badge && <span style={{ fontSize:10, color:badge==="✓"?"var(--success)":"var(--warning)" }}>{badge}</span>}
                </button>
              ))}
              <button onClick={() => toggleSaveKeys(!saveKeys)} aria-label={`ブラウザ保存 ${saveKeys?"OFF":"ON"}に切り替え`}
                style={{ padding:"5px 12px", border:`1px solid ${saveKeys?"var(--success)":"var(--border)"}`, borderRadius:8, cursor:"pointer", fontSize:11, fontFamily:"monospace", background:saveKeys?"var(--success)":"transparent", color:saveKeys?"#fff":"var(--text2)", display:"flex", alignItems:"center", gap:4 }}>
                <span>{saveKeys ? "💾 保存ON" : "💾 保存OFF"}</span>
              </button>
            </div>
            {saveKeys && (
              <div style={{ fontSize:11, color:"var(--text3)", marginBottom:6 }}>
                APIキーとプロフィールをこのブラウザに保存中（localStorage）
              </div>
            )}

            {/* ── 高度な設定（折りたたみ） ── */}
            <details style={{ marginTop:8 }}>
              <summary style={{ fontSize:11, color:"var(--text3)", cursor:"pointer", userSelect:"none", padding:"4px 0" }}>
                高度な設定 — 議論モード・ペルソナ・憲法・セキュリティ・バックアップ
              </summary>
              <div style={{ marginTop:10, display:"flex", flexDirection:"column", gap:10 }}>
                <div>
                  <div style={{ fontSize:11, color:"var(--text3)", fontFamily:"monospace", letterSpacing:"0.1em", marginBottom:6 }}>議論モード</div>
                  <div role="radiogroup" aria-label="議論モード" style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                    {DISCUSSION_MODES.map(({id,label}) => (
                      <button key={id} role="radio" aria-checked={discussionMode===id} onClick={() => setDiscussionMode(id)}
                        style={{ padding:"5px 12px", border:"1px solid var(--border)", borderRadius:20, cursor:"pointer", fontSize:11, fontWeight:600, background:discussionMode===id?"var(--accent)":"transparent", color:discussionMode===id?"#fff":"var(--text2)" }}>
                        {label}
                      </button>
                    ))}
                  </div>
                  <div style={{ fontSize:11, color:"var(--text2)", marginTop:4 }}>
                    {DISCUSSION_MODES.find((m) => m.id === discussionMode)?.description}
                  </div>
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

        {activePanel === "history" && (
          <div style={{ marginTop:8, marginBottom:10 }}>
            <HistoryPanel open={true} onToggle={() => togglePanel("history")} onLoad={handleLoadHistory} />
          </div>
        )}

        {/* Topic display */}
        {started && (
          <div style={{ padding:"10px 14px", background:"var(--accent-bg)", border:"1px solid var(--accent-bd)", borderRadius:10, marginBottom:20, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <div>
              <div style={{ fontSize:10, color:"var(--text3)", fontFamily:"monospace", marginBottom:3 }}>議題{profile.trim()?" · 👤":""}</div>
              <div style={{ fontSize:14, color:"var(--accent-light)", fontWeight:500 }}>{topic}</div>
            </div>
            <div style={{ display:"flex", gap:6 }}>
              {discussion.length > 0 && (<>
                <button onClick={handleExportHtml} aria-label="HTMLエクスポート" style={{ background:"none", border:"1px solid var(--border)", borderRadius:6, padding:"4px 10px", color:"var(--text2)", cursor:"pointer", fontSize:12 }}>📥 HTML</button>
                <button onClick={handleExportMd} aria-label="Markdownエクスポート" style={{ background:"none", border:"1px solid var(--border)", borderRadius:6, padding:"4px 10px", color:"var(--text2)", cursor:"pointer", fontSize:12 }}>📥 MD</button>
              </>)}
              <button onClick={handleReset} style={{ background:"none", border:"1px solid var(--accent-bd)", borderRadius:6, padding:"4px 10px", color:"var(--text3)", cursor:"pointer", fontSize:12 }}>リセット</button>
            </div>
          </div>
        )}

        {/* Discussion + Side Panel layout */}
        <div className={sidePanel ? "app-layout" : ""}>
          <div className={sidePanel ? "app-main" : ""}>
            {discussion.map((round, i) => (
              <div key={i}>
                <RoundSection round={round} roundNum={i+1} isLatest={i===discussion.length-1} personas={personas} />
                {!sidePanel && summaries[i] !== undefined && (
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
                    placeholder="💬 司会者として介入する（任意）\n例: 経済的影響についてもっと掘り下げてください"
                    rows={2}
                    style={{ width:"100%", background:"transparent", border:"none", padding:"12px 14px", color:"var(--accent-light)", fontSize:13, lineHeight:1.6, resize:"none" }} />
                </div>
                <div style={{ textAlign:"center" }}>
                  <button onClick={handleNextRound} style={{ background:"none", border:"1px solid var(--accent)", borderRadius:20, padding:"10px 28px", color:"var(--accent-light)", cursor:"pointer", fontSize:13, fontWeight:600 }}>
                    ↻ 次のラウンドへ（Round {discussion.length+1}）
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
    </div>
  );
}
