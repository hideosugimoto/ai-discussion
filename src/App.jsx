import { useState, useRef, useEffect, useCallback } from "react";
import { MODELS, MODE_MODELS, THEMES, DISCUSSION_MODES } from "./constants";
import { buildPrompt } from "./prompt";
import { callClaude, callChatGPT, callGemini } from "./api";
import { encryptSettings, decryptSettings } from "./crypto";
import { loadSettings, saveSettings } from "./storage";
import ModelBadge from "./components/ModelBadge";
import RoundSection from "./components/RoundSection";
import Collapsible from "./components/Collapsible";
import SecurityPanel from "./components/SecurityPanel";
import SummaryPanel from "./components/SummaryPanel";
import useKeyValidation from "./hooks/useKeyValidation";
import { downloadMarkdown } from "./export";
import { saveDiscussion, loadDiscussion } from "./history";
import HistoryPanel from "./components/HistoryPanel";
import summaryPromptText from "./prompts/summary.txt?raw";

// ── Summary generation ────────────────────────────────────────

async function generateSummary(apiKey, messages, topic, roundNum) {
  const roundText = messages
    .map((m) => {
      const name = MODELS.find((x) => x.id === m.modelId)?.name ?? m.modelId;
      return `[${name}] ${m.text || "(エラー)"}`;
    })
    .join("\n\n");

  const userMsg = `【議題】${topic}\n【Round ${roundNum}の発言】\n${roundText}\n\nJSON形式で出力してください。`;

  const text = await callChatGPT(apiKey, "gpt-4o-mini", summaryPromptText, userMsg, () => {});
  const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  return JSON.parse(cleaned);
}

// ── Main App ───────────────────────────────────────────────────

