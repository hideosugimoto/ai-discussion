import HelpHint from "./HelpHint";

// Premium / Plus active subscription badge with credit purchase + plan
// management buttons. Rendered at the top of the page when user is logged
// in and has a paid plan.
export default function PlanBadge({ plan, usage, token, onCreditPurchase }) {
  const handleManagePlan = async () => {
    try {
      const res = await fetch("/api/billing/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Request failed");
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch {
      alert("プラン管理ページの取得に失敗しました。再度お試しください。");
    }
  };

  return (
    <>
      <div style={{ width:"100%", maxWidth:900, marginBottom:8, padding:"8px 14px", background:"var(--success-bg, rgba(34,197,94,0.1))", border:"1px solid var(--success, #22c55e)", borderRadius:8, fontSize:12, color:"var(--success, #22c55e)", display:"flex", justifyContent:"center", alignItems:"center", gap:10, flexWrap:"wrap" }}>
        <span style={{ fontWeight:600 }}>{plan === "plus" ? "Plus Plan" : "Premium Plan"}</span>
        {usage && (
          <span style={{ fontFamily:"monospace", fontSize:11, color:"var(--text2)" }}>
            使用量: {(usage.usage_percent ?? 0).toFixed(0)}%
          </span>
        )}
        <button
          onClick={onCreditPurchase}
          title="500円で月内クレジットを追加（購入月末まで有効）"
          style={{ padding:"3px 10px", border:"1px solid var(--accent-bd)", borderRadius:4, background:"var(--accent-bg)", color:"var(--accent-light)", cursor:"pointer", fontSize:11 }}
        >
          ＋クレジット
        </button>
        <button
          onClick={handleManagePlan}
          title="Stripe のページに移動して支払い方法・解約・領収書などを管理"
          style={{ padding:"3px 10px", border:"1px solid var(--success, #22c55e)", borderRadius:4, background:"transparent", color:"var(--success, #22c55e)", cursor:"pointer", fontSize:11 }}
        >
          プラン管理
        </button>
      </div>
      <div style={{ width:"100%", maxWidth:900, marginBottom:8 }}>
        <HelpHint>
          「＋クレジット」= 月の上限を超えそうな時に 500円で追加（購入月末まで有効）／「プラン管理」= 解約・支払方法・領収書
        </HelpHint>
      </div>
    </>
  );
}
