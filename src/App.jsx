import { useState, useRef, useEffect, useCallback } from "react";
import { MODELS, MODE_MODELS } from "./constants";
import { buildPrompt } from "./prompt";
import { callClaude, callChatGPT, callGemini } from "./api";
import { encryptSettings, decryptSettings } from "./crypto";
import { loadSettings, saveSettings } from "./storage";
import ModelBadge from "./components/ModelBadge";
import RoundSection from "./components/RoundSection";
import Collapsible from "./components/Collapsible";
import SecurityPanel from "./components/SecurityPanel";
import useKeyValidation from "./hooks/useKeyValidation";

// ── Main App ───────────────────────────────────────────────────

export default function App() {
  const saved = loadSettings();
  const [keys, setKeys]         = useState({ claude:"", chatgpt:"", gemini:"", ...saved.keys });
  const [saveKeys, setSaveKeys] = useState(saved.saveKeys ?? false);
  const [profile, setProfile]   = useState(saved.profile ?? "");
  const [profileUpdatedAt]      = useState(saved.profileUpdatedAt ?? null);
  const [topic, setTopic]       = useState("");
  const [mode, setMode]         = useState("best");
  const [discussion, setDiscussion] = useState([]);
  const [running, setRunning]   = useState(false);
  const [started, setStarted]   = useState(false);
  const [intervention, setIntervention] = useState("");
  const [showIntervention, setShowIntervention] = useState(false);
  const [profileNotice, setProfileNotice] = useState(false);

  const [showKeys, setShowKeysPanel]     = useState(!saved.keys?.claude);
  const [showProfile, setShowProfile]   = useState(false);
  const [showSave, setShowSave]         = useState(false);
  const [showSecurity, setShowSecurity] = useState(false);

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

  // キー更新 + 保存
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
        const { sys, user } = buildPrompt(model.id, topic, profile, currentHistory, roundNum, userIntervention);
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
    if (!controller.signal.aborted) setShowIntervention(true);
  }, [mode, keys, topic, profile]);

  const handleStart = async () => {
    if (!topic.trim() || running) return;
    setDiscussion([]);
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
  const handleReset = () => { abortRef.current?.abort(); setDiscussion([]); setStarted(false); setShowIntervention(false); };

  const cm = MODE_MODELS[mode];
  const allKeysSet = keys.claude && keys.chatgpt && keys.gemini;

  const keyConfigs = [
    { id:"claude",  label:"Anthropic API Key (Claude)", ph:"sk-ant-...",  link:"https://console.anthropic.com" },
    { id:"chatgpt", label:"OpenAI API Key (ChatGPT)",   ph:"sk-...",      link:"https://platform.openai.com/api-keys" },
    { id:"gemini",  label:"Google API Key (Gemini)",    ph:"AIza...",     link:"https://aistudio.google.com/apikey" },
  ];

  const validationColor = (id) => {
    const s = keyStatus[id];
    if (!s) return "#2a2a3a";
    if (s === "checking") return "#f59e0b40";
    if (s === "ok") return "#16a34a60";
    return "#ef444460";
  };

  const profileBadge = profile.trim()
    ? (profileUpdatedAt
        ? (() => { const d = Math.floor((Date.now() - new Date(profileUpdatedAt)) / (1000*60*60*24)); return d >= 30 ? `⚠️ 設定済（${d}日前に更新）` : `✓ 設定済（${d}日前に更新）`; })()
        : "✓ 設定済")
    : null;

  return (
    <div style={{ minHeight:"100vh", background:"#09090f", color:"#e2e8f0", display:"flex", flexDirection:"column", alignItems:"center", padding:"24px 16px 80px" }}>

      {/* Profile update notice */}
      {profileNotice && (
        <div style={{ width:"100%", maxWidth:720, marginBottom:12, padding:"10px 16px", background:"#1c1a07", border:"1px solid #78580f", borderRadius:8, display:"flex", justifyContent:"space-between", alignItems:"center", gap:12 }}>
          <span style={{ color:"#f59e0b", fontSize:13 }}>📅 プロフィールが{profileNotice}日間更新されていません。Claude.aiやChatGPTで最新情報を取得して更新することをおすすめします。</span>
          <button onClick={() => { setProfileNotice(false); sessionStorage.setItem("profile-notice-dismissed","1"); }} aria-label="通知を閉じる" style={{ background:"none", border:"none", color:"#f59e0b", cursor:"pointer", fontSize:16, padding:"0 4px", flexShrink:0 }}>✕</button>
        </div>
      )}

      {/* Header */}
      <div style={{ textAlign:"center", marginBottom:20, width:"100%", maxWidth:720 }}>
        <div style={{ fontSize:10, color:"#ffffff30", letterSpacing:"0.3em", marginBottom:6 }}>AI ROUNDTABLE</div>
        <h1 style={{ margin:"0 0 14px", fontSize:22, fontWeight:700, color:"#f1f5f9" }}>3 AI Discussion</h1>
        <div style={{ display:"flex", justifyContent:"center", gap:8, flexWrap:"wrap" }}>
          {MODELS.map((m) => <ModelBadge key={m.id} model={m} tag={cm[m.id].label} />)}
        </div>
      </div>

      <div style={{ width:"100%", maxWidth: started ? 1100 : 720 }}>

        {/* Mode */}
        <div style={{ display:"flex", gap:8, marginBottom:10 }}>
          <div role="radiogroup" aria-label="モード選択" style={{ display:"flex", background:"#10101a", border:"1px solid #2a2a3a", borderRadius:8, overflow:"hidden" }}>
            {[{id:"best",label:"🧠 最強"},{id:"fast",label:"⚡ 高速"}].map(({id,label}) => (
              <button key={id} role="radio" aria-checked={mode===id} onClick={() => setMode(id)} style={{ padding:"6px 14px", border:"none", cursor:"pointer", fontSize:12, fontWeight:600, background:mode===id?"#7c3aed":"transparent", color:mode===id?"#fff":"#ffffff50" }}>{label}</button>
            ))}
          </div>
        </div>

        {/* API Keys */}
        <Collapsible label="APIキー" badge={allKeysSet?"✓ 全て設定済":null} hint={!allKeysSet?"⚠ 未設定あり":null} open={showKeys} onToggle={() => setShowKeysPanel((s)=>!s)}>
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            {keyConfigs.map(({id,label,ph,link}) => (
              <div key={id}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4 }}>
                  <span style={{ fontSize:11, color:"#ffffff40", fontFamily:"monospace" }}>{label}</span>
                  <a href={link} target="_blank" rel="noopener noreferrer" style={{ fontSize:10, color:"#60a5fa80", textDecoration:"none" }}>取得 →</a>
                </div>
                <div style={{ display:"flex", gap:6 }}>
                  <input type="password" value={keys[id]} onChange={(e) => updateKey(id, e.target.value)} placeholder={ph} aria-label={label}
                    style={{ flex:1, background:"#09090f", border:`1px solid ${validationColor(id)}`, borderRadius:6, padding:"8px 10px", color:"#e2e8f0", fontSize:13, fontFamily:"monospace" }} />
                  <button onClick={() => validateKey(id, keys[id])} disabled={!keys[id] || keyStatus[id]==="checking"} aria-label={`${label} 疎通確認`}
                    style={{ padding:"8px 12px", background:"#1e3a5f", border:"1px solid #2a4a7f", borderRadius:6, color:keyStatus[id]==="ok"?"#4ade80":"#60a5fa", cursor:keys[id]?"pointer":"not-allowed", fontSize:11, fontWeight:600, whiteSpace:"nowrap" }}>
                    {keyStatus[id]==="checking"?"確認中..." : keyStatus[id]==="ok"?"✓ OK" : keyStatus[id]?.startsWith("error")?"✗ NG":"疎通確認"}
                  </button>
                </div>
                {keyStatus[id]?.startsWith("error") && (
                  <div style={{ fontSize:11, color:"#ef4444", marginTop:4 }}>{keyStatus[id]}</div>
                )}
              </div>
            ))}

            <div style={{ padding:"10px 12px", background:"#0d0d1a", border:"1px solid #2a2a3a", borderRadius:8, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div>
                <div style={{ fontSize:12, color:"#ffffff70", fontWeight:600 }}>このブラウザに保存する</div>
                <div style={{ fontSize:11, color:"#ffffff30", marginTop:2 }}>デフォルトはOFF。ONにするとlocalStorageに保存されます。</div>
              </div>
              <button onClick={() => toggleSaveKeys(!saveKeys)} aria-label={`ブラウザ保存 ${saveKeys?"OFF":"ON"}に切り替え`} style={{ padding:"6px 16px", border:"none", borderRadius:20, cursor:"pointer", fontSize:12, fontWeight:700, background:saveKeys?"#16a34a":"#2a2a3a", color:saveKeys?"#fff":"#ffffff50" }}>
                {saveKeys ? "ON" : "OFF"}
              </button>
            </div>

            <div style={{ fontSize:11, color:"#ffffff20", lineHeight:1.6 }}>
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
              style={{ width:"100%", background:"#09090f", border:"1px solid #2a2a3a", borderRadius:6, padding:10, color:"#e2e8f0", fontSize:13, lineHeight:1.7, resize:"vertical" }} />
            {profile.trim() && <button onClick={() => updateProfile("")} aria-label="プロフィールをクリア" style={{ alignSelf:"flex-end", background:"none", border:"1px solid #3a2a2a", borderRadius:6, padding:"4px 12px", color:"#ef444460", cursor:"pointer", fontSize:11 }}>クリア</button>}
          </div>
        </Collapsible>

        {/* Backup */}
        <Collapsible label="🔐 設定の暗号化バックアップ" open={showSave} onToggle={() => setShowSave((s)=>!s)}>
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            <div style={{ padding:"10px 12px", background:"#1c1207", border:"1px solid #78350f", borderRadius:8, fontSize:11, color:"#f59e0b", lineHeight:1.6 }}>
              ⚠ APIキーはAES-GCM（256bit）で暗号化されます。<br/>
              パスワードを忘れると復元できません。安全な場所に保管してください。
            </div>

            <div>
              <div style={{ fontSize:12, color:"#ffffff60", marginBottom:8 }}>① バックアップの作成</div>
              <input type="password" value={exportPw} onChange={(e) => setExportPw(e.target.value)} placeholder="バックアップ用パスワードを設定" aria-label="エクスポート用パスワード"
                style={{ width:"100%", background:"#09090f", border:"1px solid #2a2a3a", borderRadius:6, padding:"8px 10px", color:"#e2e8f0", fontSize:13, fontFamily:"monospace", marginBottom:8 }} />
              <button onClick={handleExport} disabled={!exportPw} style={{ width:"100%", background:exportPw?"#1e3a5f":"#1a1a2a", border:"1px solid #2a4a7f", borderRadius:8, padding:"10px 20px", color:"#fff", fontSize:13, cursor:exportPw?"pointer":"not-allowed", fontWeight:600, opacity:exportPw?1:0.5 }}>
                🔐 暗号化してコピー
              </button>
              {exportText && (
                <textarea readOnly value={exportText} rows={3} aria-label="暗号化されたバックアップ"
                  style={{ width:"100%", background:"#09090f", border:"1px solid #2a2a3a", borderRadius:6, padding:10, color:"#ffffff60", fontSize:10, resize:"none", fontFamily:"monospace", marginTop:8 }} />
              )}
            </div>

            <div style={{ height:1, background:"#2a2a3a" }} />

            <div>
              <div style={{ fontSize:12, color:"#ffffff60", marginBottom:8 }}>② バックアップから復元</div>
              <textarea value={importText} onChange={(e) => setImportText(e.target.value)} placeholder="バックアップテキストを貼り付け" rows={3} aria-label="バックアップテキスト"
                style={{ width:"100%", background:"#09090f", border:"1px solid #2a2a3a", borderRadius:6, padding:10, color:"#e2e8f0", fontSize:12, resize:"none", fontFamily:"monospace", marginBottom:8 }} />
              <input type="password" value={importPw} onChange={(e) => setImportPw(e.target.value)} placeholder="バックアップ時に設定したパスワード" aria-label="インポート用パスワード"
                style={{ width:"100%", background:"#09090f", border:"1px solid #2a2a3a", borderRadius:6, padding:"8px 10px", color:"#e2e8f0", fontSize:13, fontFamily:"monospace", marginBottom:8 }} />
              <button onClick={handleImport} disabled={!importText.trim()||!importPw} style={{ width:"100%", background:"#7c3aed", border:"none", borderRadius:8, padding:"10px 20px", color:"#fff", fontSize:13, cursor:(importText.trim()&&importPw)?"pointer":"not-allowed", fontWeight:600, opacity:(importText.trim()&&importPw)?1:0.4 }}>
                復元する
              </button>
            </div>

            {cryptoMsg && (
              <div style={{ fontSize:13, color:cryptoMsg.startsWith("✓")?"#4ade80":"#ef4444", textAlign:"center" }}>{cryptoMsg}</div>
            )}
          </div>
        </Collapsible>

        {/* Topic */}
        {!started && (
          <div style={{ background:"#10101a", border:"1px solid #2a2a3a", borderRadius:12, overflow:"hidden", marginTop:4 }}>
            <textarea value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={2000} aria-label="議題"
              onKeyDown={(e) => { if (e.key==="Enter"&&(e.metaKey||e.ctrlKey)) handleStart(); }}
              placeholder={"議題を入力...\n例: AIは人間の仕事を奪うか\nCtrl+Enter で開始"} rows={3}
              style={{ width:"100%", background:"transparent", border:"none", padding:14, color:"#e2e8f0", fontSize:14, lineHeight:1.7, resize:"vertical" }} />
            <div style={{ padding:"8px 12px", borderTop:"1px solid #1e1e2e", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <span style={{ fontSize:11, color:profile.trim()?"#4ade8060":"#ffffff20" }}>{profile.trim()?"👤 プロフィールあり":"👤 なし"}</span>
              <button onClick={handleStart} disabled={!topic.trim()||running||!allKeysSet}
                style={{ background:allKeysSet&&topic.trim()?"#7c3aed":"#2a2a3a", border:"none", borderRadius:8, padding:"8px 20px", color:"#fff", fontSize:13, fontWeight:700, cursor:(topic.trim()&&allKeysSet)?"pointer":"not-allowed", opacity:(topic.trim()&&allKeysSet)?1:0.35 }}>
                {!allKeysSet?"キーを設定してください":"▶ 開始"}
              </button>
            </div>
          </div>
        )}

        {/* Topic display */}
        {started && (
          <div style={{ padding:"10px 14px", background:"#13102a", border:"1px solid #4c1d9540", borderRadius:10, marginBottom:20, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <div>
              <div style={{ fontSize:10, color:"#ffffff30", fontFamily:"monospace", marginBottom:3 }}>議題{profile.trim()?" · 👤":""}</div>
              <div style={{ fontSize:14, color:"#c4b5fd", fontWeight:500 }}>{topic}</div>
            </div>
            <button onClick={handleReset} style={{ background:"none", border:"1px solid #3a2a5a", borderRadius:6, padding:"4px 10px", color:"#ffffff40", cursor:"pointer", fontSize:12 }}>リセット</button>
          </div>
        )}

        {/* Discussion */}
        {discussion.map((round, i) => (
          <RoundSection key={i} round={round} roundNum={i+1} isLatest={i===discussion.length-1} />
        ))}

        {/* Stop button */}
        {running && (
          <div style={{ textAlign:"center", marginTop:8 }}>
            <button onClick={handleStop} style={{ background:"none", border:"1px solid #ef4444", borderRadius:20, padding:"8px 24px", color:"#ef4444", cursor:"pointer", fontSize:13, fontWeight:600 }}>
              ⏹ 停止
            </button>
          </div>
        )}

        {/* User intervention + next round */}
        {showIntervention && !running && discussion.length > 0 && (
          <div style={{ marginTop:16, display:"flex", flexDirection:"column", gap:10 }}>
            <div style={{ background:"#10101a", border:"1px solid #4c1d95", borderRadius:12, overflow:"hidden" }}>
              <textarea value={intervention} onChange={(e) => setIntervention(e.target.value)} maxLength={1000} aria-label="司会者介入"
                placeholder="💬 司会者として介入する（任意）\n例: 経済的影響についてもっと掘り下げてください"
                rows={2}
                style={{ width:"100%", background:"transparent", border:"none", padding:"12px 14px", color:"#c4b5fd", fontSize:13, lineHeight:1.6, resize:"none" }} />
            </div>
            <div style={{ textAlign:"center" }}>
              <button onClick={handleNextRound} style={{ background:"none", border:"1px solid #7c3aed", borderRadius:20, padding:"10px 28px", color:"#a78bfa", cursor:"pointer", fontSize:13, fontWeight:600 }}>
                ↻ 次のラウンドへ（Round {discussion.length+1}）
              </button>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
