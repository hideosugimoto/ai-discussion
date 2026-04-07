import { useState } from "react";
import HelpHint from "./HelpHint";

const PRIORITY_STYLES = {
  high:   { color: "var(--error)",   label: "高", icon: "▲" },
  medium: { color: "var(--warning)", label: "中", icon: "■" },
  low:    { color: "var(--success)", label: "低", icon: "●" },
};

export default function ActionPlanView({ plan, loading, onGenerate }) {
  const [open, setOpen] = useState(true);

  if (!plan && !loading) {
    return (
      <div style={{ textAlign:"center", marginTop:16 }}>
        <button onClick={onGenerate}
          title="議論全体を要約し、優先度・期限付きの実行可能なアクションを自動生成"
          style={{ background:"var(--accent)", border:"none", borderRadius:20, padding:"10px 24px", color:"#fff", cursor:"pointer", fontSize:13, fontWeight:600 }}>
          📋 アクションプランを生成
        </button>
        <HelpHint style={{ marginTop: 6 }}>
          議論を踏まえて「結論／優先度付きアクション／リスク／次に議論すべきテーマ」を自動生成します（GPT-4o-mini 使用、約0.001ドル）
        </HelpHint>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ padding:14, background:"var(--surface)", border:"1px solid var(--border)", borderRadius:10, marginTop:16 }}>
        <div style={{ color:"var(--text3)", fontSize:13, animation:"pulse 1.2s infinite" }}>アクションプラン生成中...</div>
      </div>
    );
  }

  return (
    <div className="action-plan-card" style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:10, overflow:"hidden", marginTop:16 }}>
      <button onClick={() => setOpen((o) => !o)} style={{ width:"100%", background:"none", border:"none", padding:"12px 14px", cursor:"pointer", display:"flex", alignItems:"center", gap:8, color:"var(--text)", fontSize:13, fontWeight:600 }}>
        <span>{open ? "▾" : "▸"}</span>
        <span>📋 アクションプラン</span>
      </button>

      {open && (
        <div style={{ padding:"0 14px 14px" }}>
          {/* Conclusion */}
          {plan.conclusion && (
            <div style={{ padding:"10px 12px", background:"var(--accent-bg)", borderRadius:8, marginBottom:12, fontSize:13, color:"var(--text)", fontWeight:500 }}>
              💡 {plan.conclusion}
            </div>
          )}

          {/* Actions */}
          {plan.actions?.length > 0 && (
            <div style={{ marginBottom:12 }}>
              <div style={{ fontSize:12, fontWeight:700, color:"var(--text2)", marginBottom:8 }}>アクション（{plan.actions.length}件）</div>
              {plan.actions.map((action, i) => {
                const ps = PRIORITY_STYLES[action.priority] || PRIORITY_STYLES.low;
                return (
                  <div key={i} style={{ padding:"8px 10px", marginBottom:4, borderRadius:6, background:"var(--bg)", borderLeft:`3px solid ${ps.color}`, fontSize:13 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:2 }}>
                      <span style={{ color:ps.color, fontSize:11 }}>{ps.icon} {ps.label}</span>
                      <span style={{ fontSize:10, color:"var(--text3)", background:"var(--surface)", padding:"1px 6px", borderRadius:8 }}>{action.timeframe}</span>
                    </div>
                    <div style={{ color:"var(--text)", fontWeight:500 }}>{action.task}</div>
                    {action.rationale && (
                      <div style={{ fontSize:11, color:"var(--text3)", marginTop:2 }}>{action.rationale}</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Risks */}
          {plan.risks?.length > 0 && (
            <div style={{ marginBottom:12 }}>
              <div style={{ fontSize:12, fontWeight:700, color:"var(--warning)", marginBottom:6 }}>⚠ リスク</div>
              {plan.risks.map((risk, i) => (
                <div key={i} style={{ fontSize:12, color:"var(--text2)", padding:"2px 0" }}>・{risk}</div>
              ))}
            </div>
          )}

          {/* Next Question */}
          {plan.nextQuestion && (
            <div style={{ padding:"8px 12px", background:"var(--bg)", borderRadius:8, fontSize:12 }}>
              <span style={{ color:"var(--text3)" }}>💬 次に議論すべきテーマ: </span>
              <span style={{ color:"var(--accent-light)" }}>{plan.nextQuestion}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
