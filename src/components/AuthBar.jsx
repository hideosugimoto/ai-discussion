import { useHelp } from "../hooks/useHelp.jsx";

// Top header bar: help toggle + login state.
export default function AuthBar({ auth, usage }) {
  const help = useHelp();
  return (
    <div style={{ width:"100%", maxWidth:900, display:"flex", justifyContent:"flex-end", alignItems:"center", gap:8, marginBottom:8 }}>
      <button
        onClick={help.toggle}
        aria-label={help.helpMode ? "ヘルプ表示をオフにする" : "ヘルプ表示をオンにする"}
        title={help.helpMode ? "ヘルプ表示をオフ" : "各ボタンの説明を表示"}
        style={{ padding:"4px 10px", border:`1px solid ${help.helpMode ? "var(--accent)" : "var(--border)"}`, borderRadius:6, background:help.helpMode?"var(--accent-bg)":"transparent", color:help.helpMode?"var(--accent-light)":"var(--text3)", cursor:"pointer", fontSize:11 }}
      >
        ❓ ヘルプ {help.helpMode ? "ON" : "OFF"}
      </button>
      {auth.user ? (
        <>
          {auth.isPremium && usage && (
            <span style={{ fontSize:11, color:"var(--success)", fontFamily:"monospace" }}>
              残り {usage.usage_percent != null ? `${Math.round(100 - usage.usage_percent)}%` : "---"}
              {usage.credits_usd > 0 && <span style={{ color:"var(--accent-light)" }}> +C</span>}
            </span>
          )}
          <span style={{ fontSize:12, color:"var(--text2)" }}>{auth.user.name}</span>
          {auth.user.picture && <img src={auth.user.picture} alt="" style={{ width:24, height:24, borderRadius:"50%" }} referrerPolicy="no-referrer" />}
          <button
            onClick={auth.logout}
            title="ログアウト（端末内のAPIキー・履歴は残ります）"
            style={{ padding:"4px 10px", border:"1px solid var(--border)", borderRadius:6, background:"transparent", color:"var(--text3)", cursor:"pointer", fontSize:11 }}
          >
            ログアウト
          </button>
        </>
      ) : (
        <button
          onClick={auth.login}
          title="Googleでログインしてプラン管理・クラウド同期・共有リンクを利用"
          style={{ padding:"6px 14px", border:"1px solid var(--accent)", borderRadius:8, background:"var(--accent-bg)", color:"var(--accent-light)", cursor:"pointer", fontSize:12, fontWeight:600 }}
        >
          Googleでログイン
        </button>
      )}
    </div>
  );
}
