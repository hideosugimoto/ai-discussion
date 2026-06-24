// Compact, fixed usage indicator that appears once the user scrolls past the
// top PlanBadge — so they can check remaining usage mid-discussion without
// scrolling back up. Tapping it scrolls to the top (full badge + management).
export default function UsagePill({ usage, estimate, onClick }) {
  const percent = (usage?.usage_percent ?? 0).toFixed(0);
  return (
    <button
      onClick={onClick}
      aria-label="使用量を表示（上部へスクロール）"
      title="残りの目安。タップで上部の使用量・プラン管理へ"
      style={{
        position:"fixed", top:8, left:"50%", transform:"translateX(-50%)", zIndex:100,
        display:"flex", alignItems:"center", gap:8, maxWidth:"calc(100vw - 24px)",
        padding:"6px 14px", background:"var(--surface)", border:"1px solid var(--success, #22c55e)",
        borderRadius:20, cursor:"pointer", boxShadow:"0 3px 12px rgba(0,0,0,0.22)",
        fontFamily:"monospace", fontSize:12, color:"var(--text)", whiteSpace:"nowrap",
      }}
    >
      {estimate && (
        <span style={{ fontWeight:600 }}>残り ⚡{estimate.fastRounds} / 🧠{estimate.bestRounds}</span>
      )}
      <span style={{ color:"var(--text2)" }}>使用 {percent}%</span>
      <span style={{ color:"var(--text3)" }}>▴</span>
    </button>
  );
}
