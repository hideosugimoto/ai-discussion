import { useState, useRef, useEffect, useCallback } from "react";
import { MODELS, MODE_MODELS, THEMES, DISCUSSION_MODES, UI_MODES } from "./constants";
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
import { downloadMarkdown, downloadHtml } from "./export";
import { saveDiscussion, loadDiscussion } from "./history";
import HistoryPanel from "./components/HistoryPanel";
import PersonaPanel from "./components/PersonaPanel";
import ActionPlanView from "./components/ActionPlanView";
import { buildActionPlanPrompt, parseActionPlan } from "./actionPlan";
import actionPlanPromptText from "./prompts/action-plan.txt?raw";
import summaryPromptText from "./prompts/summary.txt?raw";
import detailedPromptText from "./prompts/detailed-analysis.txt?raw";

// ── Summary generation ────────────────────────────────────────

async function generateSummary(apiKey, messages, topic, roundNum, personas) {
  const roundText = messages
    .map((m) => {
      const name = MODELS.find((x) => x.id === m.modelId)?.name ?? m.modelId;
      const p = (personas?.[m.modelId] || "").trim();
      return `[${p ? `${name}（${p}）` : name}] ${m.text || "(エラー)"}`;
    })
    .join("\n\n");

  const userMsg = `【議題】${topic}\n【Round ${roundNum}の発言】\n${roundText}\n\nJSON形式で出力してください。`;

  const text = await callChatGPT(apiKey, "gpt-4o-mini", summaryPromptText, userMsg, () => {});
  const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  const parsed = JSON.parse(cleaned);
  if (!parsed || typeof parsed !== "object") throw new Error("Invalid summary format");
  return {
    agreements: Array.isArray(parsed.agreements) ? parsed.agreements : [],
    disagreements: Array.isArray(parsed.disagreements) ? parsed.disagreements : [],
    unresolved: Array.isArray(parsed.unresolved) ? parsed.unresolved : [],
    positionChanges: Array.isArray(parsed.positionChanges) ? parsed.positionChanges : [],
  };
}

async function generateDetailedAnalysis(apiKey, allRounds, topic, personas) {
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

  const text = await callChatGPT(apiKey, "gpt-4o-mini", detailedPromptText, userMsg, () => {});
  const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  const parsed = JSON.parse(cleaned);
  if (!parsed || typeof parsed !== "object") throw new Error("Invalid analysis format");
  return {
    themes: Array.isArray(parsed.themes) ? parsed.themes : [],
    consensus: Array.isArray(parsed.consensus) ? parsed.consensus : [],
    unresolved: Array.isArray(parsed.unresolved) ? parsed.unresolved : [],
  };
}

// ── Main App ───────────────────────────────────────────────────

