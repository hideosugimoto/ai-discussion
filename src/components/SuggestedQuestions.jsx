import { useState } from "react";
import { SUGGESTED_QUESTIONS, QUESTION_CATEGORIES } from "../suggestedQuestions";
import { DISCUSSION_MODES } from "../constants";

const MODE_LABEL = Object.fromEntries(DISCUSSION_MODES.map((m) => [m.id, m.label]));

export default function SuggestedQuestions({ onSelect, hasProfile }) {
  const [activeCategory, setActiveCategory] = useState("self");
  const filtered = SUGGESTED_QUESTIONS.filter((q) => q.category === activeCategory);

  return (
    <div style={{ marginTop:8, marginBottom:10, padding:14, background:"var(--surface)", border:"1px solid var(--border)", borderRadius:10 }}>
      <div style={{ fontSize:12, color:"var(--text2)", marginBottom:10, lineHeight:1.6 }}>
        💡 何を聞けばいいか迷ったら、ここからどうぞ。クリックすると議題と推奨モードが自動セットされます。
        {!hasProfile && (
          <div style={{ marginTop:6, padding:"6px 10px", background:"var(--warning-bg)", border:"1px solid var(--warning-bd)", borderRadius:6, fontSize:11, color:"var(--warning)" }}>
            ⚠ プロフィール未入力です。「自分への質問」はプロフィールを入れるとAIの回答が劇的に深くなります。
          </div>
        )}
      </div>

      {/* カテゴリタブ */}
      <div role="tablist" aria-label="質問カテゴリ" style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:12 }}>
        {QUESTION_CATEGORIES.map((c) => (
          <button key={c.id} role="tab" aria-selected={activeCategory===c.id} onClick={() => setActiveCategory(c.id)}
            style={{ padding:"5px 11px", border:`1px solid ${activeCategory===c.id?"var(--accent-bd)":"var(--border)"}`, borderRadius:16, cursor:"pointer", fontSize:11, fontWeight:600, background:activeCategory===c.id?"var(--accent)":"transparent", color:activeCategory===c.id?"#fff":"var(--text2)" }}>
            {c.label}
          </button>
        ))}
      </div>

      {/* 質問リスト */}
      <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
        {filtered.map((q) => {
          const dimmed = q.needsProfile && !hasProfile;
          return (
            <button key={q.id} onClick={() => onSelect(q)}
              style={{ textAlign:"left", padding:"10px 12px", background:"var(--bg)", border:"1px solid var(--border)", borderRadius:8, cursor:"pointer", display:"flex", flexDirection:"column", gap:6, opacity:dimmed?0.6:1 }}>
              <div style={{ fontSize:13, color:"var(--text)", lineHeight:1.6 }}>{q.text}</div>
              <div style={{ display:"flex", alignItems:"center", gap:8, fontSize:10, color:"var(--text3)" }}>
                <span style={{ padding:"2px 8px", background:"var(--accent-bg)", border:"1px solid var(--accent-bd)", borderRadius:10, color:"var(--accent-light)", fontWeight:600 }}>
                  推奨: {MODE_LABEL[q.mode] || q.mode}
                </span>
                {q.needsProfile && (
                  <span style={{ color:hasProfile?"var(--success)":"var(--warning)" }}>
                    {hasProfile ? "👤 プロフィール反映" : "👤 プロフィール推奨"}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