export default function App() {
  const [theme, setTheme] = useState(() => localStorage.getItem("ai-discussion-theme") || "dark");

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("ai-discussion-theme", theme);
  }, [theme]);

  const saved = loadSettings();
  const [keys, setKeys]         = useState({ claude:"", chatgpt:"", gemini:"", ...saved.keys });
  const [saveKeys, setSaveKeys] = useState(saved.saveKeys ?? false);
  const [profile, setProfile]   = useState(saved.profile ?? "");
  const [profileUpdatedAt]      = useState(saved.profileUpdatedAt ?? null);
  const [topic, setTopic]       = useState("");
  const [mode, setMode]         = useState("best");
  const [discussion, setDiscussion] = useState([]);
  const [summaries, setSummaries] = useState([]);
  const [running, setRunning]   = useState(false);
  const [started, setStarted]   = useState(false);
  const [intervention, setIntervention] = useState("");
  const [showIntervention, setShowIntervention] = useState(false);
  const [profileNotice, setProfileNotice] = useState(false);
  const [sidePanel, setSidePanel] = useState(false);

  const [showKeys, setShowKeysPanel]     = useState(!saved.keys?.claude);
  const [showProfile, setShowProfile]   = useState(false);
  const [showSave, setShowSave]         = useState(false);
  const [showSecurity, setShowSecurity] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [discussionMode, setDiscussionMode] = useState("standard");

  const [exportPw, setExportPw]   = useState("");
  const [importPw, setImportPw]   = useState("");
  const [importText, setImportText] = useState("");
  const [exportText, setExportText] = useState("");
  const [cryptoMsg, setCryptoMsg] = useState("");

  const abortRef = useRef(null);
  const bottomRef = useRef(null);
  const { status: keyStatus, validate: validateKey } = useKeyValidation();

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:"smooth" }); }, [discussion]);

  useEffect(() => {
    if (profile.trim() && profileUpdatedAt && !sessionStorage.getItem("profile-notice-dismissed")) {
      const days = Math.floor((Date.now() - new Date(profileUpdatedAt)) / (1000 * 60 * 60 * 24));
      if (days >= 30) setProfileNotice(days);
    }
  }, [profile, profileUpdatedAt]);

  const updateKey = (id, val) => {
    const next = { ...keys, [id]:val };
    setKeys(next);
    if (saveKeys) saveSettings({ keys:next, saveKeys, profile });
  };

  const toggleSaveKeys = (val) => {
    setSaveKeys(val);
    if (val) {
      saveSettings({ keys, saveKeys:true, profile });
    } else {
      saveSettings({ keys:{}, saveKeys:false, profile });
    }
  };

  const updateProfile = (val) => {
    setProfile(val);
    if (saveKeys) saveSettings({ keys, saveKeys, profile:val });
  };

  // ── 暗号化エクスポート ──────────────────────────────────────

  const handleExport = async () => {
    if (!exportPw) { setCryptoMsg("❌ パスワードを入力してください"); setTimeout(() => setCryptoMsg(""), 2000); return; }
    try {
      const data = JSON.stringify({ keys, profile });
      const enc  = await encryptSettings(data, exportPw);
      setExportText(enc);
      await navigator.clipboard.writeText(enc).catch(() => {});
      setExportPw("");
      setCryptoMsg("✓ コピーしました（メモアプリに保存してください）");
      setTimeout(() => setCryptoMsg(""), 4000);
    } catch (e) {
      setCryptoMsg(`❌ 暗号化失敗: ${e.message}`);
      setTimeout(() => setCryptoMsg(""), 3000);
    }
  };

  const handleImport = async () => {
    if (!importPw || !importText.trim()) { setCryptoMsg("❌ パスワードとテキストを入力してください"); setTimeout(() => setCryptoMsg(""), 2000); return; }
    try {
      const raw    = await decryptSettings(importText.trim(), importPw);
      const result = JSON.parse(raw);
      if (typeof result !== "object" || result === null) throw new Error("Invalid data");
      const validKeys = {};
      if (result.keys && typeof result.keys === "object") {
        for (const id of ["claude", "chatgpt", "gemini"]) {
          validKeys[id] = typeof result.keys[id] === "string" ? result.keys[id] : "";
        }
      }
      const validProfile = typeof result.profile === "string" ? result.profile.slice(0, 10000) : "";
      setKeys((prev) => ({ ...prev, ...validKeys }));
      if (validProfile) setProfile(validProfile);
      if (saveKeys) saveSettings({ keys:{ ...keys, ...validKeys }, saveKeys, profile:validProfile||profile });
      setCryptoMsg("✓ 復元完了！");
      setImportText("");
      setImportPw("");
      setTimeout(() => { setCryptoMsg(""); setShowSave(false); }, 1500);
    } catch {
      setCryptoMsg("❌ 復元失敗（パスワードが違うか、テキストが壊れています）");
      setTimeout(() => setCryptoMsg(""), 3000);
    }
  };

  // ── サマリー生成 ────────────────────────────────────────────

  const runSummary = useCallback(async (roundMessages, roundNum) => {
    if (!keys.chatgpt) return;
    setSummaries((s) => [...s, null]);
    try {
      const summary = await generateSummary(keys.chatgpt, roundMessages, topic, roundNum);
      setSummaries((s) => {
        const next = [...s];
        next[roundNum - 1] = summary;
        return next;
      });
    } catch {
      setSummaries((s) => {
        const next = [...s];
        next[roundNum - 1] = { agreements:[], disagreements:[], unresolved:[], positionChanges:[], error:true };
        return next;
      });
    }
  }, [keys.chatgpt, topic]);

  // ── ラウンド実行 ────────────────────────────────────────────

  const runRound = useCallback(async (currentHistory, roundNum, userIntervention) => {
    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);
    setShowIntervention(false);
    setIntervention("");

    const initMessages = MODELS.map((m) => ({ modelId:m.id, text:"", error:null, loading:true }));
    setDiscussion((d) => [...d, { messages:initMessages, userIntervention }]);

    const models = MODE_MODELS[mode];

    const results = await Promise.all(
      MODELS.map(async (model) => {
        const { sys, user } = buildPrompt(model.id, topic, profile, currentHistory, roundNum, userIntervention, discussionMode);
        const tag = models[model.id].tag;

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
          if (model.id === "claude")  text = await callClaude(keys.claude, tag, sys, user, onChunk, sig);
          if (model.id === "chatgpt") text = await callChatGPT(keys.chatgpt, tag, sys, user, onChunk, sig);
          if (model.id === "gemini")  text = await callGemini(keys.gemini, tag, sys, user, onChunk, sig);
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
      runSummary(results, roundNum);
    }
  }, [mode, keys, topic, profile, discussionMode, runSummary]);

  const handleStart = async () => {
    if (!topic.trim() || running) return;
    setDiscussion([]);
    setSummaries([]);
    setStarted(true);
    setShowKeysPanel(false);
    setShowProfile(false);
    setShowSave(false);
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
      saveDiscussion(topic, discussion, summaries, mode, discussionMode).catch(() => {});
    }
    setDiscussion([]); setSummaries([]); setStarted(false); setShowIntervention(false); setSidePanel(false);
  };

  const handleExportMd = () => { downloadMarkdown(topic, discussion, summaries); };

  const handleLoadHistory = (item) => {
    if (!item?.topic || !Array.isArray(item.discussion)) return;
    setTopic(item.topic.slice(0, 2000));
    setDiscussion(item.discussion);
    setSummaries(Array.isArray(item.summaries) ? item.summaries : []);
    setDiscussionMode(DISCUSSION_MODES.some((m) => m.id === item.discussionMode) ? item.discussionMode : "standard");
    setStarted(true);
    setShowIntervention(true);
    setShowHistory(false);
  };

  const handleScrollToMessage = (quote) => {
    const els = document.querySelectorAll("[data-id^='msg-']");
    for (const el of els) {
      if (el.textContent?.includes(quote)) {
        el.scrollIntoView({ behavior:"smooth", block:"center" });
        el.style.outline = "2px solid #7c3aed";
        setTimeout(() => { el.style.outline = "none"; }, 2000);
        return;
      }
    }
  };

  const cm = MODE_MODELS[mode];
  const allKeysSet = keys.claude && keys.chatgpt && keys.gemini;

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

  const profileBadge = profile.trim()
    ? (profileUpdatedAt
        ? (() => { const d = Math.floor((Date.now() - new Date(profileUpdatedAt)) / (1000*60*60*24)); return d >= 30 ? `⚠️ 設定済（${d}日前に更新）` : `✓ 設定済（${d}日前に更新）`; })()
        : "✓ 設定済")
    : null;

  const latestSummary = summaries[summaries.length - 1] ?? null;

  return (
    <div style={{ minHeight:"100vh", background:"var(--bg)", color:"var(--text)", display:"flex", flexDirection:"column", alignItems:"center", padding:"24px 16px 80px" }}>

      {/* Profile update notice */}
      {profileNotice && (
        <div style={{ width:"100%", maxWidth:720, marginBottom:12, padding:"10px 16px", background:"var(--warning-bg)", border:"1px solid var(--warning-bd)", borderRadius:8, display:"flex", justifyContent:"space-between", alignItems:"center", gap:12 }}>
          <span style={{ color:"var(--warning)", fontSize:13 }}>📅 プロフィールが{profileNotice}日間更新されていません。Claude.aiやChatGPTで最新情報を取得して更新することをおすすめします。</span>
          <button onClick={() => { setProfileNotice(false); sessionStorage.setItem("profile-notice-dismissed","1"); }} aria-label="通知を閉じる" style={{ background:"none", border:"none", color:"var(--warning)", cursor:"pointer", fontSize:16, padding:"0 4px", flexShrink:0 }}>✕</button>
        </div>
      )}

      {/* Header */}
      <div style={{ textAlign:"center", marginBottom:20, width:"100%", maxWidth:720 }}>
        <div style={{ fontSize:11, color:"var(--text3)", letterSpacing:"0.3em", marginBottom:6 }}>AI ROUNDTABLE</div>
        <h1 style={{ margin:"0 0 14px", fontSize:22, fontWeight:700, color:"var(--text)" }}>3 AI Discussion</h1>
        <div style={{ display:"flex", justifyContent:"center", gap:8, flexWrap:"wrap" }}>
          {MODELS.map((m) => <ModelBadge key={m.id} model={m} tag={cm[m.id].label} />)}
        </div>
      </div>

      <div style={{ width:"100%", maxWidth: started ? (sidePanel ? 1480 : 1100) : 720 }}>

        {/* Mode + Theme */}
        <div style={{ display:"flex", gap:8, marginBottom:10, flexWrap:"wrap" }}>
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

        {/* Discussion Mode */}
        <div role="radiogroup" aria-label="議論モード" style={{ display:"flex", gap:6, marginBottom:10, flexWrap:"wrap" }}>
          {DISCUSSION_MODES.map(({id,label,description}) => (
            <button key={id} role="radio" aria-checked={discussionMode===id} onClick={() => setDiscussionMode(id)} title={description}
              style={{ padding:"5px 12px", border:"1px solid var(--border)", borderRadius:20, cursor:"pointer", fontSize:11, fontWeight:600, background:discussionMode===id?"var(--accent)":"transparent", color:discussionMode===id?"#fff":"var(--text2)" }}>
              {label}
            </button>
          ))}
        </div>

        {/* API Keys */}
        <Collapsible label="APIキー" badge={allKeysSet?"✓ 全て設定済":null} hint={!allKeysSet?"⚠ 未設定あり":null} open={showKeys} onToggle={() => setShowKeysPanel((s)=>!s)}>
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
                    style={{ padding:"8px 12px", background:"var(--accent-bg)", border:"1px solid #2a4a7f", borderRadius:6, color:keyStatus[id]==="ok"?"var(--success)":"var(--link)", cursor:keys[id]?"pointer":"not-allowed", fontSize:11, fontWeight:600, whiteSpace:"nowrap" }}>
                    {keyStatus[id]==="checking"?"確認中..." : keyStatus[id]==="ok"?"✓ OK" : keyStatus[id]?.startsWith("error")?"✗ NG":"疎通確認"}
                  </button>
                </div>
                {keyStatus[id]?.startsWith("error") && (
                  <div style={{ fontSize:11, color:"var(--error)", marginTop:4 }}>{keyStatus[id]}</div>
                )}
              </div>
            ))}

            <div style={{ padding:"10px 12px", background:"var(--surface)", border:"1px solid var(--border)", borderRadius:8, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div>
                <div style={{ fontSize:12, color:"var(--text2)", fontWeight:600 }}>このブラウザに保存する</div>
                <div style={{ fontSize:11, color:"var(--text3)", marginTop:2 }}>デフォルトはOFF。ONにするとlocalStorageに保存されます。</div>
              </div>
              <button onClick={() => toggleSaveKeys(!saveKeys)} aria-label={`ブラウザ保存 ${saveKeys?"OFF":"ON"}に切り替え`} style={{ padding:"6px 16px", border:"none", borderRadius:20, cursor:"pointer", fontSize:12, fontWeight:700, background:saveKeys?"var(--success)":"#2a2a3a", color:saveKeys?"#fff":"var(--text2)" }}>
                {saveKeys ? "ON" : "OFF"}
              </button>
            </div>

            <div style={{ fontSize:11, color:"var(--text3)", lineHeight:1.6 }}>
              ※ キーはこのブラウザのlocalStorageのみに保存。運営者サーバーには一切送信されません。<br/>
              ※ XSSや端末共有・画面共有等の環境リスクはご自身で管理してください。
            </div>
          </div>
        </Collapsible>

        {/* Security */}
        <SecurityPanel open={showSecurity} onToggle={() => setShowSecurity((s)=>!s)} />

        {/* Profile */}
        <Collapsible label="あなたのプロフィール" badge={profileBadge} hint={!profile.trim()?"任意":null} open={showProfile} onToggle={() => setShowProfile((s)=>!s)}>
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            <div style={{ fontSize:11, color:"#ffffff40" }}>各AIのシステムプロンプトに自動注入。Claude.aiで「今まで把握している私の情報をまとめて」と聞いた内容をそのまま貼るのがおすすめ。</div>
            <textarea value={profile} onChange={(e) => updateProfile(e.target.value)} maxLength={5000} aria-label="プロフィール"
              placeholder={"例:\n- エンジニア、30代\n- 会社員＋LLC運営\n- 最小労働・最大成果を目指している"} rows={5}
              style={{ width:"100%", background:"var(--bg)", border:"1px solid var(--border)", borderRadius:6, padding:10, color:"var(--text)", fontSize:13, lineHeight:1.7, resize:"vertical" }} />
            {profile.trim() && <button onClick={() => updateProfile("")} aria-label="プロフィールをクリア" style={{ alignSelf:"flex-end", background:"none", border:"1px solid #3a2a2a", borderRadius:6, padding:"4px 12px", color:"var(--error)", cursor:"pointer", fontSize:11 }}>クリア</button>}
          </div>
        </Collapsible>

        {/* Backup */}
        <Collapsible label="🔐 設定の暗号化バックアップ" open={showSave} onToggle={() => setShowSave((s)=>!s)}>
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            <div style={{ padding:"10px 12px", background:"var(--warning-bg)", border:"1px solid #78350f", borderRadius:8, fontSize:11, color:"var(--warning)", lineHeight:1.6 }}>
              ⚠ APIキーはAES-GCM（256bit）で暗号化されます。<br/>
              パスワードを忘れると復元できません。安全な場所に保管してください。
            </div>

            <div>
              <div style={{ fontSize:12, color:"var(--text2)", marginBottom:8 }}>① バックアップの作成</div>
              <input type="password" value={exportPw} onChange={(e) => setExportPw(e.target.value)} placeholder="バックアップ用パスワードを設定" aria-label="エクスポート用パスワード"
                style={{ width:"100%", background:"var(--bg)", border:"1px solid var(--border)", borderRadius:6, padding:"8px 10px", color:"var(--text)", fontSize:13, fontFamily:"monospace", marginBottom:8 }} />
              <button onClick={handleExport} disabled={!exportPw} style={{ width:"100%", background:exportPw?"var(--accent-bg)":"var(--surface)", border:"1px solid #2a4a7f", borderRadius:8, padding:"10px 20px", color:"#fff", fontSize:13, cursor:exportPw?"pointer":"not-allowed", fontWeight:600, opacity:exportPw?1:0.5 }}>
                🔐 暗号化してコピー
              </button>
              {exportText && (
                <textarea readOnly value={exportText} rows={3} aria-label="暗号化されたバックアップ"
                  style={{ width:"100%", background:"var(--bg)", border:"1px solid var(--border)", borderRadius:6, padding:10, color:"var(--text2)", fontSize:10, resize:"none", fontFamily:"monospace", marginTop:8 }} />
              )}
            </div>

            <div style={{ height:1, background:"var(--border)" }} />

            <div>
              <div style={{ fontSize:12, color:"var(--text2)", marginBottom:8 }}>② バックアップから復元</div>
              <textarea value={importText} onChange={(e) => setImportText(e.target.value)} placeholder="バックアップテキストを貼り付け" rows={3} aria-label="バックアップテキスト"
                style={{ width:"100%", background:"var(--bg)", border:"1px solid var(--border)", borderRadius:6, padding:10, color:"var(--text)", fontSize:12, resize:"none", fontFamily:"monospace", marginBottom:8 }} />
              <input type="password" value={importPw} onChange={(e) => setImportPw(e.target.value)} placeholder="バックアップ時に設定したパスワード" aria-label="インポート用パスワード"
                style={{ width:"100%", background:"var(--bg)", border:"1px solid var(--border)", borderRadius:6, padding:"8px 10px", color:"var(--text)", fontSize:13, fontFamily:"monospace", marginBottom:8 }} />
              <button onClick={handleImport} disabled={!importText.trim()||!importPw} style={{ width:"100%", background:"var(--accent)", border:"none", borderRadius:8, padding:"10px 20px", color:"#fff", fontSize:13, cursor:(importText.trim()&&importPw)?"pointer":"not-allowed", fontWeight:600, opacity:(importText.trim()&&importPw)?1:0.4 }}>
                復元する
              </button>
            </div>

            {cryptoMsg && (
              <div style={{ fontSize:13, color:cryptoMsg.startsWith("✓")?"var(--success)":"var(--error)", textAlign:"center" }}>{cryptoMsg}</div>
            )}
          </div>
        </Collapsible>

        {/* History */}
        <HistoryPanel open={showHistory} onToggle={() => setShowHistory((s)=>!s)} onLoad={handleLoadHistory} />

        {/* Topic */}
        {!started && (
          <div style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:12, overflow:"hidden", marginTop:4 }}>
            <textarea value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={2000} aria-label="議題"
              onKeyDown={(e) => { if (e.key==="Enter"&&(e.metaKey||e.ctrlKey)) handleStart(); }}
              placeholder={"議題を入力...\n例: AIは人間の仕事を奪うか\nCtrl+Enter で開始"} rows={3}
              style={{ width:"100%", background:"transparent", border:"none", padding:14, color:"var(--text)", fontSize:14, lineHeight:1.7, resize:"vertical" }} />
            <div style={{ padding:"8px 12px", borderTop:"1px solid var(--border)", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <span style={{ fontSize:11, color:profile.trim()?"var(--success)":"var(--text3)" }}>{profile.trim()?"👤 プロフィールあり":"👤 なし"}</span>
              <button onClick={handleStart} disabled={!topic.trim()||running||!allKeysSet}
                style={{ background:allKeysSet&&topic.trim()?"var(--accent)":"#2a2a3a", border:"none", borderRadius:8, padding:"8px 20px", color:"#fff", fontSize:13, fontWeight:700, cursor:(topic.trim()&&allKeysSet)?"pointer":"not-allowed", opacity:(topic.trim()&&allKeysSet)?1:0.35 }}>
                {!allKeysSet?"キーを設定してください":"▶ 開始"}
              </button>
            </div>
          </div>
        )}

        {/* Topic display */}
        {started && (
          <div style={{ padding:"10px 14px", background:"var(--accent-bg)", border:"1px solid #4c1d9540", borderRadius:10, marginBottom:20, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <div>
              <div style={{ fontSize:10, color:"var(--text3)", fontFamily:"monospace", marginBottom:3 }}>議題{profile.trim()?" · 👤":""}</div>
              <div style={{ fontSize:14, color:"var(--accent-light)", fontWeight:500 }}>{topic}</div>
            </div>
            <div style={{ display:"flex", gap:6 }}>
              {discussion.length > 0 && (
                <button onClick={handleExportMd} aria-label="Markdownエクスポート" style={{ background:"none", border:"1px solid var(--border)", borderRadius:6, padding:"4px 10px", color:"var(--text2)", cursor:"pointer", fontSize:12 }}>📥 MD</button>
              )}
              <button onClick={handleReset} style={{ background:"none", border:"1px solid var(--accent-bd)", borderRadius:6, padding:"4px 10px", color:"var(--text3)", cursor:"pointer", fontSize:12 }}>リセット</button>
            </div>
          </div>
        )}

        {/* Discussion + Side Panel layout */}
        <div className={sidePanel ? "app-layout" : ""}>
          <div className={sidePanel ? "app-main" : ""}>
            {/* Discussion rounds with inline summaries */}
            {discussion.map((round, i) => (
              <div key={i}>
                <RoundSection round={round} roundNum={i+1} isLatest={i===discussion.length-1} />
                {!sidePanel && summaries[i] !== undefined && (
                  <SummaryPanel
                    summary={summaries[i]}
                    roundNum={i+1}
                    onScrollToMessage={handleScrollToMessage}
                    sidePanel={false}
                    onToggleSidePanel={() => setSidePanel(true)}
                  />
                )}
              </div>
            ))}

            {/* Stop button */}
            {running && (
              <div style={{ textAlign:"center", marginTop:8 }}>
                <button onClick={handleStop} style={{ background:"none", border:"1px solid #ef4444", borderRadius:20, padding:"8px 24px", color:"var(--error)", cursor:"pointer", fontSize:13, fontWeight:600 }}>
                  ⏹ 停止
                </button>
              </div>
            )}

            {/* User intervention + next round */}
            {showIntervention && !running && discussion.length > 0 && (
              <div style={{ marginTop:16, display:"flex", flexDirection:"column", gap:10 }}>
                <div style={{ background:"var(--surface)", border:"1px solid var(--accent-bd)", borderRadius:12, overflow:"hidden" }}>
                  <textarea value={intervention} onChange={(e) => setIntervention(e.target.value)} maxLength={1000} aria-label="司会者介入"
                    placeholder="💬 司会者として介入する（任意）\n例: 経済的影響についてもっと掘り下げてください"
                    rows={2}
                    style={{ width:"100%", background:"transparent", border:"none", padding:"12px 14px", color:"var(--accent-light)", fontSize:13, lineHeight:1.6, resize:"none" }} />
                </div>
                <div style={{ textAlign:"center" }}>
                  <button onClick={handleNextRound} style={{ background:"none", border:"1px solid #7c3aed", borderRadius:20, padding:"10px 28px", color:"var(--accent-light)", cursor:"pointer", fontSize:13, fontWeight:600 }}>
                    ↻ 次のラウンドへ（Round {discussion.length+1}）
                  </button>
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Side panel mode */}
          {sidePanel && latestSummary !== undefined && (
            <SummaryPanel
              summary={latestSummary}
              roundNum={discussion.length}
              onScrollToMessage={handleScrollToMessage}
              sidePanel={true}
              onToggleSidePanel={() => setSidePanel(false)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
