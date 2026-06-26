import { lazy } from "react";
import HelpHint from "./HelpHint";

const SecurityPanel = lazy(() => import("./SecurityPanel"));

const cardStyle = { marginTop:8, marginBottom:10, padding:14, background:"var(--surface)", border:"1px solid var(--border)", borderRadius:10 };

// The expandable settings panels (API keys / security / profile / constitution /
// backup) toggled from the options bar. Extracted from App to keep that file
// focused on orchestration. All state still lives in App and is passed in.
export default function ExpandedPanels({
  activePanel,
  keyConfigs, keys, updateKey, keyStatus, validateKey, validationColor,
  isPremium, useOwnKeys, preferOwnKeys, setPreferOwnKeys, allKeysSet,
  profile, updateProfile,
  constitution, updateConstitution,
  crypto,
}) {
  if (activePanel === "keys") {
    return (
      <div style={cardStyle}>
        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          {keyConfigs.map(({ id, label, ph, link }) => (
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

          {/* Premium-only: spend own keys instead of the plan budget */}
          {isPremium && (
            <div style={{ marginTop:4, padding:"12px 14px", background:"var(--bg)", border:`1px solid ${useOwnKeys ? "var(--success)" : "var(--border)"}`, borderRadius:8 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:10 }}>
                <span style={{ fontSize:13, fontWeight:600, color:"var(--text)" }}>🔑 自分のキーを優先</span>
                <button onClick={() => setPreferOwnKeys(!preferOwnKeys)} role="switch" aria-checked={preferOwnKeys} aria-label="自分のキーを優先"
                  style={{ padding:"5px 14px", border:`1px solid ${preferOwnKeys ? "var(--success)" : "var(--border)"}`, borderRadius:20, cursor:"pointer", fontSize:12, fontWeight:700, background:preferOwnKeys?"var(--success)":"transparent", color:preferOwnKeys?"#fff":"var(--text2)", whiteSpace:"nowrap" }}>
                  {preferOwnKeys ? "ON" : "OFF"}
                </button>
              </div>
              <div style={{ fontSize:11, color:"var(--text2)", lineHeight:1.7, marginTop:8 }}>
                ONにすると、プレミアム加入中でも<b style={{ color:"var(--text)" }}>自分のAPIキーで実行</b>し、<b style={{ color:"var(--text)" }}>プランの月間枠を消費しません</b>。3つすべてのキーが必要です。Web検索は運営側機能のため、ON中は無効になります。
              </div>
              {preferOwnKeys && !allKeysSet && (
                <div style={{ fontSize:11, color:"var(--warning)", marginTop:6 }}>
                  ⚠ キーが未設定の項目があるため、現在はプラン枠で実行されます。3つすべて設定すると自分のキーに切り替わります。
                </div>
              )}
              {useOwnKeys && (
                <div style={{ fontSize:11, color:"var(--success)", marginTop:6 }}>
                  ✓ 現在「自分のキー」で実行中（プラン枠は消費しません）
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (activePanel === "security") {
    return <div style={{ marginTop:8, marginBottom:10 }}><SecurityPanel /></div>;
  }

  if (activePanel === "profile") {
    return (
      <div style={cardStyle}>
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
    );
  }

  if (activePanel === "constitution") {
    return (
      <div style={cardStyle}>
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
    );
  }

  if (activePanel === "backup") {
    return (
      <div style={cardStyle}>
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
    );
  }

  return null;
}