export default function App() {
  const [theme, setTheme] = useState(() => localStorage.getItem("ai-discussion-theme") || "dark");
  const [uiMode, setUiMode] = useState(() => localStorage.getItem("ai-discussion-ui-mode") || "structure");

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("ai-discussion-theme", theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.setAttribute("data-ui-mode", uiMode);
    localStorage.setItem("ai-discussion-ui-mode", uiMode);
  }, [uiMode]);

  const saved = loadSettings();
  const [keys, setKeys]         = useState({ claude:"", chatgpt:"", gemini:"", ...saved.keys });
  const [saveKeys, setSaveKeys] = useState(saved.saveKeys ?? false);
  const [profile, setProfile]   = useState(saved.profile ?? "");
  const [profileUpdatedAt]      = useState(saved.profileUpdatedAt ?? null);
  const [topic, setTopic]       = useState("");
  const [mode, setMode]         = useState("best");
  const [discussion, setDiscussion] = useState([]);
  const [summaries, setSummaries] = useState([]);
  const [detailedAnalyses, setDetailedAnalyses] = useState([]);
  const [running, setRunning]   = useState(false);
  const [started, setStarted]   = useState(false);
  const [intervention, setIntervention] = useState("");
  const [showIntervention, setShowIntervention] = useState(false);
  const [profileNotice, setProfileNotice] = useState(false);
  const [sidePanel, setSidePanel] = useState(false);

  const [activePanel, setActivePanel] = useState(!saved.keys?.claude ? "keys" : null);
  const togglePanel = (id) => setActivePanel((p) => p === id ? null : id);
  const [discussionMode, setDiscussionMode] = useState("standard");
  const [personas, setPersonas] = useState({ claude:"", chatgpt:"", gemini:"" });
  const [constitution, setConstitution] = useState(saved.constitution ?? "");
  const [actionPlan, setActionPlan] = useState(null);
  const [actionPlanLoading, setActionPlanLoading] = useState(false);

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
    if (saveKeys) saveSettings({ keys:next, saveKeys, profile, constitution });
  };

  const toggleSaveKeys = (val) => {
    setSaveKeys(val);
    if (val) {
      saveSettings({ keys, saveKeys:true, profile, constitution });
    } else {
      saveSettings({ keys:{}, saveKeys:false, profile, constitution });
    }
  };

  const updateProfile = (val) => {
    setProfile(val);
    if (saveKeys) saveSettings({ keys, saveKeys, profile:val, constitution });
  };

  const updateConstitution = (val) => {
    setConstitution(val);
    if (saveKeys) saveSettings({ keys, saveKeys, profile, constitution:val });
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
      setTimeout(() => { setCryptoMsg(""); setActivePanel(null); }, 1500);
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
      const summary = await generateSummary(keys.chatgpt, roundMessages, topic, roundNum, personas);
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
  }, [keys.chatgpt, topic, personas]);

  const runDetailedAnalysis = useCallback(async (roundIdx) => {
    if (!keys.chatgpt || detailedAnalyses[roundIdx]) return;
    setDetailedAnalyses((s) => { const next = [...s]; next[roundIdx] = null; return next; });
    try {
      const roundsUpTo = discussion.slice(0, roundIdx + 1);
      const analysis = await generateDetailedAnalysis(keys.chatgpt, roundsUpTo, topic, personas);
      setDetailedAnalyses((s) => { const next = [...s]; next[roundIdx] = analysis; return next; });
    } catch {
      setDetailedAnalyses((s) => { const next = [...s]; next[roundIdx] = { themes: [], consensus: [], unresolved: [], error: true }; return next; });
    }
  }, [keys.chatgpt, topic, discussion, detailedAnalyses]);

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
        const { sys, user } = buildPrompt(model.id, topic, profile, currentHistory, roundNum, userIntervention, discussionMode, personas, constitution);
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
  }, [mode, keys, topic, profile, discussionMode, personas, constitution, runSummary]);

  const handleStart = async () => {
    if (!topic.trim() || running) return;
    setDiscussion([]);
    setSummaries([]);
    setDetailedAnalyses([]);
    setStarted(true);
    setActivePanel(null);
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
      saveDiscussion(topic, discussion, summaries, mode, discussionMode, personas).catch(() => {});
    }
    setDiscussion([]); setSummaries([]); setDetailedAnalyses([]); setActionPlan(null); setStarted(false); setShowIntervention(false); setSidePanel(false);
  };

  const handleGenerateActionPlan = async () => {
    if (!keys.chatgpt || actionPlanLoading) return;
    setActionPlanLoading(true);
    try {
      const userMsg = buildActionPlanPrompt(topic, discussion, summaries);
      const raw = await callChatGPT(keys.chatgpt, "gpt-4o-mini", actionPlanPromptText, userMsg, () => {});
      setActionPlan(parseActionPlan(raw));
    } catch {
      setActionPlan({ conclusion: "生成に失敗しました", actions: [], risks: [], nextQuestion: "" });
    } finally {
      setActionPlanLoading(false);
    }
  };

  const handleExportMd = () => { downloadMarkdown(topic, discussion, summaries, personas); };
  const handleExportHtml = () => { downloadHtml(topic, discussion, summaries, personas); };

  const handleLoadHistory = (item) => {
    if (!item?.topic || !Array.isArray(item.discussion)) return;
    setTopic(item.topic.slice(0, 2000));
    setDiscussion(item.discussion);
    setSummaries(Array.isArray(item.summaries) ? item.summaries : []);
    setDiscussionMode(DISCUSSION_MODES.some((m) => m.id === item.discussionMode) ? item.discussionMode : "standard");
    setPersonas(item.personas && typeof item.personas === "object" ? { claude: item.personas.claude || "", chatgpt: item.personas.chatgpt || "", gemini: item.personas.gemini || "" } : { claude:"", chatgpt:"", gemini:"" });
    setStarted(true);
    setShowIntervention(true);
    setShowHistory(false);
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
    <div style={{ minHeight:"100vh", background:"var(--bg)", color:"var(--text)", display:"flex", flexDirection:"column", alignItems:"center", padding:`var(--ui-pad-lg) 16px 80px` }}>

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
        <h1 style={{ margin:"0 0 14px", fontSize:"var(--ui-header-font)", fontWeight:700, color:"var(--text)" }}>3 AI Discussion</h1>
        <div style={{ display:"flex", justifyContent:"center", gap:8, flexWrap:"wrap" }}>
          {MODELS.map((m) => <ModelBadge key={m.id} model={m} tag={cm[m.id].label} />)}
        </div>
      </div>

      <div style={{ width:"100%", maxWidth: started ? (sidePanel ? 1480 : 1100) : 720 }}>

        {/* Mode + Theme */}
        <div style={{ display:"flex", gap:8, marginBottom:10, flexWrap:"wrap" }}>
          <div role="radiogroup" aria-label="モード選択" style={{ display:"flex", background:"var(--surface)", border:"1px solid var(--border)", borderRadius:"var(--ui-radius)", overflow:"hidden" }}>
            {[{id:"best",label:"🧠 最強"},{id:"fast",label:"⚡ 高速"}].map(({id,label}) => (
              <button key={id} role="radio" aria-checked={mode===id} onClick={() => setMode(id)} style={{ padding:"6px 14px", border:"none", cursor:"pointer", fontSize:12, fontWeight:600, background:mode===id?"var(--accent)":"transparent", color:mode===id?"#fff":"var(--text2)" }}>{label}</button>
            ))}
          </div>
          <div role="radiogroup" aria-label="テーマ選択" style={{ display:"flex", background:"var(--surface)", border:"1px solid var(--border)", borderRadius:"var(--ui-radius)", overflow:"hidden" }}>
            {THEMES.map(({id,label}) => (
              <button key={id} role="radio" aria-checked={theme===id} onClick={() => setTheme(id)} style={{ padding:"6px 12px", border:"none", cursor:"pointer", fontSize:11, fontWeight:600, background:theme===id?"var(--accent)":"transparent", color:theme===id?"#fff":"var(--text2)" }}>{label}</button>
            ))}
          </div>
          <div role="radiogroup" aria-label="UIモード選択" className="ui-mode-switcher">
            {UI_MODES.map(({id,label,icon}) => (
              <button key={id} role="radio" aria-checked={uiMode===id} onClick={() => setUiMode(id)} className="ui-mode-btn">
                {icon} {label}
              </button>
            ))}
          </div>
        </div>
        <div className="ui-mode-desc">{UI_MODES.find((m) => m.id === uiMode)?.description}</div>

        {/* Discussion Mode */}
        <div style={{ marginBottom:10 }}>
          <div style={{ fontSize:11, color:"var(--text3)", fontFamily:"monospace", letterSpacing:"0.1em", marginBottom:6 }}>議論モード — AIの議論スタイルを選択</div>
          <div role="radiogroup" aria-label="議論モード" style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
            {DISCUSSION_MODES.map(({id,label,description}) => (
              <button key={id} role="radio" aria-checked={discussionMode===id} onClick={() => setDiscussionMode(id)}
                style={{ padding:"5px 12px", border:"1px solid var(--border)", borderRadius:"var(--ui-radius-pill)", cursor:"pointer", fontSize:11, fontWeight:600, background:discussionMode===id?"var(--accent)":"transparent", color:discussionMode===id?"#fff":"var(--text2)" }}>
                {label}
              </button>
            ))}
          </div>
          <div style={{ fontSize:11, color:"var(--text2)", marginTop:4 }}>
            {DISCUSSION_MODES.find((m) => m.id === discussionMode)?.description}
          </div>
        </div>

        {/* Persona */}
        <PersonaPanel personas={personas} onChange={setPersonas} />

        {/* Settings bar - horizontal buttons */}
        <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:activePanel ? 0 : 10 }}>
          {[
            { id:"keys",     label:"APIキー",   badge:allKeysSet?"✓":"⚠" },
            { id:"security", label:"🔒 セキュリティ" },
            { id:"profile",  label:"👤 プロフィール", badge:profile.trim()?"✓":null },
            { id:"constitution", label:"📜 憲法", badge:constitution.trim()?"✓":null },
            { id:"backup",   label:"🔐 バックアップ" },
            { id:"history",  label:"📂 履歴" },
          ].map(({id,label,badge}) => (
            <button key={id} onClick={() => togglePanel(id)}
              style={{ padding:"5px 12px", border:`1px solid ${activePanel===id?"var(--accent-bd)":"var(--border)"}`, borderRadius:"var(--ui-radius)", cursor:"pointer", fontSize:11, fontFamily:"monospace", background:activePanel===id?"var(--accent-bg)":"transparent", color:activePanel===id?"var(--text)":"var(--text2)", display:"flex", alignItems:"center", gap:4 }}>
              <span>{label}</span>
              {badge && <span style={{ fontSize:10, color:badge==="✓"?"var(--success)":"var(--warning)" }}>{badge}</span>}
            </button>
          ))}
          <button onClick={() => toggleSaveKeys(!saveKeys)} aria-label={`ブラウザ保存 ${saveKeys?"OFF":"ON"}に切り替え`}
            style={{ marginLeft:"auto", padding:"5px 12px", border:`1px solid ${saveKeys?"var(--success)":"var(--border)"}`, borderRadius:"var(--ui-radius)", cursor:"pointer", fontSize:11, fontFamily:"monospace", background:saveKeys?"var(--success)":"transparent", color:saveKeys?"#fff":"var(--text2)", display:"flex", alignItems:"center", gap:4 }}>
            <span>{saveKeys ? "💾 保存ON" : "💾 保存OFF"}</span>
          </button>
        </div>
        {saveKeys && (
          <div style={{ fontSize:11, color:"var(--text3)", marginBottom:8 }}>
            APIキーとプロフィールをこのブラウザに保存中（localStorage）
          </div>
        )}

        {/* Expanded panel content */}
        {activePanel === "keys" && (
          <div style={{ marginTop:8, marginBottom:10, padding:"var(--ui-pad)", background:"var(--ui-card-bg)", border:"var(--ui-card-border)", borderRadius:"var(--ui-radius-lg)" }}>
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
          <div style={{ marginTop:8, marginBottom:10, padding:"var(--ui-pad)", background:"var(--ui-card-bg)", border:"var(--ui-card-border)", borderRadius:"var(--ui-radius-lg)" }}>
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
          <div style={{ marginTop:8, marginBottom:10, padding:"var(--ui-pad)", background:"var(--ui-card-bg)", border:"var(--ui-card-border)", borderRadius:"var(--ui-radius-lg)" }}>
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
          <div style={{ marginTop:8, marginBottom:10, padding:"var(--ui-pad)", background:"var(--ui-card-bg)", border:"var(--ui-card-border)", borderRadius:"var(--ui-radius-lg)" }}>
            <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
              <div style={{ padding:"10px 12px", background:"var(--warning-bg)", border:"1px solid var(--warning-bd)", borderRadius:8, fontSize:11, color:"var(--warning)", lineHeight:1.6 }}>
                ⚠ APIキーはAES-GCM（256bit）で暗号化されます。<br/>
                パスワードを忘れると復元できません。安全な場所に保管してください。
              </div>
              <div>
                <div style={{ fontSize:12, color:"var(--text2)", marginBottom:8 }}>① バックアップの作成</div>
                <input type="password" value={exportPw} onChange={(e) => setExportPw(e.target.value)} placeholder="バックアップ用パスワードを設定" aria-label="エクスポート用パスワード"
                  style={{ width:"100%", background:"var(--bg)", border:"1px solid var(--border)", borderRadius:6, padding:"8px 10px", color:"var(--text)", fontSize:13, fontFamily:"monospace", marginBottom:8 }} />
                <button onClick={handleExport} disabled={!exportPw} style={{ width:"100%", background:exportPw?"var(--accent-bg)":"var(--surface)", border:"1px solid var(--accent-bd)", borderRadius:8, padding:"10px 20px", color:"#fff", fontSize:13, cursor:exportPw?"pointer":"not-allowed", fontWeight:600, opacity:exportPw?1:0.5 }}>
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
          </div>
        )}

        {activePanel === "history" && (
          <div style={{ marginTop:8, marginBottom:10 }}>
            <HistoryPanel open={true} onToggle={() => togglePanel("history")} onLoad={handleLoadHistory} />
          </div>
        )}

        {/* Topic */}
        {!started && (
          <div style={{ background:"var(--ui-card-bg)", border:"var(--ui-card-border)", borderRadius:"var(--ui-radius-lg)", overflow:"hidden", marginTop:4 }}>
            <textarea value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={2000} aria-label="議題"
              onKeyDown={(e) => { if (e.key==="Enter"&&(e.metaKey||e.ctrlKey)) handleStart(); }}
              placeholder={"議題を入力...\n例: AIは人間の仕事を奪うか\nCtrl+Enter で開始"} rows={3}
              style={{ width:"100%", background:"transparent", border:"none", padding:14, color:"var(--text)", fontSize:14, lineHeight:1.7, resize:"vertical" }} />
            <div style={{ padding:"8px 12px", borderTop:"1px solid var(--border)", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <span style={{ fontSize:11, color:profile.trim()?"var(--success)":"var(--text3)" }}>{profile.trim()?"👤 プロフィールあり":"👤 なし"}</span>
              <button onClick={handleStart} disabled={!topic.trim()||running||!allKeysSet}
                style={{ background:allKeysSet&&topic.trim()?"var(--accent)":"var(--surface)", border:"1px solid var(--border)", borderRadius:"var(--ui-radius)", padding:"8px 20px", color:allKeysSet&&topic.trim()?"#fff":"var(--text3)", fontSize:13, fontWeight:700, cursor:(topic.trim()&&allKeysSet)?"pointer":"not-allowed", opacity:(topic.trim()&&allKeysSet)?1:0.35 }}>
                {!allKeysSet?"キーを設定してください":"▶ 開始"}
              </button>
            </div>
          </div>
        )}

        {/* Topic display */}
        {started && (
          <div style={{ padding:"var(--ui-pad-sm) var(--ui-pad)", background:"var(--accent-bg)", border:"1px solid var(--accent-bd)", borderRadius:"var(--ui-radius-lg)", marginBottom:"var(--ui-gap-lg)", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
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
            {/* Discussion rounds with inline summaries */}
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

            {/* Stop button */}
            {running && (
              <div style={{ textAlign:"center", marginTop:8 }}>
                <button onClick={handleStop} style={{ background:"none", border:"1px solid var(--error)", borderRadius:"var(--ui-radius-pill)", padding:"var(--ui-btn-pad)", color:"var(--error)", cursor:"pointer", fontSize:"var(--ui-btn-font)", fontWeight:600 }}>
                  ⏹ 停止
                </button>
              </div>
            )}

            {/* User intervention + next round */}
            {showIntervention && !running && discussion.length > 0 && (
              <div style={{ marginTop:16, display:"flex", flexDirection:"column", gap:10 }}>
                <div style={{ background:"var(--ui-card-bg)", border:"1px solid var(--accent-bd)", borderRadius:"var(--ui-radius-lg)", overflow:"hidden" }}>
                  <textarea value={intervention} onChange={(e) => setIntervention(e.target.value)} maxLength={1000} aria-label="司会者介入"
                    placeholder="💬 司会者として介入する（任意）\n例: 経済的影響についてもっと掘り下げてください"
                    rows={2}
                    style={{ width:"100%", background:"transparent", border:"none", padding:"12px 14px", color:"var(--accent-light)", fontSize:13, lineHeight:1.6, resize:"none" }} />
                </div>
                <div style={{ textAlign:"center" }}>
                  <button onClick={handleNextRound} style={{ background:"none", border:"1px solid var(--accent)", borderRadius:"var(--ui-radius-pill)", padding:"var(--ui-btn-pad)", color:"var(--accent-light)", cursor:"pointer", fontSize:"var(--ui-btn-font)", fontWeight:600 }}>
                    ↻ 次のラウンドへ（Round {discussion.length+1}）
                  </button>
                </div>
              </div>
            )}

            {/* Action Plan */}
            {!running && discussion.length > 0 && (
              <ActionPlanView plan={actionPlan} loading={actionPlanLoading} onGenerate={handleGenerateActionPlan} />
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
              detailedAnalysis={detailedAnalyses[discussion.length - 1]}
              onRequestDetailed={() => runDetailedAnalysis(discussion.length - 1)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
