import HelpHint from "./HelpHint";

// "最終ジャッジ": the single, decisive recommendation distilled from the debate —
// Fugu's "one answer" deliverable, but each contested point is resolved with a
// stated reason + confidence, and the full debate stays visible above it.
const CONF = {
  high:   { label: "確信度 高", color: "var(--success)", bg: "var(--success-bg)", bd: "var(--success)" },
  medium: { label: "確信度 中", color: "var(--warning)", bg: "var(--warning-bg)", bd: "var(--warning-bd)" },
  low:    { label: "確信度 低", color: "var(--text3)",   bg: "var(--bg)",         bd: "var(--border)" },
};
const confOf = (c) => CONF[c] || CONF.medium;

function ConfBadge({ value, small }) {
  const c = confOf(value);
  return (
    <span style={{ display:"inline-block", fontSize:small?10:11, fontWeight:700, color:c.color, background:c.bg, border:`1px solid ${c.bd}`, borderRadius:5, padding:small?"0 5px":"1px 7px", whiteSpace:"nowrap" }}>
      {small ? c.label.replace("確信度 ", "") : c.label}
    </span>
  );
}

export default function FinalVerdict({ verdict, loading, onGenerate, onSaveImage }) {
  if (!verdict && !loading) {
    return (
      <div style={{ textAlign:"center", marginBottom:20 }}>
        <button onClick={onGenerate}
          title="議論を踏まえ、各対立点を検証して『最も妥当な単一の推奨』を生成します"
          style={{ background:"var(--accent)", border:"none", borderRadius:24, padding:"12px 26px", color:"#fff", cursor:"pointer", fontSize:14, fontWeight:700 }}>
          🏛️ 最終ジャッジを出す
        </button>
        <HelpHint style={{ marginTop:6 }}>
          3者の議論から「結論を1つ」に。各対立点を妥当性・確度つきで判定します（GPT-5.4 mini 使用、約0.005ドル）。Fuguと違い、根拠と議論はすべて見えたままです
        </HelpHint>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ padding:16, background:"var(--surface)", border:"1px solid var(--accent-bd)", borderRadius:12, marginBottom:20 }}>
        <div style={{ color:"var(--text3)", fontSize:13, animation:"pulse 1.2s infinite" }}>🏛️ 最終ジャッジを検証中…</div>
      </div>
    );
  }

  return (
    <div style={{ background:"var(--surface)", border:"2px solid var(--accent)", borderRadius:12, marginBottom:20, overflow:"hidden" }}>
      <div style={{ display:"flex", alignItems:"center", gap:10, padding:"12px 16px", background:"var(--accent-bg)", flexWrap:"wrap" }}>
        <span style={{ fontSize:14, fontWeight:700, color:"var(--text)" }}>🏛️ 最終ジャッジ</span>
        <ConfBadge value={verdict.confidence} />
        <span style={{ marginLeft:"auto", display:"flex", gap:6 }}>
          {onSaveImage && !verdict.error && (
            <button onClick={onSaveImage} title="結論カードを画像(PNG)で保存（SNS共有用）" style={{ background:"none", border:"1px solid var(--accent-bd)", borderRadius:6, padding:"3px 10px", color:"var(--accent-light)", cursor:"pointer", fontSize:11 }}>📸 画像で保存</button>
          )}
          <button onClick={onGenerate} title="再生成" style={{ background:"none", border:"1px solid var(--accent-bd)", borderRadius:6, padding:"3px 10px", color:"var(--accent-light)", cursor:"pointer", fontSize:11 }}>↻ 再生成</button>
        </span>
      </div>

      <div style={{ padding:"14px 16px" }}>
        {/* The single recommendation */}
        <div style={{ fontSize:15, fontWeight:600, color:"var(--text)", lineHeight:1.7, marginBottom:verdict.resolved?.length ? 14 : 0 }}>
          {verdict.recommendation}
        </div>

        {/* Per-disagreement resolution (the visible reasoning Fugu hides) */}
        {verdict.resolved?.length > 0 && (
          <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:verdict.caveats?.length||verdict.decisionHint ? 14 : 0 }}>
            <div style={{ fontSize:11, color:"var(--text3)", fontWeight:700 }}>⚖️ 対立点ごとの判定</div>
            {verdict.resolved.map((r, i) => (
              <div key={i} style={{ padding:"8px 12px", background:"var(--bg)", borderLeft:"3px solid var(--accent)", borderRadius:6 }}>
                <div style={{ display:"flex", alignItems:"center", gap:6, flexWrap:"wrap", marginBottom:3 }}>
                  <span style={{ fontSize:12, color:"var(--text2)" }}>{r.point}</span>
                  <span style={{ color:"var(--text3)", fontSize:11 }}>→</span>
                  <span style={{ fontSize:12.5, fontWeight:700, color:"var(--text)" }}>{r.verdict}</span>
                  <ConfBadge value={r.confidence} small />
                </div>
                {r.reason && <div style={{ fontSize:11.5, color:"var(--text3)", lineHeight:1.5 }}>根拠: {r.reason}</div>}
              </div>
            ))}
          </div>
        )}

        {/* Caveats */}
        {verdict.caveats?.length > 0 && (
          <div style={{ marginBottom:verdict.decisionHint ? 12 : 0 }}>
            <div style={{ fontSize:11, color:"var(--warning)", fontWeight:700, marginBottom:4 }}>⚠ この結論が崩れる条件</div>
            <ul style={{ margin:0, paddingLeft:18, fontSize:12, color:"var(--text2)", lineHeight:1.6 }}>
              {verdict.caveats.map((c, i) => <li key={i}>{c}</li>)}
            </ul>
          </div>
        )}

        {/* The decision is yours — what to check last */}
        {verdict.decisionHint && (
          <div style={{ padding:"10px 12px", background:"var(--accent-bg)", border:"1px solid var(--accent-bd)", borderRadius:8, fontSize:12.5, color:"var(--text)", lineHeight:1.6 }}>
            🧑‍⚖️ 最終判断はあなたが。確認すべき1点: <b>{verdict.decisionHint}</b>
          </div>
        )}
      </div>
    </div>
  );
}
