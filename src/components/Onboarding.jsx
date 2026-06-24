import PlanPicker from "./PlanPicker";

// First-run value proposition shown when the user cannot start yet (no API keys
// and not premium). Replaces the old bare "set your API keys" warning with a
// clear explanation of what the product does and two paths to start:
//   1) Login → Premium (no keys, the monetised path) — promoted as primary.
//   2) Bring your own API keys (free app, user pays providers) — secondary.
export default function Onboarding({ isLoggedIn, onLogin, onUseKeys, onPickPlan }) {
  return (
    <div style={{ marginBottom:16, padding:"18px 18px 16px", background:"var(--surface)", border:"1px solid var(--accent-bd)", borderRadius:12 }}>
      <div style={{ fontSize:16, fontWeight:700, color:"var(--text)", marginBottom:6, lineHeight:1.5 }}>
        ✨ 3つのAIが議論し、結論まで自動でまとめます
      </div>
      <div style={{ fontSize:13, color:"var(--text2)", lineHeight:1.7, marginBottom:12 }}>
        ChatGPT・Claude・Gemini が同じ議題を多角的に議論。<b style={{ color:"var(--text)" }}>合意点・対立点・最終結論</b>まで整理して提示します。AIを1つずつ試して比べる必要はもうありません。
      </div>

      <div style={{ display:"flex", gap:14, flexWrap:"wrap", fontSize:12, color:"var(--text2)", marginBottom:16 }}>
        <span>🔭 多角的な視点</span>
        <span>🤝 合意・対立を可視化</span>
        <span>📋 結論・アクションプラン</span>
        <span>📂 履歴・共有</span>
      </div>

      {!isLoggedIn ? (
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          <button
            onClick={onLogin}
            style={{ alignSelf:"flex-start", padding:"11px 22px", background:"var(--accent)", border:"none", borderRadius:10, color:"#fff", cursor:"pointer", fontSize:14, fontWeight:700 }}
          >
            ▶ Googleでログインして始める
          </button>
          <div style={{ fontSize:11, color:"var(--text3)" }}>
            月¥980〜・<b style={{ color:"var(--text2)" }}>APIキー不要</b>ですぐ開始。クラウド履歴・共有リンクも利用可。
          </div>
          <button
            onClick={onUseKeys}
            style={{ alignSelf:"flex-start", background:"none", border:"none", color:"var(--link)", cursor:"pointer", fontSize:12, textDecoration:"underline", textUnderlineOffset:2, padding:"2px 0" }}
          >
            または、自分のAPIキーで無料で使う →
          </button>
        </div>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          <PlanPicker onPick={onPickPlan} />
          <button
            onClick={onUseKeys}
            style={{ alignSelf:"flex-start", background:"none", border:"none", color:"var(--link)", cursor:"pointer", fontSize:12, textDecoration:"underline", textUnderlineOffset:2, padding:"2px 0" }}
          >
            または、自分のAPIキーで無料で使う →
          </button>
        </div>
      )}
    </div>
  );
}
