// Premium / Plus subscription plan selection cards.
// Shown to logged-in non-paying users in the API keys panel.
export default function PlanPicker({ onPick }) {
  return (
    <div style={{ marginBottom:12, padding:"14px 16px", background:"var(--accent-bg)", border:"1px solid var(--accent-bd)", borderRadius:10 }}>
      <div style={{ fontSize:13, fontWeight:700, color:"var(--accent-light)", marginBottom:10 }}>サブスクリプションプラン</div>
      <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
        <div style={{ flex:"1 1 240px", padding:"12px 14px", background:"var(--bg)", border:"1px solid var(--border)", borderRadius:8 }}>
          <div style={{ fontSize:12, color:"var(--text3)", marginBottom:4 }}>ライト</div>
          <div style={{ fontSize:16, fontWeight:700, color:"var(--text)" }}>Premium</div>
          <div style={{ fontSize:13, color:"var(--text2)", marginBottom:8 }}>980円 / 月</div>
          <ul style={{ margin:"0 0 10px 16px", padding:0, fontSize:11, color:"var(--text2)", lineHeight:1.7 }}>
            <li>月間 約8〜40議論（モデル・ラウンド数で変動）</li>
            <li>APIキー不要</li>
            <li>クラウド同期履歴・全文検索</li>
            <li>共有リンク作成</li>
          </ul>
          <button
            onClick={() => onPick("premium")}
            style={{ width:"100%", padding:"8px 14px", background:"var(--accent)", border:"none", borderRadius:6, color:"#fff", cursor:"pointer", fontSize:12, fontWeight:600 }}
          >
            Premium にする
          </button>
        </div>
        <div style={{ flex:"1 1 240px", padding:"12px 14px", background:"var(--bg)", border:"1px solid var(--accent)", borderRadius:8, position:"relative" }}>
          <div style={{ position:"absolute", top:-8, right:10, padding:"2px 8px", background:"var(--accent)", color:"#fff", fontSize:9, borderRadius:4, fontWeight:700 }}>HEAVY</div>
          <div style={{ fontSize:12, color:"var(--text3)", marginBottom:4 }}>ヘビー</div>
          <div style={{ fontSize:16, fontWeight:700, color:"var(--text)" }}>Plus</div>
          <div style={{ fontSize:13, color:"var(--text2)", marginBottom:8 }}>1,980円 / 月</div>
          <ul style={{ margin:"0 0 10px 16px", padding:0, fontSize:11, color:"var(--text2)", lineHeight:1.7 }}>
            <li>月間 約17〜90議論（モデル・ラウンド数で変動）</li>
            <li>Premium の全機能</li>
            <li>追加クレジット購入もOK</li>
          </ul>
          <button
            onClick={() => onPick("plus")}
            style={{ width:"100%", padding:"8px 14px", background:"var(--accent)", border:"none", borderRadius:6, color:"#fff", cursor:"pointer", fontSize:12, fontWeight:600 }}
          >
            Plus にする
          </button>
        </div>
      </div>
      <div style={{ marginTop:10, fontSize:10, color:"var(--text3)", lineHeight:1.6 }}>
        ※ いつでもキャンセル可能。月の途中で Premium → Plus 変更時は Stripe の比例計算で差額のみ請求されます。
      </div>
    </div>
  );
}
